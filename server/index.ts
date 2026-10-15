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
import { db, pool, auth } from "./auth/config.js";
import { fromNodeHeaders } from "better-auth/node";
const app = express();
const http = createServer(app);
const port = Number(process.env.PORT) || 4310;
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
app.get(["/api/health", "/health"], (_req, res) =>
  res.json({ status: "ok", service: "ruckus", rooms: rooms.size }),
);
installHostApi(app, {
  capacity: () => rooms.size < 500,
  available: (id) =>
    [...rooms.values()].some(
      (r) =>
        r instanceof EventRuntime &&
        r.snapshot.id === id &&
        r.phase !== "ended",
    ),
  open: (snapshot, req) => {
    if (rooms.size >= 500)
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
      () => broadcast(room),
      (reason) => {
        void new EventService(db)
          .ended(snapshot, reason)
          .catch(() => console.error("Event end audit unavailable."));
      },
    );
    rooms.set(code, room);
    return {
      ok: true,
      identity: { code, token: room.hostToken, role: "host" },
      state: room.view(),
    };
  },
});
function broadcast(room: LiveRoom) {
  for (const socket of io.sockets.sockets.values()) {
    const identity = socket.data.identity as Identity | undefined;
    if (identity?.code === room.code) {
      const p =
        identity.role === "player"
          ? room.playerByToken(identity.token)
          : undefined;
      socket.emit("room:state", room.view(p?.public.id));
    }
  }
}
const fail = (error: unknown): Reply => ({
  ok: false,
  error:
    error instanceof z.ZodError
      ? error.issues[0]?.message
      : error instanceof Error
        ? error.message
        : "Something went wrong. Try that action again.",
});
io.on("connection", (socket) => {
  const ip = socket.handshake.address;
  function limit(key: string, count: number, ms: number) {
    if (!limiter.allow(`${key}:${ip}`, count, ms))
      throw new Error("A little too fast. Wait a moment and try again.");
  }
  function getRoom(host = false) {
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
      if (parsed.boardReference) {
        let stored;
        try {
          stored = await new BoardService(db).forLaunch(
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
        board = validateBoard(stored);
      }
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
        () => broadcast(room),
        board,
      );
      rooms.set(code, room);
      const identity: Identity = { code, token: room.hostToken, role: "host" };
      attach(identity);
      room.connectHost(socket.id);
      if (parsed.demo) room.addBots(8);
      ack({ ok: true, identity, state: room.view() });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("room:join", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      limit("join", 30, 60000);
      const parsed = joinSchema.parse(data);
      const room = rooms.get(parsed.code);
      if (!room)
        throw new Error(
          "Room not found. Double-check the code with your host.",
        );
      const { token, id } = room.join(parsed.name, parsed.avatar, socket.id);
      const identity: Identity = { code: room.code, token, role: "player" };
      attach(identity);
      ack({ ok: true, identity, state: room.view(id) });
    } catch (error) {
      ack(fail(error));
    }
  });
  socket.on("room:resume", (data, ack) => {
    if (typeof ack !== "function") return;
    try {
      limit("resume", 60, 60000);
      const identity = identitySchema.parse(data);
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
        ack({ ok: true, identity, state: room.view() });
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
        ack({ ok: true, identity, state: room.view(id) });
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
  limiter.sweep();
  for (const [code, room] of rooms) {
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
      room.dispose();
      rooms.delete(code);
    }
  }
}, 30000);
cleanup.unref();
if (process.env.REALTIME_ONLY === "true") {
  app.get("/", (_req, res) =>
    res.json({ service: "ruckus-realtime", status: "ok" }),
  );
} else if (
  process.env.NODE_ENV === "production" ||
  process.argv[1]?.endsWith(".js")
) {
  app.use(express.static(path.resolve("dist"), { maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
http.listen(port, "0.0.0.0", () => {
  console.log(
    `\n  RUCKUS — Clock out of ordinary.\n  Host:  http://localhost:${port}\n${addresses.map((ip) => `  Phone: http://${ip}:${port}`).join("\n")}\n  Join QR origin: ${process.env.PUBLIC_JOIN_URL ?? "automatically detected LAN address"}\n`,
  );
});
function shutdown() {
  clearInterval(cleanup);
  for (const room of rooms.values()) room.dispose();
  io.close();
  http.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
