import { reliabilityDatabase } from "../support/reliability-database.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { HistoryOutbox, type ClaimedJob } from "../../server/history/outbox.js";
import { spawn } from "node:child_process";
import { createServer as tcpServer } from "node:net";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../../server/db/client.js";
import { hostCookie } from "../support/host-session.js";
import { io, type Socket } from "socket.io-client";
import { DEFAULT_SETTINGS } from "../../shared/catalog.js";
import type { Reply } from "../../shared/types.js";
const database = await reliabilityDatabase();
const { url, pool } = database;
const compiled = process.env.COMPILED_ACCEPTANCE === "true";
if (compiled)
  await mkdir(".local/visual-qa/phase-6-acceptance", { recursive: true });
const fixtureSecret = "Isolated-process-reliability-" + randomUUID();
const captured: {
  label: string;
  logs: () => string;
  signal: () => string | null;
  exit: () => number | null;
}[] = [];
const privateValues = new Set<string>([
  url!,
  new URL(url!).password,
  decodeURIComponent(new URL(url!).password),
  "A long test-only passphrase!",
  "DO_NOT_LOG_SECRET",
  "First guest",
  "Second guest",
]);
after(async () => {
  const logs = captured.map((a) => ({
    label: a.label,
    exit: a.exit(),
    signal: a.signal(),
    output: a.logs(),
  }));
  for (const a of logs) {
    for (const value of privateValues)
      if (value.length >= 8)
        assert.ok(
          !a.output.includes(value),
          "Known credential/capability leaked",
        );
    assert.doesNotMatch(
      a.output,
      /postgres(?:ql)?:\/\/|better-auth.session_token=|Bearer |uncaught|UnhandledPromiseRejection|\bat (?:async )?\S+ \(/i,
    );
    assert.doesNotMatch(
      a.output,
      /(?:verify-email|reset-password)\?[^\s]*token=|select .+ from |insert into |update .+ set /i,
    );
  }
  if (compiled) {
    await mkdir(".local/visual-qa/phase-6-acceptance", { recursive: true });
    await writeFile(
      ".local/visual-qa/phase-6-acceptance/process-logs.json",
      JSON.stringify(logs, null, 2),
    );
  }
});
after(() => database.close());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(
  fn: () => Promise<T>,
  limit = 10000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result as NonNullable<T>;
    await wait(40);
  }
  throw Error("Timed out waiting for local reliability fixture.");
}
async function freePort() {
  const s = tcpServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
async function start(extra: NodeJS.ProcessEnv = {}, port?: number) {
  port ??= await freePort();
  const origin = `http://localhost:${port}`;
  let logs = "";
  const application = "acceptance-" + randomUUID();
  const authSecret = fixtureSecret;
  privateValues.add(authSecret);
  const childUrl = new URL(extra.DATABASE_URL || url!);
  childUrl.searchParams.set("application_name", application);
  privateValues.add(childUrl.href);
  const process = spawn(
    globalThis.process.execPath,
    compiled
      ? ["dist-server/server/start.js"]
      : ["--import", "tsx", "server/start.ts"],
    {
      env: {
        ...globalThis.process.env,
        NODE_ENV: "test",
        DATABASE_URL: url!,
        TEST_DATABASE_URL: url!,
        AUTH_SECRET: authSecret,
        EMAIL_TRANSPORT: "memory",
        APP_ORIGIN: origin,
        PUBLIC_APP_URL: origin,
        CLIENT_ORIGIN: origin,
        ALLOWED_ORIGINS: "",
        PORT: String(port),
        HISTORY_POLL_MS: "100",
        ...extra,
        DATABASE_URL: childUrl.href,
        TEST_DATABASE_URL: childUrl.href,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exit = new Promise<number | null>((r) => process.once("exit", r));
  const capture = (b: Buffer) => {
    logs = (logs + b.toString()).slice(-50000);
  };
  process.stdout!.on("data", capture);
  process.stderr!.on("data", capture);
  try {
    await until(async () => {
      if (process.exitCode !== null)
        throw Error(`Fixture server exited: ${logs}`);
      try {
        return (
          await fetch(origin + "/healthz", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        return false;
      }
    });
  } catch (e) {
    process.kill("SIGKILL");
    await exit;
    throw e;
  }
  captured.push({
    label: application,
    logs: () => logs,
    signal: () => process.signalCode,
    exit: () => process.exitCode,
  });
  return { process, exit, origin, application, logs: () => logs };
}
async function stop(
  app: Awaited<ReturnType<typeof start>>,
  signal: NodeJS.Signals = "SIGTERM",
) {
  if (app.process.exitCode === null && app.process.signalCode === null)
    app.process.kill(signal);
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      app.exit,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          app.process.kill("SIGKILL");
          reject(Error("Fixture shutdown timed out"));
        }, 25000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
const emit = (socket: Socket, name: string, data: unknown) =>
  new Promise<Reply>((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(name, data, (error: Error, reply: Reply) =>
        error
          ? reject(error)
          : reply.ok
            ? resolve(reply)
            : reject(Error(reply.error)),
      ),
  );
async function game(
  origin: string,
  { rounds = 1, creative = false, submitInitially = true } = {},
) {
  const cookie = await hostCookie(origin),
    sockets: Socket[] = [];
  const client = async (host = false) => {
    const socket = io(origin, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: host ? { Cookie: cookie } : {},
    });
    sockets.push(socket);
    await new Promise<void>((r, j) => {
      socket.once("connect", r);
      socket.once("connect_error", j);
    });
    return socket;
  };
  const host = await client(true),
    a = await client(),
    b = await client();
  const create = await emit(host, "room:create", {
    settings: {
      ...DEFAULT_SETTINGS,
      playlist: [creative ? "caption-this" : "room-temperature"],
      rounds,
      autoAdvance: false,
    },
  });
  for (const value of Object.values(create.identity!))
    if (typeof value === "string" && value.length >= 8)
      privateValues.add(value);
  cookie.split("; ").forEach((value) => {
    privateValues.add(value);
    privateValues.add(value.slice(value.indexOf("=") + 1));
  });
  const code = create.identity!.code;
  await emit(a, "room:join", { code, name: "First guest", avatar: 0 });
  await emit(b, "room:join", { code, name: "Second guest", avatar: 1 });
  await emit(host, "host:action", { action: "start" });
  await emit(host, "host:action", { action: "next" });
  const current = (await emit(host, "room:resume", create.identity)).state!;
  const creativeMarker = "PRIVATE_OPERATOR_CREATIVE_" + randomUUID();
  if (creative) privateValues.add(creativeMarker);
  if (submitInitially) {
    await emit(a, "player:input", {
      input: creative ? { text: creativeMarker } : { choice: 0 },
      roundKey: current.roundKey,
    });
    await emit(b, "player:input", {
      input: creative ? { text: creativeMarker + " second" } : { choice: 0 },
      roundKey: current.roundKey,
    });
  }
  return {
    cookie,
    host,
    sockets,
    identity: create.identity!,
    finish: async () => {
      let state = (await emit(host, "room:resume", create.identity)).state!;
      const t = performance.now();
      for (let n = 0; n < 4 && state.phase !== "final"; n++) {
        await emit(host, "host:action", { action: "next" });
        state = (await emit(host, "room:resume", create.identity)).state!;
      }
      assert.equal(state.phase, "final");
      return { state, durationMs: performance.now() - t };
    },
  };
}
test(
  "real completed session survives SIGKILL after durable enqueue and restarts exactly once",
  { timeout: 45000 },
  async () => {
    let app = await start({ HISTORY_POLL_MS: "30000" });
    let sockets: Socket[] = [];
    try {
      await until(async () => (await fetch(app.origin + "/readyz")).ok);
      const g = await game(app.origin);
      sockets = g.sockets;
      const finished = await g.finish();
      assert.ok(
        finished.durationMs < 1000,
        `Final acknowledgement ${finished.durationMs}ms`,
      );
      const id = finished.state.history!.sessionId;
      const pending = await until(
        async () =>
          (
            await pool.query(
              "select status,payload from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0],
      );
      assert.equal(pending.status, "pending");
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from session_runs where id=$1",
            [id],
          )
        ).rows[0].n,
        0,
      );
      const port = Number(new URL(app.origin).port);
      await stop(app, "SIGKILL");
      sockets.forEach((s) => s.disconnect());
      app = await start({}, port);
      await until(
        async () =>
          (
            await pool.query(
              "select status from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0]?.status === "completed",
      );
      assert.deepEqual(
        (await pool.query("select source from session_runs where id=$1", [id]))
          .rows[0].source,
        pending.payload.source,
      );
      assert.deepEqual(
        (
          await pool.query(
            "select source from session_segments where run_id=$1 order by sequence_index",
            [id],
          )
        ).rows.map((row) => row.source),
        pending.payload.segments.map(
          (segment: { source: unknown }) => segment.source,
        ),
      );
      const persisted = (
        await pool.query(
          "select display_name as name,final_score,final_rank,final_order from session_participants where run_id=$1 order by final_order",
          [id],
        )
      ).rows;
      const runtime = [...finished.state.players].sort(
        (a, b) => b.score - a.score,
      );
      assert.deepEqual(
        persisted.map((p) => [p.name, p.final_score, p.final_rank]),
        runtime.map((p, i) => [p.name, p.score, i + 1]),
      );
      assert.equal(
        (
          await pool.query(
            "select source->>'gameType' game from session_segments where run_id=$1",
            [id],
          )
        ).rows[0].game,
        "room-temperature",
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from workspace_audit_events where target_id=$1 and action='session.completed'",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from session_runs where id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
      // Drain leaves existing capabilities/joins usable while new creation and API mutations stop.
      const g2 = await game(app.origin);
      sockets.push(...g2.sockets);
      app.process.kill("SIGUSR2");
      await until(
        async () => (await fetch(app.origin + "/readyz")).status === 503,
      );
      assert.equal((await fetch(app.origin + "/healthz")).status, 200);
      await assert.rejects(
        () => emit(g2.host, "room:create", { settings: DEFAULT_SETTINGS }),
        /break/,
      );
      await emit(g2.host, "room:resume", g2.identity);
      const lateGuest = io(app.origin, {
        transports: ["websocket"],
        reconnection: false,
      });
      sockets.push(lateGuest);
      await new Promise<void>((resolve, reject) => {
        lateGuest.once("connect", resolve);
        lateGuest.once("connect_error", reject);
      });
      const joined = await emit(lateGuest, "room:join", {
        code: g2.identity.code,
        name: "Drain guest",
        avatar: 2,
      });
      await emit(lateGuest, "room:resume", joined.identity);
      await probes(app, 503);
      const result = await g2.finish();
      assert.equal(result.state.phase, "final");
      await completed(result.state.history!.sessionId);
      assert.equal(
        (
          await fetch(app.origin + "/api/auth/sign-up/email", {
            method: "POST",
            headers: { Origin: app.origin, "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        503,
      );
      const code = await stop(app);
      assert.equal(code, 0);
      assert.match(app.logs(), /shutdown.completed/);
    } finally {
      sockets.forEach((s) => s.disconnect());
      await stop(app);
    }
  },
);
test(
  "startup DB refusal keeps liveness responsive, readiness false and cloud writes safely rejected",
  { timeout: 20000 },
  async () => {
    const refused =
      "postgresql://invalid:DO_NOT_LOG_SECRET@127.0.0.1:1/ruckus_test";
    const app = await start({
      DATABASE_URL: refused,
      TEST_DATABASE_URL: refused,
    });
    try {
      assert.equal((await fetch(app.origin + "/healthz")).status, 200);
      assert.equal((await fetch(app.origin + "/readyz")).status, 503);
      const r = await fetch(app.origin + "/api/auth/sign-up/email", {
        method: "POST",
      });
      assert.equal(r.status, 503);
      assert.ok(r.headers.get("x-request-id"));
      assert.ok(!app.logs().includes("DO_NOT_LOG_SECRET"));
      assert.equal(await stop(app), 0);
    } finally {
      await stop(app);
    }
  },
);
test(
  "DB drops mid-session: live finale stays fast, cloud fails safely, recap commits after recovery",
  { timeout: 30000 },
  async () => {
    const { connect } = await import("node:net");
    const sockets = new Set<import("node:net").Socket>();
    let available = true;
    const target = new URL(url!);
    const targetHost = target.hostname,
      targetPort = Number(target.port || 5432);
    const proxy = tcpServer((client) => {
      if (!available) {
        client.destroy();
        return;
      }
      const upstream = connect({ host: targetHost, port: targetPort });
      sockets.add(client);
      sockets.add(upstream);
      const close = () => {
        sockets.delete(client);
        sockets.delete(upstream);
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
      client.on("close", close);
      upstream.on("close", close);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
    target.hostname = "127.0.0.1";
    target.port = String((proxy.address() as { port: number }).port);
    const app = await start({
      DATABASE_URL: target.href,
      TEST_DATABASE_URL: target.href,
    });
    let gameSockets: Socket[] = [];
    try {
      await until(async () => (await fetch(app.origin + "/readyz")).ok);
      const g = await game(app.origin);
      gameSockets = g.sockets;
      available = false;
      sockets.forEach((s) => s.destroy());
      const final = await g.finish();
      assert.ok(final.durationMs < 1000);
      const id = final.state.history!.sessionId;
      await until(
        async () => (await fetch(app.origin + "/readyz")).status === 503,
      );
      const cloud = await fetch(app.origin + "/api/v1/workspaces", {
        headers: { Cookie: g.cookie },
      });
      assert.ok(cloud.status >= 500);
      assert.ok(!(await cloud.text()).includes(target.password));
      available = true;
      await until(
        async () =>
          (
            await pool.query(
              "select status from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0]?.status === "completed",
        15000,
      );
      await until(async () => (await fetch(app.origin + "/readyz")).ok);
      assert.match(app.logs(), /DB_UNAVAILABLE/);
      assert.ok(!app.logs().includes(target.password));
    } finally {
      gameSockets.forEach((s) => s.disconnect());
      await stop(app);
      sockets.forEach((s) => s.destroy());
      await new Promise<void>((r) => proxy.close(() => r()));
    }
  },
);
test(
  "shutdown settles an in-flight materialization; forced deadline leaves its durable lease recoverable",
  { timeout: 35000 },
  async () => {
    let app = await start({ HISTORY_POLL_MS: "30000" });
    let clients: Socket[] = [];
    try {
      const g = await game(app.origin);
      clients = g.sockets;
      const { state } = await g.finish();
      const id = state.history!.sessionId;
      await until(
        async () =>
          (
            await pool.query(
              "select id from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0],
      );
      await stop(app);
      clients.forEach((s) => s.disconnect());
      const hold = await pool.connect();
      await hold.query("begin");
      await hold.query(
        "select id from workspaces where id=(select workspace_id from session_history_receipts where id=$1) for update",
        [id],
      );
      try {
        app = await start({ SHUTDOWN_TIMEOUT_MS: "1000" });
        await until(
          async () =>
            (
              await pool.query(
                "select status from session_history_outbox where id=$1",
                [id],
              )
            ).rows[0]?.status === "processing",
        );
        assert.equal(await stop(app), 1);
        assert.match(app.logs(), /SHUTDOWN_TIMEOUT/);
      } finally {
        await hold.query("rollback");
        hold.release();
      }
      await pool.query(
        "update session_history_outbox set locked_at=now()-interval '61 seconds' where id=$1",
        [id],
      );
      app = await start();
      await until(
        async () =>
          (
            await pool.query(
              "select status from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0]?.status === "completed",
      );
      assert.equal(await stop(app), 0);
    } finally {
      clients.forEach((s) => s.disconnect());
      await stop(app);
    }
  },
);
test(
  "fresh/repeated migration, migration lock and incompatible schema reject writes without changing existing data",
  { timeout: 30000 },
  async () => {
    const name = "ruckus_test_phase6" + randomUUID().replaceAll("-", ""),
      local = new URL(url!);
    local.pathname = "/" + name;
    await pool.query(`create database "${name}"`);
    const fresh = connectDatabase(local.href);
    let app: Awaited<ReturnType<typeof start>> | undefined;
    const migrate = async () => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/migrate.ts"],
        {
          env: { ...process.env, DATABASE_URL: local.href },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      const code = await new Promise<number | null>((r) =>
        child.once("exit", r),
      );
      return { code, output };
    };
    try {
      assert.equal((await migrate()).code, 0);
      assert.equal((await migrate()).code, 0);
      assert.equal(
        (await fresh.pool.query("select count(*)::int n from session_runs"))
          .rows[0].n,
        0,
      );
      const lock = await fresh.pool.connect();
      await lock.query("select pg_advisory_lock(724826601)");
      try {
        assert.equal((await migrate()).code, 1);
      } finally {
        await lock.query("select pg_advisory_unlock(724826601)");
        lock.release();
      }
      await fresh.pool.query(
        "update drizzle.__drizzle_migrations set hash='incompatible' where created_at=(select max(created_at) from drizzle.__drizzle_migrations)",
      );
      app = await start({
        DATABASE_URL: local.href,
        TEST_DATABASE_URL: local.href,
      });
      assert.equal((await fetch(app.origin + "/readyz")).status, 503);
      assert.equal((await fetch(app.origin + "/healthz")).status, 200);
      assert.equal(
        (
          await fetch(app.origin + "/api/auth/sign-up/email", {
            method: "POST",
          })
        ).status,
        503,
      );
      assert.match(app.logs(), /MIGRATION_REQUIRED/);
      assert.equal((await migrate()).code, 1);
      await probes(app, 503);
      assert.equal(
        (
          await fresh.pool.query(
            "select hash from drizzle.__drizzle_migrations order by created_at desc limit 1",
          )
        ).rows[0].hash,
        "incompatible",
      );
      const { createHash } = await import("node:crypto");
      const { readFile } = await import("node:fs/promises");
      const hash = createHash("sha256")
        .update(
          await readFile(
            "migrations/0008_history_outbox_reliability.sql",
            "utf8",
          ),
        )
        .digest("hex");
      await fresh.pool.query(
        "update drizzle.__drizzle_migrations set hash=$1 where created_at=(select max(created_at) from drizzle.__drizzle_migrations)",
        [hash],
      );
      // This empty database has no approved content yet. Explicit fixture seeding completes its readiness requirements.
      const { seedContent } =
        await import("../../server/content-packs/seed.js");
      await seedContent(fresh.db, true);
      await until(async () => (await fetch(app!.origin + "/readyz")).ok);
      await probes(app);
    } finally {
      if (app) await stop(app);
      await fresh.pool.end();
      await pool.query(`drop database "${name}"`);
    }
  },
);
test(
  "SIGTERM lets an active cloud request finish before closing the database",
  { timeout: 20000 },
  async () => {
    const app = await start(),
      holder = await pool.connect();
    try {
      const cookie = await hostCookie(app.origin),
        wid = (
          await (
            await fetch(app.origin + "/api/v1/workspaces", {
              headers: { Cookie: cookie },
            })
          ).json()
        ).items[0].id;
      const { newBoard } = await import("../../shared/boards.js");
      await holder.query("begin");
      await holder.query("select id from workspaces where id=$1 for update", [
        wid,
      ]);
      const request = fetch(app.origin + `/api/v1/workspaces/${wid}/boards`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: app.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ board: newBoard() }),
      });
      await until(
        async () =>
          (
            await pool.query(
              "select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%workspaces%' and pid<>pg_backend_pid()",
            )
          ).rows[0].n > 0,
      );
      app.process.kill("SIGTERM");
      await wait(100);
      await holder.query("rollback");
      assert.equal((await request).status, 201);
      assert.equal(await app.exit, 0);
      assert.match(app.logs(), /shutdown.completed/);
    } finally {
      await holder.query("rollback");
      holder.release();
      await stop(app);
    }
  },
);
test(
  "another process may materialize a recap while its originating host still receives committed feedback",
  { timeout: 20000 },
  async () => {
    const origin = await start({ HISTORY_POLL_MS: "30000" }),
      worker = await start();
    let sockets: Socket[] = [];
    try {
      const g = await game(origin.origin);
      sockets = g.sockets;
      let latest: import("../../shared/types.js").RoomView | undefined;
      g.host.on("room:state", (state) => {
        latest = state;
      });
      const { state } = await g.finish();
      await until(async () => latest?.history?.status === "saved");
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from session_runs where id=$1",
            [state.history!.sessionId],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from workspace_audit_events where target_id=$1 and action='session.completed'",
            [state.history!.sessionId],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      sockets.forEach((s) => s.disconnect());
      await stop(origin);
      await stop(worker);
    }
  },
);

// These checks also run unchanged against the compiled entry point via test:acceptance.
async function probes(app: Awaited<ReturnType<typeof start>>, ready = 200) {
  for (const path of ["/healthz", "/health", "/api/health"]) {
    const response = await fetch(app.origin + path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  }
  for (const path of ["/readyz", "/ready"])
    assert.equal((await fetch(app.origin + path)).status, ready);
}
async function completed(id: string) {
  await until(
    async () =>
      (
        await pool.query(
          "select status from session_history_outbox where id=$1",
          [id],
        )
      ).rows[0]?.status === "completed",
  );
  assert.equal(
    (
      await pool.query("select count(*)::int n from session_runs where id=$1", [
        id,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from workspace_audit_events where target_id=$1 and action in ('session.completed','session.ended_early')",
        [id],
      )
    ).rows[0].n,
    1,
  );
}
async function noConnections(app: Awaited<ReturnType<typeof start>>) {
  await until(
    async () =>
      (
        await pool.query(
          "select count(*)::int n from pg_stat_activity where application_name=$1",
          [app.application],
        )
      ).rows[0].n === 0,
  );
  await assert.rejects(() => fetch(app.origin + "/healthz"));
  assert.match(app.logs(), /shutdown.completed/);
}
async function pendingGame() {
  const app = await start({ HISTORY_POLL_MS: "30000" });
  const g = await game(app.origin);
  const { state } = await g.finish();
  const id = state.history!.sessionId;
  const row = await until(
    async () =>
      (
        await pool.query("select * from session_history_outbox where id=$1", [
          id,
        ])
      ).rows[0],
  );
  assert.equal(row.status, "pending");
  return { app, g, id, payload: row.payload };
}
async function holdWorkspace(id: string) {
  const holder = await pool.connect();
  await holder.query("begin");
  await holder.query(
    "select id from workspaces where id=(select workspace_id from session_history_receipts where id=$1) for update",
    [id],
  );
  return {
    async release() {
      await holder.query("rollback");
      holder.release();
    },
  };
}
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  test(
    `idle ${signal}: compiled-compatible probes, clean exit and closed database connections`,
    { timeout: 15000 },
    async () => {
      const app = await start();
      try {
        await until(async () => (await fetch(app.origin + "/readyz")).ok);
        await probes(app);
        assert.equal(await stop(app, signal), 0);
        await noConnections(app);
      } finally {
        await stop(app);
      }
    },
  );
}
test(
  "active qualified room SIGTERM freezes an early-end recap; restart cannot restore the room",
  { timeout: 25000 },
  async () => {
    let app = await start();
    let sockets: Socket[] = [];
    try {
      const g = await game(app.origin, { rounds: 2 });
      sockets = g.sockets;
      // Both guests submitted; close the first of two rounds, qualifying the run.
      await emit(g.host, "host:action", { action: "next" });
      const state = (await emit(g.host, "room:resume", g.identity)).state!;
      assert.notEqual(state.phase, "final");
      const wid = (
        await (
          await fetch(app.origin + "/api/v1/workspaces", {
            headers: { Cookie: g.cookie },
          })
        ).json()
      ).items[0].id;
      assert.equal(await stop(app), 0);
      const id = (
        await until(
          async () =>
            (
              await pool.query(
                "select id from session_history_receipts where workspace_id=$1",
                [wid],
              )
            ).rows[0],
        )
      ).id;
      await noConnections(app);
      const old = app;
      sockets.forEach((s) => s.disconnect());
      app = await start({}, Number(new URL(old.origin).port));
      await completed(id);
      assert.equal(
        (await pool.query("select status from session_runs where id=$1", [id]))
          .rows[0].status,
        "ended_early",
      );
      assert.equal(
        (
          await pool.query(
            "select sum(rounds)::int n from session_segments where run_id=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
      const client = io(app.origin, {
        transports: ["websocket"],
        reconnection: false,
      });
      sockets.push(client);
      await new Promise<void>((r, j) => {
        client.once("connect", r);
        client.once("connect_error", j);
      });
      await assert.rejects(() => emit(client, "room:resume", g.identity));
    } finally {
      sockets.forEach((s) => s.disconnect());
      await stop(app);
    }
  },
);
test(
  "materialization waits during SIGTERM and commits within the graceful deadline",
  { timeout: 25000 },
  async () => {
    const p = await pendingGame();
    let worker: Awaited<ReturnType<typeof start>> | undefined;
    const hold = await holdWorkspace(p.id);
    let released = false;
    try {
      await stop(p.app);
      worker = await start();
      await until(
        async () =>
          (
            await pool.query(
              "select status from session_history_outbox where id=$1",
              [p.id],
            )
          ).rows[0]?.status === "processing",
      );
      worker.process.kill("SIGTERM");
      await wait(150);
      assert.equal(worker.process.exitCode, null);
      await hold.release();
      released = true;
      assert.equal(await worker.exit, 0);
      await completed(p.id);
      await noConnections(worker);
    } finally {
      if (!released) await hold.release();
      p.g.sockets.forEach((s) => s.disconnect());
      await stop(p.app);
      if (worker) await stop(worker);
    }
  },
);
test(
  "real lock timeout logs a safe retry and the worker subsequently commits once",
  { timeout: 25000 },
  async () => {
    const p = await pendingGame();
    let worker: Awaited<ReturnType<typeof start>> | undefined;
    const hold = await holdWorkspace(p.id);
    let released = false;
    try {
      await stop(p.app);
      worker = await start();
      await until(async () =>
        worker!.logs().includes("history.materialization_failed"),
      );
      assert.match(worker.logs(), /DB_TIMEOUT/);
      assert.match(worker.logs(), /"result":"retry"/);
      await hold.release();
      released = true;
      await completed(p.id);
      assert.ok(
        (
          await pool.query(
            "select attempt_count from session_history_outbox where id=$1",
            [p.id],
          )
        ).rows[0].attempt_count >= 2,
      );
      assert.equal(await stop(worker), 0);
    } finally {
      if (!released) await hold.release();
      p.g.sockets.forEach((s) => s.disconnect());
      await stop(p.app);
      if (worker) await stop(worker);
    }
  },
);
test(
  "commit before lost host acknowledgement, repeated END, expired lease takeover and deletion never resurrect",
  { timeout: 35000 },
  async () => {
    const p = await pendingGame();
    let worker: Awaited<ReturnType<typeof start>> | undefined;
    let restarted: Awaited<ReturnType<typeof start>> | undefined;
    let stopped = false;
    try {
      await emit(p.g.host, "host:action", { action: "end" });
      await emit(p.g.host, "host:action", { action: "end" });
      const hold = await holdWorkspace(p.id);
      let stale: ClaimedJob;
      try {
        worker = await start();
        stale = await until(
          async () =>
            (
              await pool.query(
                "select id,workspace_id,locked_by,attempt_count from session_history_outbox where id=$1 and status='processing'",
                [p.id],
              )
            ).rows[0],
        );
        await stop(worker, "SIGKILL");
      } finally {
        await hold.release();
      }
      // Explicit local fixture clock advancement exercises the real 60-second expiry predicate.
      await pool.query(
        "update session_history_outbox set locked_at=now()-interval '61 seconds' where id=$1",
        [p.id],
      );
      p.app.process.kill("SIGSTOP");
      stopped = true;
      worker = await start();
      await completed(p.id);
      await stop(p.app, "SIGKILL");
      stopped = false;
      assert.equal(p.app.process.signalCode, "SIGKILL");
      await stop(worker);
      restarted = await start({}, Number(new URL(p.app.origin).port));
      await completed(p.id);
      const queue = new HistoryOutbox(database.db);
      assert.equal(await queue.materialize(stale!), false);
      const deleted = await fetch(
        restarted.origin +
          `/api/v1/workspaces/${p.payload.workspaceId}/sessions/${p.id}`,
        {
          method: "DELETE",
          headers: {
            Origin: restarted.origin,
            Cookie: p.g.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: "delete" }),
        },
      );
      assert.equal(deleted.status, 204);
      assert.equal(await queue.enqueue(p.payload), "retired");
      assert.equal(await queue.materialize(stale!), false);
      await stop(restarted);
      restarted = await start({}, Number(new URL(p.app.origin).port));
      for (const table of [
        "session_runs",
        "session_segments",
        "session_participants",
        "session_history_outbox",
      ]) {
        const key = ["session_segments", "session_participants"].includes(table)
          ? "run_id"
          : "id";
        assert.equal(
          (
            await pool.query(
              `select count(*)::int n from ${table} where ${key}=$1`,
              [p.id],
            )
          ).rows[0].n,
          0,
        );
      }
      assert.ok(
        (
          await pool.query(
            "select deleted_at from session_history_receipts where id=$1",
            [p.id],
          )
        ).rows[0].deleted_at,
      );
      const audit = (
        await pool.query(
          "select action,metadata from workspace_audit_events where target_id=$1 and action='session.history_deleted'",
          [p.id],
        )
      ).rows;
      assert.equal(audit.length, 1);
      assert.deepEqual(Object.keys(audit[0].metadata), ["requestId"]);
      if (compiled)
        await writeFile(
          ".local/visual-qa/phase-6-acceptance/deletion-audit.json",
          JSON.stringify(audit, null, 2),
        );
    } finally {
      if (stopped) p.app.process.kill("SIGCONT");
      p.g.sockets.forEach((s) => s.disconnect());
      await stop(p.app);
      if (worker) await stop(worker);
      if (restarted) await stop(restarted);
    }
  },
);
test(
  "SIGKILL before durable enqueue loses the unconfirmed summary and never recovers a live room",
  { timeout: 20000 },
  async () => {
    const app = await start({ HISTORY_POLL_MS: "30000" });
    let clients: Socket[] = [];
    const hold = await pool.connect();
    try {
      const g = await game(app.origin);
      clients = g.sockets;
      const wid = (
        await (
          await fetch(app.origin + "/api/v1/workspaces", {
            headers: { Cookie: g.cookie },
          })
        ).json()
      ).items[0].id;
      await hold.query("begin");
      await hold.query("select id from workspaces where id=$1 for update", [
        wid,
      ]);
      const final = await g.finish();
      const id = final.state.history!.sessionId;
      await until(
        async () =>
          (
            await pool.query(
              "select count(*)::int n from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
              [app.application],
            )
          ).rows[0].n > 0,
      );
      assert.equal(await stop(app, "SIGKILL"), null);
      assert.equal(app.process.signalCode, "SIGKILL");
      await hold.query("rollback");
      const recovered = await start({}, Number(new URL(app.origin).port));
      try {
        await until(async () => (await fetch(recovered.origin + "/readyz")).ok);
        for (const table of [
          "session_runs",
          "session_history_outbox",
          "session_history_receipts",
        ])
          assert.equal(
            (
              await pool.query(
                `select count(*)::int n from ${table} where id=$1`,
                [id],
              )
            ).rows[0].n,
            0,
          );
        assert.doesNotMatch(app.logs(), /shutdown.completed/);
      } finally {
        await stop(recovered);
      }
    } finally {
      await hold.query("rollback");
      hold.release();
      clients.forEach((s) => s.disconnect());
      await stop(app);
    }
  },
);
test(
  "DB outage plus SIGTERM preserves liveness/live inputs and recovers an already committed job after restart",
  { timeout: 30000 },
  async () => {
    const { connect } = await import("node:net");
    const target = new URL(url!),
      targetHost = target.hostname,
      targetPort = Number(target.port || 5432);
    const connections = new Set<import("node:net").Socket>();
    let available = true;
    const proxy = tcpServer((client) => {
      if (!available) {
        client.destroy();
        return;
      }
      const upstream = connect({ host: targetHost, port: targetPort });
      connections.add(client);
      connections.add(upstream);
      const close = () => {
        connections.delete(client);
        connections.delete(upstream);
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
      client.on("close", close);
      upstream.on("close", close);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
    target.hostname = "127.0.0.1";
    target.port = String((proxy.address() as { port: number }).port);
    let app = await start({
      DATABASE_URL: target.href,
      HISTORY_POLL_MS: "30000",
    });
    const clients: Socket[] = [];
    try {
      const durable = await game(app.origin);
      clients.push(...durable.sockets);
      const final = await durable.finish(),
        id = final.state.history!.sessionId;
      await until(
        async () =>
          (
            await pool.query(
              "select id from session_history_outbox where id=$1",
              [id],
            )
          ).rows[0],
      );
      const active = await game(app.origin, {
        rounds: 2,
        submitInitially: false,
      });
      clients.push(...active.sockets);
      available = false;
      connections.forEach((s) => s.destroy());
      await until(
        async () => (await fetch(app.origin + "/readyz")).status === 503,
      );
      await probes(app, 503);
      const live = (await emit(active.host, "room:resume", active.identity))
        .state!;
      assert.equal(live.phase, "active");
      for (const guest of active.sockets.slice(1)) {
        await emit(guest, "player:input", {
          input: { choice: 0 },
          roundKey: live.roundKey,
        });
      }
      // No round is closed in this second room; its shutdown intentionally has no recap.
      await emit(active.host, "host:action", { action: "pause" });
      await emit(active.host, "host:action", { action: "pause" });
      assert.equal(
        (
          await fetch(app.origin + "/api/auth/sign-up/email", {
            method: "POST",
          })
        ).status,
        503,
      );
      assert.equal(await stop(app), 0);
      assert.match(app.logs(), /DB_UNAVAILABLE/);
      available = true;
      app = await start({ DATABASE_URL: target.href });
      await until(async () => (await fetch(app.origin + "/readyz")).ok);
      await probes(app);
      await completed(id);
    } finally {
      clients.forEach((s) => s.disconnect());
      await stop(app);
      connections.forEach((s) => s.destroy());
      await new Promise<void>((r) => proxy.close(() => r()));
    }
  },
);
test(
  "creative submissions and real session credentials stay out of captured operational logs",
  { timeout: 15000 },
  async () => {
    const app = await start();
    let sockets: Socket[] = [];
    try {
      const g = await game(app.origin, { creative: true });
      sockets = g.sockets;
      await probes(app);
      assert.equal(await stop(app), 0);
      await noConnections(app);
      // The after hook checks actual generated text, credentials and capabilities before persisting any logs.
    } finally {
      sockets.forEach((s) => s.disconnect());
      await stop(app);
    }
  },
);
