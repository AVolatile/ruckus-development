import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { connectDatabase } from "../../server/db/client.js";
import { createAuthentication } from "../../server/auth/create-auth.js";
import {
  MemoryEmailTransport,
  createEmailTransport,
} from "../../server/email/transport.js";
import { WorkspaceService } from "../../server/workspaces/service.js";
import { BoardService } from "../../server/boards/service.js";
import { BrandService } from "../../server/brand/service.js";
import { PostgresBrandAssetStore } from "../../server/brand/assets.js";
import { authorize } from "../../server/workspaces/policy.js";
import {
  defaultBrandConfig,
  resolveBrandSnapshot,
} from "../../shared/brand.js";
import { newBoard } from "../../shared/boards.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV === "production")
  throw new Error("Explicit isolated TEST_DATABASE_URL required.");
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1", "postgres"].includes(parsed.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(parsed.pathname)
)
  throw new Error("Only local/CI test databases are supported.");
const { db, pool } = connectDatabase(url),
  mail = new MemoryEmailTransport(),
  origin = "http://localhost:4313",
  auth = createAuthentication(
    db,
    {
      origin,
      secret: randomBytes(48).toString("base64url"),
      production: false,
    },
    mail,
  ),
  ws = new WorkspaceService(db, mail, origin),
  boards = new BoardService(db),
  brands = new BrandService(db),
  assets = new PostgresBrandAssetStore(db);
