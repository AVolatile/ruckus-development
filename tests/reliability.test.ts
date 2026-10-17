import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { startupConfig } from "../server/ops/config.js";
import { Lifecycle } from "../server/ops/lifecycle.js";
import { failureCode, log, OperationalError } from "../server/ops/log.js";
import {
  validatedSummary,
  retryDelay,
  MAX_ATTEMPTS,
} from "../server/history/outbox.js";
import { roleCapabilities } from "../shared/workspaces.js";
import { Room } from "../server/engine.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import { playRoom, roomSummary } from "./support/history.js";
import { socketClientAddress } from "../server/ops/client-address.js";
import { summaryHash } from "../server/history/service.js";
import { SessionFinalizer } from "../server/history/finalizer.js";
const env = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost/ruckus_test",
  TEST_DATABASE_URL: "postgresql://u:p@localhost/ruckus_test",
  AUTH_SECRET: "A local isolated configuration secret!",
  APP_ORIGIN: "http://localhost:4312",
};
test("startup rejects wrong environment, shared test database, invalid bounds, proxy and production defaults", () => {
  assert.equal(startupConfig(env).workerConcurrency, 2);
  assert.equal(
    startupConfig({
      ...env,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://account:private@database.example/ruckus_main",
      AUTH_SECRET:
        "ab39d748c61e902fead2c4019e74d2ef913a64bc7d89a632a7e91c752d046ab18",
      APP_ORIGIN: "https://ruckus.example",
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.example",
      EMAIL_FROM: "Ruckus <no-reply@ruckus.example>",
    }).production,
    true,
  );
  for (const patch of [
    { NODE_ENV: "prod" },
    { DATABASE_URL: "postgres://localhost/ruckus_development" },
    { TEST_DATABASE_URL: undefined },
    { HISTORY_WORKER_CONCURRENCY: "0" },
    { HISTORY_POLL_MS: "1" },
    { SHUTDOWN_TIMEOUT_MS: "NaN" },
    { TRUST_PROXY: "true" },
    { SMTP_SECURE: "yes" },
    { DRAIN_MODE: "maybe" },
    {
      NODE_ENV: "production",
      APP_ORIGIN: "https://ruckus.example",
      AUTH_SECRET: "x".repeat(64),
    },
  ])
    assert.throws(() => startupConfig({ ...env, ...patch }));
});
test("startup failure is a sanitized structured event without secret values or native exception dump", () => {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "server/start.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://private:DO_NOT_PRINT_SECRET@localhost/ruckus_development",
        AUTH_SECRET: "DO_NOT_PRINT_SECRET",
      },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 1);
  assert.match(child.stdout, /CONFIG_INVALID/);
  assert.ok(!(child.stdout + child.stderr).includes("DO_NOT_PRINT_SECRET"));
  assert.ok(!child.stderr.includes(" at "));
});
test("drain rejects new rooms without pretending to persist existing room state; stop is idempotent", () => {
  const l = new Lifecycle();
  assert.equal(l.acceptingRooms, true);
  l.drain();
  assert.equal(l.acceptingRooms, false);
  assert.equal(l.stopping, false);
  assert.equal(l.stop(), true);
  assert.equal(l.stop(), false);
});
test("operational fields are allowlisted and stable error categories never serialize secrets", () => {
  const lines: string[] = [];
  log(
    "api.failure",
    {
      code: "DB_TIMEOUT",
      requestId: "safe-uuid",
      ...({
        password: "PRIVATE",
        payload: "PRIVATE",
        cookie: "PRIVATE",
      } as object),
    },
    "error",
    (line) => lines.push(line),
  );
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("PRIVATE"));
  assert.equal(failureCode({ cause: { code: "57014" } }), "DB_TIMEOUT");
  assert.equal(failureCode({ code: "55P03" }), "DB_TIMEOUT");
  assert.equal(failureCode({ code: "ECONNREFUSED" }), "DB_UNAVAILABLE");
  assert.equal(
    failureCode(new OperationalError("HISTORY_PAYLOAD_MISMATCH")),
    "HISTORY_PAYLOAD_MISMATCH",
  );
  assert.doesNotThrow(() =>
    log("test", {}, "info", () => {
      throw Error("sink");
    }),
  );
});
test("bounded final payload rejects creative content and oversize data; retry policy terminates", () => {
  const r = playRoom("caption-this");
  try {
    const s = roomSummary(r);
    assert.deepEqual(validatedSummary(s), s);
    assert.equal(
      summaryHash({ ...s, source: { ...s.source, boardId: undefined } }),
      summaryHash(JSON.parse(JSON.stringify(s))),
    );
    assert.throws(() => validatedSummary(undefined));
    assert.throws(() => validatedSummary({ ...s, rawText: "PRIVATE" }));
    assert.throws(() => validatedSummary({ text: "x".repeat(2_000_001) }));
  } finally {
    r.dispose();
  }
  assert.equal(MAX_ATTEMPTS, 8);
  assert.deepEqual(
    [1, 2, 3, 4, 8].map((a) => retryDelay(a, () => 0)),
    [1000, 2000, 4000, 8000, 60000],
  );
  assert.equal(roleCapabilities.host.includes("history.delete"), false);
  assert.equal(roleCapabilities.viewer.includes("history.delete"), false);
  assert.equal(roleCapabilities.admin.includes("history.delete"), true);
});
test("socket proxy addresses trust only a reviewed loopback hop and cannot accept forged chains", () => {
  assert.equal(
    socketClientAddress("203.0.113.9", "198.51.100.4", true),
    "203.0.113.9",
  );
  assert.equal(
    socketClientAddress("127.0.0.1", "198.51.100.4", false),
    "127.0.0.1",
  );
  assert.equal(
    socketClientAddress(
      "127.0.0.1",
      "198.51.100.4, 203.0.113.9, 127.0.0.1",
      true,
    ),
    "203.0.113.9",
  );
  assert.equal(
    socketClientAddress("::ffff:127.0.0.1", "198.51.100.4", true),
    "198.51.100.4",
  );
  assert.equal(socketClientAddress("::1", "bad input", true), "::1");
});
test("disposed room timers and bots cannot publish after removal", async () => {
  let publishes = 0;
  const r = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], rounds: 1 },
    "http://localhost",
    () => publishes++,
  );
  r.addBots(2);
  r.action("start");
  r.action("next");
  r.dispose();
  const before = publishes;
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(publishes, before);
});
test("saturated pre-handoff queue fails explicitly and never reports an enqueued recap as saved", async () => {
  const room = playRoom();
  const summary = roomSummary(room);
  room.dispose();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = new SessionFinalizer(
      () => gate,
      [],
      () => {},
      "pending",
    ),
    statuses: string[] = [];
  const pending = Array.from({ length: 133 }, () =>
    writer.submit(summary, (s) => statuses.push(s.status)),
  );
  assert.equal(statuses.filter((s) => s === "failed").length, 1);
  assert.equal(statuses.includes("saved"), false);
  release();
  await Promise.all(pending);
  await writer.drain();
  assert.equal(statuses.filter((s) => s === "pending").length, 132);
  assert.equal(statuses.includes("saved"), false);
});
