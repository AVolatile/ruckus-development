import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  contentPacks as packs,
  contentRevisions as revisions,
} from "../db/content-schema.js";
import { builtInPacks, validateBuiltIns } from "./built-ins.js";
import { packHash } from "./hash.js";
import type { Database } from "../db/client.js";
export async function seedContent(db: Database, apply = false) {
  validateBuiltIns();
  return db.transaction(async (tx) => {
    if (apply) await tx.execute(sql`select pg_advisory_xact_lock(40842026)`);
    const changes = [];
    for (const p of builtInPacks) {
      const [row] = await tx
        .select({ pack: packs, revision: revisions })
        .from(packs)
        .innerJoin(revisions, eq(packs.currentRevisionId, revisions.id))
        .where(eq(packs.id, p.id));
      const hash = packHash(p.document),
        action = !row
          ? "create"
          : row.revision.contentHash === hash
            ? "unchanged"
            : "new revision";
      if (
        row &&
        (row.pack.ownerType !== "ruckus" ||
          row.pack.systemSlug !== p.slug ||
          row.pack.lastSeedHash !== row.revision.contentHash ||
          packHash(row.revision.document) !== row.revision.contentHash)
      )
        throw new Error(
          `System pack ${p.slug} diverged from its last approved seed. Review before release.`,
        );
      changes.push({
        slug: p.slug,
        action,
        game: p.document.content.gameType,
        fromRevision: row?.revision.revisionNumber ?? 0,
        toRevision:
          (row?.revision.revisionNumber ?? 0) +
          (action === "unchanged" ? 0 : 1),
        items: p.document.content.items.length,
        hash,
      });
      if (!apply || action === "unchanged") continue;
      const rid = randomUUID(),
        d = p.document,
        meta = {
          name: d.name,
          shortDescription: d.shortDescription,
          description: d.description,
          category: d.category,
          season: d.season,
          difficulty: d.difficulty,
          tags: d.tags,
          status: d.status,
          currentRevisionId: rid,
          lastSeedHash: hash,
        };
      if (!row)
        await tx.insert(packs).values({
          id: p.id,
          ownerType: "ruckus",
          visibility: "built_in",
          systemSlug: p.slug,
          gameType: d.content.gameType,
          ...meta,
          provenance: "ruckus_original",
        });
      await tx.insert(revisions).values({
        id: rid,
        packId: p.id,
        revisionNumber: (row?.revision.revisionNumber ?? 0) + 1,
        schemaVersion: 1,
        document: d,
        contentHash: hash,
        itemCount: d.content.items.length,
      });
      if (row)
        await tx
          .update(packs)
          .set({ ...meta, updatedAt: new Date() })
          .where(eq(packs.id, p.id));
    }
    return changes;
  });
}
