import { createAuthentication } from "../../server/auth/create-auth.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { connectDatabase } from "../../server/db/client.js";
import { BoardService } from "../../server/boards/service.js";
import { newBoard } from "../../shared/boards.js";
import type { BoardRecord, HostUser } from "../../shared/cloud.js";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.NODE_ENV === "production")
  throw new Error(
    "Integration tests require explicit TEST_DATABASE_URL and never run in production.",
  );
const parsed = new URL(testUrl);
if (
  !["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(parsed.pathname)
)
  throw new Error(
    "Integration database must be a local/CI ruckus_test database. No tests ran.",
  );
const { db, pool } = connectDatabase(testUrl),
  service = new BoardService(db);
const origin = "http://localhost:4311";
let child: ChildProcess,
  cookieA = "",
  cookieB = "",
  userA: HostUser,
  userB: HostUser;
const passphrase = "A real test passphrase, never a live password!";
const emailA = `a-${randomUUID()}@example.test`;
async function api(
  path: string,
  cookie = "",
  body?: unknown,
  method?: string,
  requestOrigin = origin,
) {
  return fetch(origin + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(!["GET", "HEAD"].includes(
        method || (body === undefined ? "GET" : "POST"),
      )
        ? { Origin: requestOrigin }
        : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(
  async () => {
    child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: testUrl,
        AUTH_SECRET: randomBytes(48).toString("base64url"),
        APP_ORIGIN: origin,
        PUBLIC_APP_URL: origin,
        PORT: "4311",
      },
      stdio: "ignore",
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin + "/ready")).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Starting process. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(
      ready,
      "Isolated integration app starts with migrated PostgreSQL",
    );
    const signup = async (email: string) => {
      const response = await api("/api/auth/sign-up/email", "", {
        email,
        name: "Host",
        password: passphrase,
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      return {
        cookie: response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
        user: payload.user as HostUser,
        cookies: response.headers.getSetCookie(),
      };
    };
    const a = await signup(emailA.toUpperCase());
    cookieA = a.cookie;
    userA = a.user;
    const b = await signup(`b-${randomUUID()}@example.test`);
    cookieB = b.cookie;
    userB = b.user;
    assert.equal(userA.email, emailA);
    assert.ok(
      a.cookies.some(
        (value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value),
      ),
    );
  },
  { timeout: 30000 },
);
after(async () => {
  child?.kill("SIGTERM");
  if (userA && userB)
    await pool.query("delete from session where user_id = any($1::text[])", [
      [userA.id, userB.id],
    ]);
  await pool.end();
});

test("real accounts: normalization, duplicate signup, generic login, session restore/revoke, unsafe origins and payload limits", async () => {
  assert.equal((await api("/api/v1/me")).status, 401);
  const me = await api("/api/v1/me", cookieA);
  assert.equal((await me.json()).user.id, userA.id);
  const duplicate = await api("/api/auth/sign-up/email", "", {
    email: emailA,
    name: "Host",
    password: passphrase,
  });
  assert.ok([400, 422].includes(duplicate.status));
  const bad = await api("/api/auth/sign-in/email", "", {
    email: emailA,
    password: "Incorrect passphrase",
  });
  assert.equal(bad.status, 401);
  const absent = await api("/api/auth/sign-in/email", "", {
    email: `absent-${randomUUID()}@example.test`,
    password: "Incorrect passphrase",
  });
  assert.equal(absent.status, 401);
  assert.equal((await bad.json()).message, (await absent.json()).message);
  const login = await api("/api/auth/sign-in/email", "", {
    email: ` ${emailA.toUpperCase()} `,
    password: passphrase,
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.equal((await api("/api/v1/me", loginCookie)).status, 200);
  assert.equal((await api("/api/auth/sign-out", loginCookie, {})).status, 200);
  assert.equal((await api("/api/v1/me", loginCookie)).status, 401);
  const cross = await api(
    "/api/v1/boards",
    cookieA,
    { board: newBoard() },
    "POST",
    "https://attacker.invalid",
  );
  assert.equal(cross.status, 403);
  assert.equal(
    (
      await api(
        "/api/auth/sign-in/email",
        "",
        { email: emailA, password: passphrase },
        "POST",
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  const malformed = await fetch(origin + "/api/v1/boards", {
    method: "POST",
    headers: {
      Cookie: cookieA,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  const oversized = await api("/api/auth/sign-in/email", "", {
    email: emailA,
    password: "a".repeat(18000),
  });
  assert.equal(oversized.status, 413);
  const accountRows = await pool.query(
    "select password from account where user_id = $1",
    [userA.id],
  );
  assert.notEqual(accountRows.rows[0].password, passphrase);
  assert.ok(accountRows.rows[0].password.length > 32);
});

test("owner-scoped CRUD, safe summaries, non-enumeration, immutable revisions, conflicts, no-op and atomic concurrency", async () => {
  const createdResponse = await api("/api/v1/boards", cookieA, {
    board: newBoard(),
    clientKey: `draft:${randomUUID()}`,
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as BoardRecord;
  const id = created.board.id;
  assert.equal(created.revisionNumber, 1);
  const list = await (await api("/api/v1/boards?limit=1", cookieA)).json();
  assert.ok(list.items.some((item: { id: string }) => item.id === id));
  assert.equal(list.items[0].questions, undefined);
  assert.deepEqual(
    (await (await api("/api/v1/boards", cookieB)).json()).items,
    [],
  );
  for (const method of ["GET", "PUT", "DELETE"]) {
    const unauthorized = await api(
      `/api/v1/boards/${id}`,
      cookieB,
      method === "PUT"
        ? { board: created.board, baseRevisionId: created.revisionId }
        : undefined,
      method,
    );
    assert.equal(unauthorized.status, 404);
    assert.equal((await unauthorized.json()).error.code, "BOARD_NOT_FOUND");
  }
  assert.equal(
    (await api(`/api/v1/boards/${randomUUID()}`, cookieB)).status,
    404,
  );
  const edited = { ...created.board, title: "Cloud persists" };
  const saved = await service.save(userA.id, id, edited, created.revisionId);
  assert.equal(saved.revisionNumber, 2);
  const noOp = await service.save(
    userA.id,
    id,
    { ...saved.board, updatedAt: new Date(0).toISOString() },
    saved.revisionId,
  );
  assert.equal(noOp.revisionId, saved.revisionId);
  await assert.rejects(service.save(userA.id, id, edited, created.revisionId), {
    code: "BOARD_CONFLICT",
    status: 409,
  });
  const staleHttp = await api(
    `/api/v1/boards/${id}`,
    cookieA,
    { board: edited, baseRevisionId: created.revisionId },
    "PUT",
  );
  assert.equal(staleHttp.status, 409);
  assert.equal((await staleHttp.json()).error.code, "BOARD_CONFLICT");
  const races = await Promise.allSettled([
    service.save(
      userA.id,
      id,
      { ...saved.board, title: "First concurrent" },
      saved.revisionId,
    ),
    service.save(
      userA.id,
      id,
      { ...saved.board, title: "Second concurrent" },
      saved.revisionId,
    ),
  ]);
  assert.equal(
    races.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const old = await pool.query(
    "select content from board_revisions where id = $1",
    [created.revisionId],
  );
  assert.equal(old.rows[0].content.title, "");
  await assert.rejects(
    pool.query("update board_revisions set source = $1 where id = $2", [
      "tamper",
      created.revisionId,
    ]),
    /immutable/,
  );
  const invalid = await api("/api/v1/boards", cookieA, {
    board: { ...newBoard(), questions: [] },
  });
  assert.equal(invalid.status, 400);
  await service.delete(userA.id, id);
  await assert.rejects(service.get(userA.id, id), { code: "BOARD_NOT_FOUND" });
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from board_revisions where board_id = $1",
        [id],
      )
    ).rows[0].count,
    3,
  );
});

test("local import returns per-board failures, retries never duplicate, and owner-scoped keys work concurrently", async () => {
  const key = randomUUID(),
    board = newBoard();
  const batch = await api("/api/v1/boards/import", cookieA, {
    boards: [
      { key, board },
      { key: "invalid", board: { invalid: true } },
    ],
  });
  assert.equal(batch.status, 207);
  const result = await batch.json();
  assert.ok(result.results[0].id);
  assert.equal(result.results[1].code, "VALIDATION_ERROR");
  const [retry, concurrent] = await Promise.all([
    service.import(userA.id, [{ key, board }]),
    service.import(userA.id, [{ key, board }]),
  ]);
  assert.equal(retry[0].id, result.results[0].id);
  assert.equal(concurrent[0].id, result.results[0].id);
  const other = await service.import(userB.id, [{ key, board }]);
  assert.notEqual(other[0].id, result.results[0].id);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from boards where owner_user_id = $1 and client_import_key = $2",
        [userA.id, `local:${key}`],
      )
    ).rows[0].count,
    1,
  );
});

test("production session cookies use host-only Secure/HttpOnly/Lax attributes", async () => {
  const secureAuth = createAuthentication(db, {
    origin: "https://ruckus.example",
    secret: randomBytes(48).toString("base64url"),
    production: true,
  });
  const response = await secureAuth.api.signInEmail({
    body: { email: emailA, password: passphrase },
    headers: new Headers({ Origin: "https://ruckus.example" }),
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.find((value) =>
    value.includes("ruckus.session_token="),
  );
  assert.ok(cookie);
  assert.ok(
    /^__Host-ruckus\.session_token=/.test(cookie),
    "Exact __Host session cookie name",
  );
  assert.ok(/; Secure/i.test(cookie), "Secure cookie");
  assert.ok(/; HttpOnly/i.test(cookie), "HttpOnly cookie");
  assert.ok(/SameSite=Lax/i.test(cookie), "SameSite=Lax cookie");
  assert.ok(/Path=\//i.test(cookie), "Root cookie path");
  assert.ok(!/Domain=/i.test(cookie), "No Domain attribute");
  const restored = await secureAuth.api.getSession({
    headers: new Headers({ Cookie: cookie.split(";")[0] }),
  });
  assert.equal(restored?.user.id, userA.id);
});