const password = "A private automated test passphrase!";
async function authRequest(path: string, body?: unknown, cookie = "") {
  return auth.handler(
    new Request(origin + "/api/auth/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
async function signup(verified = true) {
  const email = `p2-${randomUUID()}@example.test`;
  const response = await authRequest("sign-up/email", {
    email,
    name: "Test collaborator",
    password,
  });
  assert.equal(response.status, 200);
  const person = (await response.json()).user as { id: string; email: string };
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const message = mail.messages.find((m) => m.to === email)!;
  assert.ok(message, "Real verification email captured");
  const link = new URL(
    message.text.split("\n").find((l) => l.startsWith(origin))!,
  );
  if (verified) {
    const result = await authRequest(
      `verify-email?token=${encodeURIComponent(link.searchParams.get("token")!)}`,
    );
    assert.equal(result.status, 200);
  }
  return { ...person, cookie, token: link.searchParams.get("token")! };
}
async function invite(
  owner: string,
  wid: string,
  person: { id: string; email: string },
  role: "owner" | "admin" | "host" | "viewer" = "host",
) {
  await ws.invite(owner, wid, { email: person.email, role });
  const message = mail.messages
    .filter((m) => m.to === person.email && m.subject.startsWith("Join"))
    .at(-1)!;
  const token = new URL(
    message.text.split("\n").find((l) => l.startsWith(origin))!,
  ).pathname
    .split("/")
    .at(-1)!;
  return token;
}
after(async () => {
  await pool.end();
});

test("Phase 1 migration fixture preserves identities, revisions, authorship, timestamps, deleted state and import keys", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schema = "fixture_" + randomUUID().replaceAll("-", "");
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}`);
    async function apply(file: string) {
      const sql = await readFile(file, "utf8");
      for (const statement of sql
        .replaceAll('"public".', `"${schema}".`)
        .split("--> statement-breakpoint"))
        if (statement.trim()) await client.query(statement);
    }
    await apply("migrations/0000_host_cloud_foundation.sql");
    await apply("migrations/0001_revision_invariants.sql");
    const a = randomUUID(),
      b = randomUUID();
    await client.query(
      'insert into "user" (id,name,email) values ($1,$2,$3),($4,$2,$5)',
      [a, "Existing host", `${a}@example.test`, b, `${b}@example.test`],
    );
    const ids = [randomUUID(), randomUUID()];
    for (let i = 0; i < 2; i++) {
      const bid = ids[i],
        rid = randomUUID(),
        rid2 = randomUUID(),
        board = {
          ...newBoard(),
          id: bid,
          title: "Existing board",
          createdAt: "2025-01-02T03:04:05.000Z",
          updatedAt: "2025-01-03T03:04:05.000Z",
        };
      await client.query(
        "insert into boards (id,owner_user_id,title,description,current_revision_id,client_import_key,created_at,updated_at,deleted_at) values ($1,$2,$3,'',$4,$5,$6,$7,$8)",
        [
          bid,
          i ? a : b,
          board.title,
          rid2,
          `local:old-${i}`,
          board.createdAt,
          board.updatedAt,
          i ? new Date() : null,
        ],
      );
      for (const [number, revision] of [
        [1, rid],
        [2, rid2],
      ] as const)
        await client.query(
          "insert into board_revisions (id,board_id,revision_number,content,content_hash,created_by_user_id,source) values ($1,$2,$3,$4,'historical-hash',$5,'studio')",
          [revision, bid, number, board, i ? a : b],
        );
    }
    const before = (await client.query("select * from boards order by id"))
      .rows;
    const history = (
      await client.query("select * from board_revisions order by id")
    ).rows;
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await apply("migrations/0002_workspaces_brand_kits.sql");
    const after = (await client.query("select * from boards order by id")).rows;
    for (let i = 0; i < 2; i++) {
      const { workspace_id, created_by_user_id, ...rest } = after[i];
      assert.equal(created_by_user_id, before[i].owner_user_id);
      const { owner_user_id, ...old } = before[i];
      assert.ok(owner_user_id);
      assert.deepEqual(rest, old);
      const personal = (
        await client.query("select * from workspaces where id=$1", [
          workspace_id,
        ])
      ).rows[0];
      assert.equal(personal.created_by_user_id, created_by_user_id);
      assert.equal(personal.kind, "personal");
    }
    assert.deepEqual(
      (await client.query("select * from board_revisions order by id")).rows,
      history,
    );
    assert.equal(
      (
        await client.query(
          "select count(*)::int n from workspaces where kind='personal'",
        )
      ).rows[0].n,
      2,
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

test("real email verification and password recovery: expiry, one-time use, generic reset and session revocation", async () => {
  const person = await signup(false);
  await assert.rejects(ws.create(person.id, "Unverified org"), {
    code: "EMAIL_VERIFICATION_REQUIRED",
  });
  assert.equal(
    (
      await authRequest(
        `verify-email?token=${encodeURIComponent(person.token)}`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await authRequest(
        `verify-email?token=${encodeURIComponent(person.token)}`,
      )
    ).status,
    401,
  );
  const expired = await signup(false);
  await pool.query(
    "update verification set expires_at=now()-interval '1 second' where value=$1",
    [expired.id],
  );
  assert.equal(
    (
      await authRequest(
        `verify-email?token=${encodeURIComponent(expired.token)}`,
      )
    ).status,
    401,
  );
  const known = await authRequest("request-password-reset", {
    email: person.email,
    redirectTo: origin + "/reset-password",
  });
  const absent = await authRequest("request-password-reset", {
    email: `missing-${randomUUID()}@example.test`,
    redirectTo: origin + "/reset-password",
  });
  assert.equal(known.status, absent.status);
  assert.deepEqual(await known.json(), await absent.json());
  const message = mail.messages
    .filter((m) => m.to === person.email && m.subject.startsWith("Reset"))
    .at(-1)!;
  const token = new URL(
    message.text.split("\n").find((l) => l.startsWith(origin))!,
  ).searchParams.get("token")!;
  assert.equal(
    (
      await authRequest("reset-password", {
        token,
        newPassword: password + " changed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await authRequest("reset-password", {
        token,
        newPassword: password + " changed again",
      })
    ).status,
    400,
  );
  assert.ok(
    (await auth.api.getSession({
      headers: new Headers({ Cookie: person.cookie }),
    })) === null,
    "Password reset revokes the prior session",
  );
  assert.equal(
    (
      await authRequest("sign-in/email", {
        email: person.email,
        password: password + " changed",
      })
    ).status,
    200,
  );
  await authRequest("request-password-reset", {
    email: expired.email,
    redirectTo: origin + "/reset-password",
  });
  const expiredMessage = mail.messages
    .filter((m) => m.to === expired.email && m.subject.startsWith("Reset"))
    .at(-1)!;
  const expiredToken = new URL(
    expiredMessage.text.split("\n").find((l) => l.startsWith(origin))!,
  ).searchParams.get("token")!;
  await pool.query(
    "update verification set expires_at=now()-interval '1 second' where identifier=$1",
    [`reset-password:${expiredToken}`],
  );
  assert.equal(
    (
      await authRequest("reset-password", {
        token: expiredToken,
        newPassword: password,
      })
    ).status,
    400,
  );
  assert.throws(
    () =>
      createEmailTransport({ NODE_ENV: "production", EMAIL_TRANSPORT: "file" }),
    /SMTP/,
  );
  assert.throws(
    () =>
      createEmailTransport({
        NODE_ENV: "production",
        EMAIL_TRANSPORT: "memory",
      }),
    /SMTP/,
  );
});

test("verified invitations, RBAC, shared board authorship, copies, retired imports, IDOR and archive", async () => {
  const owner = await signup(),
    host = await signup(),
    viewer = await signup(),
    admin = await signup(),
    outsider = await signup(),
    unverified = await signup(false);
  const org = await ws.create(owner.id, "The test room");
  assert.equal((await ws.get(owner.id, org.id)).role, "owner");
  await assert.rejects(ws.get(outsider.id, org.id), {
    code: "WORKSPACE_NOT_FOUND",
  });
  for (const [person, role] of [
    [host, "host"],
    [viewer, "viewer"],
    [admin, "admin"],
  ] as const) {
    const token = await invite(owner.id, org.id, person, role);
    const results = await Promise.allSettled([
      ws.accept(person.id, token),
      ws.accept(person.id, token),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  }
  const pending = await invite(owner.id, org.id, unverified);
  await assert.rejects(ws.accept(unverified.id, pending), {
    code: "EMAIL_VERIFICATION_REQUIRED",
  });
  await assert.rejects(ws.accept(outsider.id, pending), {
    code: "INVITATION_INVALID",
  });
  const revocable = await ws.pending(owner.id, org.id);
  await ws.revoke(
    owner.id,
    org.id,
    revocable.find((i) => i.email === unverified.email)!.id,
  );
  await assert.rejects(
    ws.invite(host.id, org.id, { email: outsider.email, role: "host" }),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(
    ws.invite(viewer.id, org.id, { email: outsider.email, role: "host" }),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(
    ws.invite(admin.id, org.id, { email: outsider.email, role: "owner" }),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(ws.changeMember(admin.id, org.id, admin.id, "owner"), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(ws.changeMember(owner.id, org.id, owner.id), {
    code: "FINAL_OWNER",
  });
  await assert.rejects(ws.changeMember(owner.id, org.id, owner.id, "host"), {
    code: "FINAL_OWNER",
  });
  await assert.rejects(ws.archive(host.id, org.id), {
    code: "PERMISSION_DENIED",
  });
  const revokedToken = await invite(admin.id, org.id, outsider, "viewer");
  const pendingInvite = (await ws.pending(admin.id, org.id)).find(
    (row) => row.email === outsider.email,
  )!;
  const stored = (
    await pool.query(
      "select token_hash from workspace_invitations where id=$1",
      [pendingInvite.id],
    )
  ).rows[0];
  assert.ok(
    stored.token_hash !== revokedToken &&
      /^[a-f0-9]{64}$/.test(stored.token_hash),
    "Only a SHA-256 invitation hash is persisted",
  );
  await ws.revoke(admin.id, org.id, pendingInvite.id);
  await assert.rejects(ws.accept(outsider.id, revokedToken), {
    code: "INVITATION_INVALID",
  });
  const expiredToken = await invite(admin.id, org.id, outsider, "admin");
  await pool.query(
    "update workspace_invitations set expires_at=now()-interval '1 second' where workspace_id=$1 and email_normalized=$2 and revoked_at is null",
    [org.id, outsider.email],
  );
  await assert.rejects(ws.accept(outsider.id, expiredToken), {
    code: "INVITATION_INVALID",
  });
  await ws.accept(
    outsider.id,
    await invite(admin.id, org.id, outsider, "admin"),
  );
  await ws.changeMember(admin.id, org.id, outsider.id, "viewer");
  await ws.changeMember(admin.id, org.id, outsider.id);
  const record = await boards.create(
    owner.id,
    { ...newBoard(), title: "Shared board" },
    undefined,
    "studio",
    org.id,
  );
  assert.equal(
    (await boards.get(host.id, record.board.id, org.id)).board.title,
    "Shared board",
  );
  const saved = await boards.save(
    host.id,
    record.board.id,
    { ...record.board, title: "Edited by host" },
    record.revisionId,
    org.id,
  );
  assert.equal(
    (
      await pool.query(
        "select created_by_user_id from board_revisions where id=$1",
        [saved.revisionId],
      )
    ).rows[0].created_by_user_id,
    host.id,
  );
  await assert.rejects(
    boards.save(
      owner.id,
      record.board.id,
      record.board,
      record.revisionId,
      org.id,
    ),
    { code: "BOARD_CONFLICT" },
  );
  await assert.rejects(
    boards.save(
      viewer.id,
      record.board.id,
      saved.board,
      saved.revisionId,
      org.id,
    ),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(boards.get(outsider.id, record.board.id, org.id), {
    code: "WORKSPACE_NOT_FOUND",
  });
  await authorize(db, host.id, org.id, "boards.launch");
  await assert.rejects(authorize(db, viewer.id, org.id, "boards.launch"), {
    code: "PERMISSION_DENIED",
  });
  const personal = (await ws.list(viewer.id)).find(
    (w) => w.kind === "personal",
  )!;
  const copy = await boards.copy(
    viewer.id,
    org.id,
    record.board.id,
    personal.id,
  );
  assert.notEqual(copy.board.id, record.board.id);
  assert.equal(copy.revisionNumber, 1);
  assert.equal(copy.board.title, "Edited by host (copy)");
  const key = randomUUID(),
    source = newBoard();
  const first = await boards.import(host.id, [{ key, board: source }], org.id);
  const retry = await boards.import(host.id, [{ key, board: source }], org.id);
  assert.equal(first[0].id, retry[0].id);
  const own = (await ws.list(host.id)).find((w) => w.kind === "personal")!;
  assert.notEqual(
    (await boards.import(host.id, [{ key, board: source }], own.id))[0].id,
    first[0].id,
  );
  await boards.delete(host.id, first[0].id!, org.id);
  assert.equal(
    (await boards.import(host.id, [{ key, board: source }], org.id))[0].code,
    "IMPORT_RETIRED",
  );
  await assert.rejects(
    ws.invite(owner.id, own.id, { email: outsider.email, role: "host" }),
    { code: "WORKSPACE_NOT_FOUND" },
  );
  await ws.changeMember(owner.id, org.id, admin.id, "owner");
  const races = await Promise.allSettled([
    ws.changeMember(owner.id, org.id, owner.id, "host"),
    ws.changeMember(admin.id, org.id, admin.id, "host"),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  const finalOwner = (await ws.members(owner.id, org.id)).items.find(
    (m) => m.role === "owner",
  )!;
  const activity = await ws.activity(finalOwner.userId, org.id);
  assert.ok(activity.items.some((e) => e.action === "board.created"));
  await assert.rejects(
    pool.query("delete from workspace_audit_events where id=$1", [
      activity.items[0].id,
    ]),
    /immutable/,
  );
  await ws.archive(finalOwner.userId, org.id);
  assert.ok(!(await ws.list(host.id)).some((w) => w.id === org.id));
  await assert.rejects(boards.get(host.id, record.board.id, org.id), {
    code: "WORKSPACE_NOT_FOUND",
  });
});

test("Brand revisions, conflicts, defaults, validated private assets, immutable snapshots and cross-workspace isolation", async () => {
  const owner = await signup(),
    host = await signup(),
    outsider = await signup();
  const org = await ws.create(owner.id, "Brand test room");
  await ws.accept(host.id, await invite(owner.id, org.id, host));
  const png = await sharp({
    create: { width: 80, height: 60, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  const logo = await assets.put(owner.id, org.id, "logo", "image/png", png);
  assert.equal(logo.mimeType, "image/webp");
  assert.equal(logo.width, 80);
  await assert.rejects(
    assets.put(owner.id, org.id, "logo", "image/jpeg", png),
    { code: "INVALID_IMAGE" },
  );
  await assert.rejects(
    assets.put(
      owner.id,
      org.id,
      "logo",
      "image/png",
      Buffer.from("not an image"),
    ),
    { code: "INVALID_IMAGE" },
  );
  await assert.rejects(
    assets.put(
      owner.id,
      org.id,
      "logo",
      "image/png",
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ),
    { code: "IMAGE_TOO_LARGE" },
  );
  await assert.rejects(assets.put(host.id, org.id, "logo", "image/png", png), {
    code: "PERMISSION_DENIED",
  });
  const huge = await sharp({
    create: { width: 5000, height: 10, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    assets.put(owner.id, org.id, "logo", "image/png", huge),
    { code: "INVALID_IMAGE" },
  );
  await assert.rejects(assets.get(outsider.id, org.id, logo.id), {
    code: "WORKSPACE_NOT_FOUND",
  });
  const input = {
    name: "Main kit",
    config: {
      ...defaultBrandConfig,
      logoAssetId: logo.id,
      primaryColor: "#aabbcc",
    },
  };
  const first = await brands.write(owner.id, org.id, input);
  assert.equal(first.config.primaryColor, "#AABBCC");
  assert.equal(first.revisionNumber, 1);
  assert.equal(first.isDefault, true);
  const noOp = await brands.write(
    owner.id,
    org.id,
    { ...input, baseRevisionId: first.revisionId },
    first.id,
  );
  assert.equal(noOp.revisionId, first.revisionId);
  const races = await Promise.allSettled([
    brands.write(
      owner.id,
      org.id,
      { ...input, name: "First editor", baseRevisionId: first.revisionId },
      first.id,
    ),
    brands.write(
      owner.id,
      org.id,
      { ...input, name: "Second editor", baseRevisionId: first.revisionId },
      first.id,
    ),
  ]);
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    races.some(
      (r) => r.status === "rejected" && r.reason.code === "BRAND_CONFLICT",
    ),
  );
  const current = await brands.get(host.id, org.id, first.id);
  const snapshot = resolveBrandSnapshot(current);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.config));
  assert.ok(snapshot.colors.every((c) => c.ratio >= 4.5));
  await assert.rejects(brands.write(host.id, org.id, input), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(brands.get(outsider.id, org.id, first.id), {
    code: "WORKSPACE_NOT_FOUND",
  });
  const own = (await ws.list(owner.id)).find((w) => w.kind === "personal")!;
  await assert.rejects(brands.write(owner.id, own.id, input), {
    code: "INVALID_BRAND_ASSET",
  });
  await assert.rejects(assets.delete(owner.id, org.id, logo.id), {
    code: "ASSET_REFERENCED",
  });
  await assert.rejects(
    pool.query("update brand_kit_revisions set name='tamper' where id=$1", [
      first.revisionId,
    ]),
    /immutable/,
  );
  const second = await brands.write(owner.id, org.id, {
    name: "Other kit",
    config: defaultBrandConfig,
  });
  await brands.setDefault(owner.id, org.id, second.id);
  assert.equal((await brands.get(owner.id, org.id, second.id)).isDefault, true);
  await brands.delete(owner.id, org.id, second.id);
  assert.equal((await brands.get(owner.id, org.id, first.id)).isDefault, true);
  await brands.delete(owner.id, org.id, first.id);
  assert.equal((await brands.list(owner.id, org.id)).items.length, 0);
});
