import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  contrast,
  readableForeground,
  brandConfigSchema,
  defaultBrandConfig,
  resolveBrandSnapshot,
} from "../shared/brand.js";
test("derived text contrast is readable without altering selected colors", () => {
  assert.equal(contrast("#000000", "#FFFFFF"), 21);
  for (let n = 0; n <= 255; n++) {
    const hex = n.toString(16).padStart(2, "0"),
      background = `#${hex}${hex}${hex}`;
    assert.ok(contrast(background, readableForeground(background)) >= 4.5);
  }
  const selected = {
    ...defaultBrandConfig,
    primaryColor: "#777777",
    surfaceColor: "#777777",
  };
  const snapshot = resolveBrandSnapshot({
    id: randomUUID(),
    name: "A real kit",
    revisionId: randomUUID(),
    revisionNumber: 2,
    isDefault: true,
    updatedAt: new Date().toISOString(),
    config: selected,
  });
  assert.equal(snapshot.config.primaryColor, selected.primaryColor);
  assert.equal(snapshot.config.surfaceColor, selected.surfaceColor);
  assert.ok(
    Object.isFrozen(snapshot) &&
      Object.isFrozen(snapshot.config) &&
      Object.isFrozen(snapshot.colors),
  );
  assert.ok(
    snapshot.colors.every((pair) => Object.isFrozen(pair) && pair.ratio >= 4.5),
  );
});
test("Brand config bounds colors, IDs, footer and attribution; snapshots validate immutable revision references", () => {
  for (const value of ["red", "#fff", "javascript:alert(1)", "#GG0000"])
    assert.equal(
      brandConfigSchema.safeParse({
        ...defaultBrandConfig,
        primaryColor: value,
      }).success,
      false,
    );
  assert.equal(
    brandConfigSchema.parse({ ...defaultBrandConfig, primaryColor: "#aabbcc" })
      .primaryColor,
    "#AABBCC",
  );
  assert.equal(
    brandConfigSchema.safeParse({
      ...defaultBrandConfig,
      showPoweredByRuckus: false,
    }).success,
    false,
  );
  assert.equal(
    brandConfigSchema.safeParse({
      ...defaultBrandConfig,
      footerText: "a".repeat(161),
    }).success,
    false,
  );
  assert.throws(() =>
    resolveBrandSnapshot({
      id: randomUUID(),
      name: "Kit",
      revisionId: "mutable-current",
      revisionNumber: 1,
      isDefault: false,
      updatedAt: new Date().toISOString(),
      config: defaultBrandConfig,
    }),
  );
});
