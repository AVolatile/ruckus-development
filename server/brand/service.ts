import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  brandKits as kits,
  brandRevisions as revisions,
  brandAssets,
} from "../db/workspace-schema.js";
import {
  authorize,
  lockWorkspace,
  type Transaction,
} from "../workspaces/policy.js";
import { audit } from "../workspaces/audit.js";
import type { Database } from "../db/client.js";
import { ApiError } from "../api/errors.js";
import {
  brandWriteSchema,
  type BrandRecord,
  type BrandConfig,
} from "../../shared/brand.js";
const missing = () =>
  new ApiError(404, "BRAND_NOT_FOUND", "That Brand Kit isn’t available.");
const scope = (wid: string, id?: string) =>
  and(
    eq(kits.workspaceId, wid),
    isNull(kits.deletedAt),
    id ? eq(kits.id, id) : undefined,
  );
const projection = {
  id: kits.id,
  name: kits.name,
  isDefault: kits.isDefault,
  updatedAt: kits.updatedAt,
  revisionId: revisions.id,
  revisionNumber: revisions.revisionNumber,
  config: revisions.config,
};
const hash = (name: string, config: BrandConfig) =>
  createHash("sha256").update(JSON.stringify({ name, config })).digest("hex");
export class BrandService {
  constructor(private db: Database) {}
  async list(actor: string, wid: string, offset = 0) {
    await authorize(this.db, actor, wid, "brand.read");
    const rows = await this.db
      .select(projection)
      .from(kits)
      .innerJoin(revisions, eq(kits.currentRevisionId, revisions.id))
      .where(scope(wid))
      .orderBy(desc(kits.isDefault), desc(kits.updatedAt), kits.id)
      .limit(21)
      .offset(offset);
    return {
      items: rows
        .slice(0, 20)
        .map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
      nextOffset: rows.length > 20 ? offset + 20 : null,
    };
  }
  async get(actor: string, wid: string, id: string): Promise<BrandRecord> {
    await authorize(this.db, actor, wid, "brand.read");
    const [row] = await this.db
      .select(projection)
      .from(kits)
      .innerJoin(revisions, eq(kits.currentRevisionId, revisions.id))
      .where(scope(wid, id));
    if (!row) throw missing();
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }
  async validateAssets(tx: Transaction, wid: string, config: BrandConfig) {
    for (const kind of ["logo", "background"] as const) {
      const id = config[kind === "logo" ? "logoAssetId" : "backgroundAssetId"];
      if (!id) continue;
      const [asset] = await tx
        .select({ id: brandAssets.id })
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.id, id),
            eq(brandAssets.workspaceId, wid),
            eq(brandAssets.kind, kind),
            isNull(brandAssets.deletedAt),
          ),
        );
      if (!asset)
        throw new ApiError(
          400,
          "INVALID_BRAND_ASSET",
          "Choose an available image from this workspace with the matching image type.",
        );
    }
  }
  async write(
    actor: string,
    wid: string,
    value: unknown,
    id?: string,
  ): Promise<BrandRecord> {
    const input = brandWriteSchema.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "brand.manage");
      await this.validateAssets(tx, wid, input.config);
      const now = new Date();
      const digest = hash(input.name, input.config);
      let number = 1,
        isDefault = false;
      const kitId = id || randomUUID(),
        revisionId = randomUUID();
      if (id) {
        const [row] = await tx
          .select()
          .from(kits)
          .where(scope(wid, id))
          .for("update");
        if (!row) throw missing();
        if (
          !input.baseRevisionId ||
          row.currentRevisionId !== input.baseRevisionId
        )
          throw new ApiError(
            409,
            "BRAND_CONFLICT",
            "This Brand Kit changed in another tab. Your edits are kept here; load the latest version before saving again.",
          );
        const [current] = await tx
          .select()
          .from(revisions)
          .where(eq(revisions.id, row.currentRevisionId));
        if (current.contentHash === digest)
          return {
            ...row,
            config: current.config,
            revisionId: current.id,
            revisionNumber: current.revisionNumber,
            updatedAt: row.updatedAt.toISOString(),
          };
        number = current.revisionNumber + 1;
        isDefault = row.isDefault;
        await tx
          .update(kits)
          .set({
            name: input.name,
            currentRevisionId: revisionId,
            updatedAt: now,
          })
          .where(eq(kits.id, id));
      } else {
        const existing = await tx
          .select({ id: kits.id })
          .from(kits)
          .where(scope(wid));
        if (existing.length >= 50)
          throw new ApiError(
            409,
            "BRAND_LIMIT",
            "This workspace has reached the technical safeguard of 50 active Brand Kits.",
          );
        isDefault = existing.length === 0;
        await tx.insert(kits).values({
          id: kitId,
          workspaceId: wid,
          name: input.name,
          currentRevisionId: revisionId,
          isDefault,
          createdByUserId: actor,
        });
      }
      await tx.insert(revisions).values({
        id: revisionId,
        brandKitId: kitId,
        revisionNumber: number,
        name: input.name,
        config: input.config,
        contentHash: digest,
        createdByUserId: actor,
      });
      await audit(
        tx,
        wid,
        actor,
        id ? "brand.updated" : "brand.created",
        "brand",
        kitId,
      );
      return {
        id: kitId,
        name: input.name,
        config: input.config,
        revisionId,
        revisionNumber: number,
        isDefault,
        updatedAt: now.toISOString(),
      };
    });
  }
  async setDefault(actor: string, wid: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "brand.manage");
      const [row] = await tx.select().from(kits).where(scope(wid, id));
      if (!row) throw missing();
      if (row.isDefault) return;
      await tx.update(kits).set({ isDefault: false }).where(scope(wid));
      await tx.update(kits).set({ isDefault: true }).where(eq(kits.id, id));
      await audit(tx, wid, actor, "brand.default_changed", "brand", id);
    });
  }
  async delete(actor: string, wid: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "brand.manage");
      const [row] = await tx.select().from(kits).where(scope(wid, id));
      if (!row) throw missing();
      await tx
        .update(kits)
        .set({ deletedAt: new Date(), isDefault: false })
        .where(eq(kits.id, id));
      await audit(tx, wid, actor, "brand.deleted", "brand", id);
      if (row.isDefault) {
        const [next] = await tx
          .select()
          .from(kits)
          .where(scope(wid))
          .orderBy(kits.createdAt, kits.id)
          .limit(1);
        if (next)
          await tx
            .update(kits)
            .set({ isDefault: true })
            .where(eq(kits.id, next.id));
        await audit(
          tx,
          wid,
          actor,
          "brand.default_changed",
          "brand",
          next?.id,
          { fallback: next ? "oldest-active" : "ruckus-default" },
        );
      }
    });
  }
}
