import { test } from "node:test";
import assert from "node:assert/strict";
import {
  builtInPacks,
  validateBuiltIns,
} from "../server/content-packs/built-ins.js";
import { packHash } from "../server/content-packs/hash.js";
import {
  emptyPack,
  validatePack,
  packContentSchema,
  packExportSchema,
  packExport,
  packFiltersSchema,
  selectPackPrompts,
  copyPackName,
} from "../shared/content-packs.js";
import { eventDefinitionSchema, eventTemplate } from "../shared/events.js";
import { randomUUID } from "node:crypto";
import { Room } from "../server/engine.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
test("all six migrated banks preserve every field, topic fallback and wraparound across 500 offsets", () => {
  const unicodeName = "a".repeat(92) + "😀" + "z".repeat(6);
  assert.equal(copyPackName(unicodeName), "a".repeat(92) + " (copy)");
  const unsafeId = structuredClone(builtInPacks[0].document);
  unsafeId.content.items[0].id = "\ud800";
  assert.throws(() => validatePack(unsafeId));
  assert.deepEqual(
    validateBuiltIns().map((p) => p.items),
    [169, 32, 12, 15, 10, 12, 12],
  );
});
test("per-game documents reject malformed choices, incompatible fields, scenes, markup, duplicate IDs and oversized content", () => {
  for (const p of builtInPacks.slice(0, 6)) {
    assert.deepEqual(validatePack(p.document), p.document);
    const d = structuredClone(p.document);
    d.content.items[0].title = "<script>alert(1)</script>";
    assert.throws(() => validatePack(d));
    const dup = structuredClone(p.document);
    dup.content.items.push(dup.content.items[0]);
    assert.throws(() => validatePack(dup));
    const big = structuredClone(p.document);
    big.content.items = Array.from({ length: 501 }, (_, i) => ({
      ...big.content.items[0],
      id: String(i),
    })) as typeof big.content.items;
    assert.throws(() => validatePack(big));
  }
  const d = structuredClone(builtInPacks[0].document);
  if (d.content.gameType !== "hotwire") throw Error();
  d.content.items[0].answer = 5;
  assert.throws(() => validatePack(d), /available correct answer/);
  d.content.items[0].answer = 0;
  d.content.items[0].options = [" Same ", "same"];
  assert.throws(() => validatePack(d), /distinct/);
  assert.equal(
    packContentSchema.safeParse({
      gameType: "caption-this",
      items: [{ id: "a", title: "Hello", scene: 15 }],
    }).success,
    false,
  );
  assert.equal(
    packContentSchema.safeParse({
      gameType: "room-temperature",
      items: [{ id: "a", title: "Hello", options: ["A", "B"], answer: 0 }],
    }).success,
    false,
  );
  assert.equal(
    packContentSchema.safeParse({
      gameType: "sellout",
      items: [{ id: "a", title: "Hello", url: "https://example.test" }],
    }).success,
    false,
  );
});
test("drafts remain editable; ready validation, canonical hash and portable exports preserve only supported data", () => {
  const d = emptyPack("hotwire", "Private knowledge");
  assert.equal(validatePack(d).status, "draft");
  assert.throws(() => validatePack({ ...d, status: "ready" }), /at least one/);
  assert.equal(packHash(d), packHash(JSON.parse(JSON.stringify(d))));
  assert.notEqual(packHash(d), packHash({ ...d, name: "Changed" }));
  assert.deepEqual(packExportSchema.parse(packExport(d)).document, d);
  assert.equal(
    packExportSchema.safeParse({ ...packExport(d), workspaceId: randomUUID() })
      .success,
    false,
  );
  assert.equal(
    packExportSchema.safeParse({ ...packExport(d), schemaVersion: 2 }).success,
    false,
  );
  assert.equal(
    packFiltersSchema.safeParse({ q: "a".repeat(101) }).success,
    false,
  );
  assert.equal(
    packFiltersSchema.safeParse({ source: "someone-else" }).success,
    false,
  );
});
test("legacy Event definitions omit pack IDs without rewriting; selected IDs are strictly validated", () => {
  const d = eventTemplate("team-warmup", randomUUID);
  assert.deepEqual(eventDefinitionSchema.parse(d), d);
  assert.equal(
    eventDefinitionSchema.safeParse({
      ...d,
      playlist: [{ ...d.playlist[0], contentPackId: "wrong" }],
    }).success,
    false,
  );
});
test("frozen standalone content uses selected alternate data and preserves scoring and player answer redaction", () => {
  const doc = builtInPacks.at(-1)!.document,
    prompts = selectPackPrompts(doc.content, 1, "mixed", 0);
  const r = new Room(
    "ABCDE",
    {
      ...DEFAULT_SETTINGS,
      playlist: ["hotwire"],
      rounds: 1,
      autoAdvance: false,
    },
    "http://localhost/join",
    () => {},
    undefined,
    undefined,
    [
      {
        prompts,
        reference: {
          packId: randomUUID(),
          revisionId: randomUUID(),
          revisionNumber: 1,
          schemaVersion: 1,
          name: doc.name,
          gameType: "hotwire",
        },
      },
    ],
  );
  try {
    r.join("A", 0, "a");
    r.join("B", 1, "b");
    r.action("start");
    r.advance();
    const id = [...r.players.keys()][0];
    assert.equal(r.prompt!.title, prompts[0].title);
    assert.equal("answer" in r.view(id).prompt!, false);
    assert.deepEqual(r.view(id).correct, []);
    r.submit(id, { choice: prompts[0].answer! });
    r.advance();
    assert.ok(r.players.get(id)!.public.score >= 500);
  } finally {
    r.dispose();
  }
});
