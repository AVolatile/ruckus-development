import { broadcastRoom, retireRoom } from "./broadcast.js";
import { HistoryOutbox } from "./history/outbox.js";
import { HistoryWorker } from "./history/worker.js";
import { Lifecycle } from "./ops/lifecycle.js";
import { Readiness } from "./ops/readiness.js";
import { log, metrics, failureCode } from "./ops/log.js";
import { socketClientAddress } from "./ops/client-address.js";
import {
  SessionFinalizer,
  type HistoryPersistence,
} from "./history/finalizer.js";
import {
  buildSessionSummary,
  type SummaryContext,
} from "./history/outcomes.js";
import { personalWorkspace } from "./workspaces/policy.js";
import { gameById } from "../shared/catalog.js";
import { ContentPackService } from "./content-packs/service.js";
import { GAME_IDS } from "../shared/types.js";
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { Server } from "socket.io";
import { validateBoard, boardSchema } from "../shared/boards.js";
import { allowedOrigins, getPublicJoinUrl, publicAppOrigin } from "./config.js";
import { REACTIONS } from "../shared/catalog.js";
import type {
  ClientEvents,
  ServerEvents,
  Reply,
  Identity,
} from "../shared/types.js";
import { Room, makeCode } from "./engine.js";
import {
  actionSchema,
  identitySchema,
  inputSchema,
  joinSchema,
  RateLimiter,
  settingsSchema,
} from "./validation.js";
import { z } from "zod/v3";
import { installHostApi } from "./api/http.js";
import { ApiError } from "./api/errors.js";
import { BoardService } from "./boards/service.js";
import { db, pool, auth, config } from "./auth/config.js";
import { fromNodeHeaders } from "better-auth/node";
import { DrizzleQueryError } from "drizzle-orm";
const app = express();
const http = createServer(app);
const port = config.port;
const lifecycle = new Lifecycle(config.draining);
const readiness = new Readiness(config.databaseUrl, () => lifecycle.draining);
const origins = allowedOrigins();
publicAppOrigin();
if (
  process.env.NODE_ENV === "production" &&
  process.env.REALTIME_ONLY === "true" &&
  !origins.length
)
  throw new Error("CLIENT_ORIGIN is required for public realtime hosting.");
const io = new Server<ClientEvents, ServerEvents>(http, {
  maxHttpBufferSize: 300_000,
  cors: {
    origin: (origin, callback) =>
      callback(null, !origin || origins.includes(origin)),
    methods: ["GET", "POST"],
  },
  serveClient: false,
  allowRequest: (req, cb) => {
    const origin = req.headers.origin;
    if (!origin) return cb(null, true);
    try {
      const url = new URL(origin);
      cb(
        null,
        origins.includes(origin) ||
          (process.env.REALTIME_ONLY !== "true" &&
            url.host === req.headers.host),
      );
    } catch {
      cb(null, false);
    }
  },
});
import { EventRuntime } from "./events/runtime.js";
import { EventService } from "./events/service.js";
import { eventCommandSchema } from "../shared/events.js";
type LiveRoom = Room | EventRuntime;
const rooms = new Map<string, LiveRoom>();
const outbox = new HistoryOutbox(db);
function historyUpdate(id: string, status: "saved" | "failed") {
  for (const room of rooms.values()) {
    const state = historyState.get(room);
    if (state?.runId !== id || !state.persistence) continue;
    state.persistence = { ...state.persistence, status };
    broadcast(room);
  }
}
const historyWriter = new SessionFinalizer(
  async (summary) => {
    try {
      const status = await outbox.enqueue(summary);
      if (status === "saved") historyUpdate(summary.id, "saved");
      if (status === "retired") historyUpdate(summary.id, "failed");
      log("history.handoff", {
        sessionId: summary.id,
        workspaceId: summary.workspaceId,
        result: status,
      });
    } catch (error) {
      metrics.enqueueFailures++;
      log(
        "history.handoff_failed",
        { sessionId: summary.id, code: failureCode(error) },
        "error",
      );
      throw error;
    }
  },
  [250, 1000, 3000],
  () => {},
  "pending",
);
const historyWorker = new HistoryWorker(
  outbox,
  () => readiness.dependencyReady(),
  historyUpdate,
  config.workerConcurrency,
  config.workerPollMs,
);
const historyState = new WeakMap<
  LiveRoom,
  {
    runId: string;
    attempted: boolean;
    context?: SummaryContext;
    persistence?: HistoryPersistence;
  }
