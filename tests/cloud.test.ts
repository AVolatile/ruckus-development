import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../src/auth/returnTo.js";
import { contentHash, parseDraft } from "../server/boards/content.js";
import { cloudEnvironment } from "../server/auth/environment.js";
import { newBoard } from "../shared/boards.js";
import { LocalBoardRepository } from "../src/studio/LocalBoardRepository.js";
test("returnTo only permits normalized app paths", () => {
  for (const value of [
    "https://attacker.invalid/app",
    "//attacker.invalid",
    "/application",
    "/app/../../join",
    "/app\\evil",
    "/app\n",
    "/app/%2e%2e/join",
    "",
    null,
  ])
    assert.equal(safeReturnTo(value), "/app");
  assert.equal(
    safeReturnTo("/app/studio/boards/new?source=invite#questions"),
    "/app/studio/boards/new?source=invite#questions",
  );
});
test("drafts preserve incomplete content but reject unsafe/invalid structures; hashes ignore authoritative metadata", () => {
  const board = newBoard();
  assert.equal(parseDraft(board).title, "");
  assert.throws(() => parseDraft({ ...board, questions: [] }));
  assert.throws(() => parseDraft({ ...board, title: "<script>" }));
  assert.throws(() =>
    parseDraft({
      ...board,
      questions: [board.questions[0], board.questions[0]],
    }),
  );
  assert.equal(
    contentHash(board),
    contentHash({ ...board, id: "ignored", updatedAt: "ignored" }),
  );
  assert.notEqual(
    contentHash(board),
    contentHash({ ...board, title: "Changed" }),
  );
  const reversed = Object.fromEntries(
    Object.entries(board).reverse(),
  ) as typeof board;
  assert.equal(contentHash(board), contentHash(reversed));
});
test("production requires explicit secure origin, secrets and database; unsupported split config fails closed", () => {
  assert.throws(() => cloudEnvironment({ NODE_ENV: "production" }));
  assert.throws(() =>
    cloudEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/local",
      AUTH_SECRET: "a".repeat(64),
      APP_ORIGIN: "http://example.test",
    }),
  );
  assert.throws(() =>
    cloudEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/local",
      AUTH_SECRET: "a".repeat(64),
      APP_ORIGIN: "https://example.test",
      REALTIME_ONLY: "true",
    }),
  );
  assert.equal(
    cloudEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost/local",
      AUTH_SECRET: "a".repeat(64),
      APP_ORIGIN: "http://localhost:4312",
    }).origin,
    "http://localhost:4312",
  );
});
test("local async adapter preserves the legacy payload and inspects valid/invalid migration candidates independently", async () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  const repository = new LocalBoardRepository(),
    board = newBoard();
  await repository.create(board);
  assert.equal((await repository.get(board.id))?.board.id, board.id);
  assert.equal((await repository.list()).items.length, 1);
  const original = JSON.stringify([board, { broken: true }]);
  data.set("ruckus-studio-v1", original);
  const candidates = repository.inspect();
  assert.ok(candidates[0].board);
  assert.ok(candidates[1].error);
  assert.equal(data.get("ruckus-studio-v1"), original);
});