>();
function finalizeHistory(room: LiveRoom) {
  const runId =
    room instanceof EventRuntime ? room.snapshot.id : room.outcomes.runId;
  let state = historyState.get(room);
  if (!state) {
    state = { runId, attempted: false };
    historyState.set(room, state);
  }
  if (state.runId !== runId) {
    state = { runId, attempted: false, context: state.context };
    historyState.set(room, state);
  }
  const terminal =
    room instanceof EventRuntime
      ? ["EVENT_FINAL", "ENDED"].includes(room.state)
      : ["final", "ended"].includes(room.phase);
  if (!terminal || state.attempted) return;
  state.attempted = true;
  try {
    const summary =
      room instanceof EventRuntime
        ? room.historySummary()
        : state.context
          ? buildSessionSummary(room, state.context)
          : null;
    if (summary)
      void historyWriter.submit(summary, (persistence) => {
        if (state!.runId !== summary.id || historyState.get(room) !== state)
          return;
        if (
          ["saved", "failed"].includes(state!.persistence?.status ?? "") &&
          persistence.status === "pending"
        )
          return;
        state!.persistence = persistence;
        broadcast(room);
      });
  } catch {
    state.persistence = {
      status: "failed",
      sessionId: runId,
      workspaceId:
        room instanceof EventRuntime
          ? room.snapshot.workspaceId
          : state.context!.workspaceId,
    };
    log("session.summary_failed", { sessionId: runId }, "error");
  }
}
function roomView(
  room: LiveRoom,
  playerId?: string,
  includeHistory = !playerId,
) {
  const view = room.view(playerId);
  return !includeHistory
    ? view
    : { ...view, history: historyState.get(room)?.persistence };
}
const limiter = new RateLimiter();
const addresses = Object.values(networkInterfaces())
  .flatMap((n) => n ?? [])
  .filter((n) => n.family === "IPv4" && !n.internal)
  .map((n) => n.address);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.get(["/api/health", "/health", "/healthz"], (_req, res) =>
  res.set("Cache-Control", "no-store").json({ status: "ok" }),
);
app.get(["/ready", "/readyz"], (_req, res) => {
  void readiness.ready().then((ready) =>
    res
      .set("Cache-Control", "no-store")
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "unavailable" }),
  );
});
app.use("/api", (req, res, next) => {
  res.locals.requestId = randomUUID();
  res
    .set("X-Request-ID", res.locals.requestId)
    .set("Cache-Control", "no-store");
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (lifecycle.draining)
    return res
      .status(503)
      .set("Retry-After", "30")
      .json({
        error: {
          code: "TEMPORARILY_UNAVAILABLE",
          message: "Ruckus is taking a short break. Try again shortly.",
        },
      });
  void readiness.dependencyReady().then((ready) =>
    ready
      ? next()
      : res
          .status(503)
          .set("Retry-After", "5")
          .json({
            error: {
              code: "TEMPORARILY_UNAVAILABLE",
              message:
                "Ruckus couldn’t reach your saved work. Try again shortly.",
            },
          }),
  );
});
installHostApi(app, {
  capacity: () => lifecycle.acceptingRooms && rooms.size < 500,
  available: (id) =>
    [...rooms.values()].some(
      (r) =>
        r instanceof EventRuntime &&
        r.snapshot.id === id &&
        r.phase !== "ended",
    ),
  open: (snapshot, req) => {
    if (!lifecycle.acceptingRooms || rooms.size >= 500)
      throw new ApiError(
        503,
        "STAGE_UNAVAILABLE",
        "All stages are occupied. Try again shortly.",
      );
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const joinUrl = getPublicJoinUrl(
      code,
      {
        host: req.headers.host ?? `localhost:${port}`,
        origin: req.headers.origin,
      },
      port,
    );
    const room = new EventRuntime(
      code,
      snapshot,
      joinUrl,
      () => {
        finalizeHistory(room);
        broadcast(room);
      },
      (reason) => {
        void new EventService(db)
          .ended(snapshot, reason)
          .catch(() => log("event.end_audit_failed", {}, "warn"));
      },
    );
    rooms.set(code, room);
    return {
      ok: true,
      identity: { code, token: room.hostToken, role: "host" },
      state: roomView(room),
    };
  },
});
function broadcast(room: LiveRoom) {
  broadcastRoom(rooms, io.sockets.sockets.values(), room, roomView);
}
const fail = (error: unknown): Reply => ({
  ok: false,
  error:
    error instanceof DrizzleQueryError ||
    (error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^(?:[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT)$/.test(error.code))
      ? "Couldn’t reach your saved work. Try again shortly."
      : error instanceof z.ZodError
        ? error.issues[0]?.message
        : error instanceof Error
          ? error.message
          : "Something went wrong. Try that action again.",
});
io.on("connection", (socket) => {
  const ip = socketClientAddress(
    socket.handshake.address,
    socket.handshake.headers["x-forwarded-for"],
    process.env.TRUST_PROXY === "loopback",
  );
  function limit(key: string, count: number, ms: number) {
    if (!limiter.allow(`${key}:${ip}`, count, ms))
      throw new Error("A little too fast. Wait a moment and try again.");
  }
  function getRoom(host = false) {
    if (lifecycle.stopping)
      throw new Error("This stage is closing. Try again shortly.");
    const identity = socket.data.identity as Identity | undefined;
    const room = identity ? rooms.get(identity.code) : undefined;
    if (!room || !identity)
      throw new Error("Room not found. Check the code or create a new room.");
    if (host && (identity.role !== "host" || identity.token !== room.hostToken))
      throw new Error("Only the host can use this control.");
    return { room, identity };
  }
  function attach(identity: Identity) {
    const prev = socket.data.identity as Identity | undefined;
    if (prev) {
      rooms.get(prev.code)?.disconnect(socket.id);
      socket.leave(prev.code);
    }
    socket.data.identity = identity;
    socket.join(identity.code);
  }
  socket.on("room:create", async (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      limit("create", 8, 60000);
      if (!lifecycle.acceptingRooms || !(await readiness.dependencyReady()))
        throw new Error("Ruckus is taking a short break. Try again shortly.");
      let host;
      try {
        host = await auth.api.getSession({
          headers: fromNodeHeaders(socket.handshake.headers),
        });
      } catch {
        throw new Error("Couldn’t check your host account. Try again shortly.");
      }
      if (!host)
        throw new Error("Sign in to your host account to create a room.");
      if (rooms.size >= 500)
        throw new Error("All stages are occupied. Try again shortly.");
      const parsed = z
        .object({
          contentReference: z
            .object({
              workspaceId: z.string().uuid(),
              selections: z.record(z.enum(GAME_IDS), z.string().uuid()),
            })
            .strict()
            .optional(),
          settings: settingsSchema,
          demo: z.boolean().optional(),
          board: boardSchema.optional(),
          boardReference: z
            .object({
              workspaceId: z.string().uuid(),
              boardId: z.string().uuid(),
            })
            .strict()
            .optional(),
        })
        .parse(data);
      let board = parsed.board ? validateBoard(parsed.board) : undefined;
      let boardRevisionId: string | undefined;
      if (parsed.boardReference) {
        let stored;
        try {
          stored = await new BoardService(db).forLaunchWithRevision(
            host.user.id,
            parsed.boardReference.workspaceId,
            parsed.boardReference.boardId,
          );
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new Error(
            "Couldn’t load this workspace board. Try again shortly.",
          );
        }
        board = validateBoard(stored.board);
        boardRevisionId = stored.revisionId;
      }
      const frozenContent = board
        ? undefined
        : await new ContentPackService(db).forStandalone(
            host.user.id,
            parsed.settings,
            parsed.contentReference,
          );
      const workspaceId =
        parsed.boardReference?.workspaceId ??
        (!board ? parsed.contentReference?.workspaceId : undefined) ??
        (await personalWorkspace(db, host.user.id));
      if (!lifecycle.acceptingRooms || rooms.size >= 500)
        throw new Error("Ruckus is taking a short break. Try again shortly.");
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const joinUrl = getPublicJoinUrl(
        code,
        {
          host: socket.handshake.headers.host ?? `localhost:${port}`,
          origin: socket.handshake.headers.origin,
        },
        port,
      );
      const settings = board
        ? { ...parsed.settings, playlist: ["hotwire" as const], rounds: 1 }
        : parsed.settings;
      const room = new Room(
        code,
        settings,
        joinUrl,
        () => {
          finalizeHistory(room);
          broadcast(room);
        },
        board,
        undefined,
        frozenContent,
      );
      historyState.set(room, {
        runId: room.outcomes.runId,
        attempted: false,
        context: {
          workspaceId,
          hostUserId: host.user.id,
          type: board ? "studio" : "original",
          title:
            board?.title ??
            (settings.playlist.length === 1
              ? gameById(settings.playlist[0]).name
              : "Ruckus Originals"),
          source: board
            ? parsed.boardReference
              ? { boardId: parsed.boardReference.boardId, boardRevisionId }
              : {}
            : settings.playlist.length === 1
              ? { gameType: settings.playlist[0] }
              : {},
        },
      });
      rooms.set(code, room);
      const identity: Identity = { code, token: room.hostToken, role: "host" };
      attach(identity);
      room.connectHost(socket.id);
      if (parsed.demo) room.addBots(8);
      ack({ ok: true, identity, state: roomView(room) });
    } catch (error) {
      metrics.roomCreateFailures++;
      log(
        "room.create_failed",
        { code: error instanceof ApiError ? error.code : "ROOM_UNAVAILABLE" },
        "warn",
      );
      ack(fail(error));
    }
  });
  socket.on("room:join", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (lifecycle.stopping)
        throw new Error("This stage is closing. Try again shortly.");
      limit("join", 300, 60000);
      const parsed = joinSchema.parse(data);
      limit(`join-room:${parsed.code}`, 60, 60000);
      const room = rooms.get(parsed.code);
      if (!room)
        throw new Error(
          "Room not found. Double-check the code with your host.",
        );
      const { token, id } = room.join(parsed.name, parsed.avatar, socket.id);
      const identity: Identity = { code: room.code, token, role: "player" };
      attach(identity);
      ack({ ok: true, identity, state: roomView(room, id) });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("room:resume", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      limit("resume", 600, 60000);
      const identity = identitySchema.parse(data);
      limit(`resume-room:${identity.code}`, 120, 60000);
      const room = rooms.get(identity.code);
      if (!room)
        throw new Error("This room has expired. Ask your host for a new code.");
      if (room.phase === "ended")
        throw new Error("The host ended this session. Thanks for playing.");
      if (identity.role === "host") {
        if (identity.token !== room.hostToken)
          throw new Error("The host key doesn’t match this room.");
        attach(identity);
        room.connectHost(socket.id);
        ack({ ok: true, identity, state: roomView(room) });
      } else {
        const existing = room.playerByToken(identity.token);
        if (!existing)
          throw new Error("Your player was removed or the session expired.");
        const oldId = existing.socketId;
        attach(identity);
        const id = room.resumePlayer(identity.token, socket.id);
        if (oldId && oldId !== socket.id) {
          const old = io.sockets.sockets.get(oldId);
          if (old) {
            delete old.data.identity;
            old.leave(room.code);
            old.emit(
              "room:removed",
              "Your player is connected in another tab. Continue there.",
            );
          }
        }
        ack({ ok: true, identity, state: roomView(room, id) });
      }
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("event:action", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      const { room } = getRoom(true);
      if (!(room instanceof EventRuntime))
        throw new Error("This room is not an event.");
      limit("event-action", 30, 5000);
      const parsed = eventCommandSchema.parse(data);
      room.command(parsed.action, parsed.sequence);
      ack({ ok: true });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("host:action", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (!limiter.allow(`host:${socket.id}`, 20, 5000))
        throw new Error("Give the stage a moment to catch up.");
      const { room } = getRoom(true);
      const parsed = actionSchema
        .extend({ expectedKey: z.string().max(80).optional() })
        .parse(data);
      if (
        room instanceof EventRuntime &&
        parsed.expectedKey !== room.view().roundKey
      )
        throw new Error("The event moved on. Use the current controls.");
      if (room instanceof EventRuntime && parsed.action === "end")
        throw new Error("Confirm End event in the event console.");
      if (parsed.action === "bots") room.addBots(parsed.count ?? 4);
      else if (parsed.action === "remove") {
        if (!parsed.playerId) throw new Error("Choose a player to remove.");
        const id = room.remove(parsed.playerId);
        if (id) {
          const removed = io.sockets.sockets.get(id);
          if (removed) {
            delete removed.data.identity;
            removed.leave(room.code);
            removed.emit(
              "room:removed",
              "The host removed you from this room.",
            );
          }
        }
      } else room.action(parsed.action);
      ack({ ok: true });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("player:input", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (!limiter.allow(`input:${socket.id}`, 8, 5000))
        throw new Error(
          "Your controller needs a breath. Try again in a moment.",
        );
      const { room, identity } = getRoom();
      if (identity.role !== "player")
        throw new Error("Join as a player to submit.");
      const p = room.playerByToken(identity.token);
      if (!p) throw new Error("Player session not found.");
      const payload = z
        .object({ input: inputSchema, roundKey: z.string().max(80) })
        .parse(data);
      if (payload.roundKey !== room.view().roundKey)
        throw new Error(
          "The round changed before your answer arrived. Play the current round.",
        );
      room.submit(p.public.id, payload.input);
      ack({ ok: true });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("player:reaction", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      if (!limiter.allow(`reaction:${socket.id}`, 1, 2000))
        throw new Error("One reaction every two seconds. Make it count.");
      const { room, identity } = getRoom();
      if (identity.role !== "player")
        throw new Error("Reactions are for players.");
      const emoji = z
        .object({ emoji: z.enum(REACTIONS as [string, ...string[]]) })
        .parse(data).emoji;
      const p = room.playerByToken(identity.token);
      if (!p) throw new Error("Player session not found.");
      room.reaction();
      io.to(room.code).emit("room:reaction", {
        id: randomUUID(),
        emoji,
        name: p.public.name,
      });
      ack({ ok: true });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("disconnect", () => {
    const identity = socket.data.identity as Identity | undefined;
    if (identity) rooms.get(identity.code)?.disconnect(socket.id);
  });
});
const cleanup = setInterval(() => {
  const started = performance.now();
  limiter.sweep();
  for (const room of rooms.values()) {
    if (
      !room.hostSocket &&
      Date.now() - room.lastHostSeen > 5 * 60000 &&
      room.phase !== "ended"
    )
      room.action("end");
    if (
      Date.now() - room.changedAt > 2 * 3600000 ||
      (room.phase === "ended" && Date.now() - room.changedAt > 60000)
    ) {
      if (room.phase !== "final" && room.phase !== "ended") room.action("end");
      finalizeHistory(room);
      room.dispose();
      retireRoom(rooms, io.sockets.sockets.values(), room);
    }
  }
  metrics.cleanupMs += performance.now() - started;
}, 30000);
cleanup.unref();
let closeVite: (() => Promise<void>) | undefined;
if (process.env.REALTIME_ONLY === "true") {
  app.get("/", (_req, res) =>
    res.json({ service: "ruckus-realtime", status: "ok" }),
  );
} else if (
  process.env.NODE_ENV === "production" ||
  process.argv[1]?.endsWith(".js")
) {
  app.use(
    "/audio",
    express.static(path.resolve("dist/audio"), {
      maxAge: "1y",
      immutable: true,
      index: false,
    }),
  );
  app.use(express.static(path.resolve("dist"), { maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "spa",
  });
  closeVite = () => vite.close();
  app.use(vite.middlewares);
}
historyWorker.start();
let historyObservation: Promise<void> | undefined;
let lastObservationFailure = 0;
const observeHistory = setInterval(
  () => {
    if (historyObservation || lifecycle.stopping) return;
    const ids = [...rooms.values()]
      .map((room) => historyState.get(room)?.persistence)
      .filter((p) => p?.status === "pending" || p?.status === "saving")
      .map((p) => p!.sessionId);
    if (!ids.length) return;
    historyObservation = (async () => {
      if (!(await readiness.dependencyReady())) return;
      for (const row of await outbox.states(ids))
        if (row.status !== "pending") historyUpdate(row.id, row.status);
    })()
      .catch((error) => {
        if (Date.now() - lastObservationFailure > 60000) {
          log(
            "history.feedback_unavailable",
            { code: failureCode(error) },
            "warn",
          );
          lastObservationFailure = Date.now();
        }
      })
      .finally(() => {
        historyObservation = undefined;
      });
  },
  Math.min(1000, config.workerPollMs),
);
observeHistory.unref();
const observations = setInterval(() => {
  void outbox
    .snapshot()
    .then((queue) => {
      console.log(
        JSON.stringify({
          level: "info",
          timestamp: new Date().toISOString(),
          event: "operations.snapshot",
          rooms: rooms.size,
          events: [...rooms.values()].filter((r) => r instanceof EventRuntime)
            .length,
          sockets: io.engine.clientsCount,
          pool: {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
          },
          queue,
          ...metrics,
        }),
      );
    })
    .catch(() =>
      log(
        "operations.snapshot_unavailable",
        { code: "DB_UNAVAILABLE" },
        "warn",
      ),
    );
}, 60000);
observations.unref();
http.listen(port, "0.0.0.0", () => {
  log("process.started");
  if (config.production) return;
  console.log(
    `\n  RUCKUS — Clock out of ordinary.\n  Host:  http://localhost:${port}\n${addresses.map((ip) => `  Phone: http://${ip}:${port}`).join("\n")}\n  Join QR origin: ${publicAppOrigin() ?? "automatically detected LAN address"}\n`,
  );
});
async function shutdown() {
  if (!lifecycle.stop()) return;
  const started = performance.now();
  log("shutdown.started");
  const deadline = setTimeout(() => {
    log(
      "shutdown.deadline",
      {
        code: "SHUTDOWN_TIMEOUT",
        durationMs: Math.round(performance.now() - started),
      },
      "error",
    );
    process.exit(1);
  }, config.shutdownMs);
  deadline.unref();
  clearInterval(cleanup);
  clearInterval(observations);
  clearInterval(observeHistory);
  const workerStopped = historyWorker.stop();
  http.close();
  for (const room of rooms.values()) {
    if (room.phase !== "final" && room.phase !== "ended") room.action("end");
    finalizeHistory(room);
    room.dispose();
  }
  try {
    await historyWriter.drain();
    await workerStopped;
    await historyObservation;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    for (const room of rooms.values())
      retireRoom(rooms, io.sockets.sockets.values(), room);
    await closeVite?.();
    http.closeAllConnections();
    await Promise.all([pool.end(), readiness.close()]);
    clearTimeout(deadline);
    log("shutdown.completed", {
      durationMs: Math.round(performance.now() - started),
    });
    process.exit(0);
  } catch (error) {
    log("shutdown.failed", { code: failureCode(error) }, "error");
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("SIGUSR2", () => {
  lifecycle.drain();
  log("process.draining");
});
