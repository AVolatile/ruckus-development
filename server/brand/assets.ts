import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { brandAssets } from "../db/workspace-schema.js";
import { authorize, lockWorkspace } from "../workspaces/policy.js";
import type { Database } from "../db/client.js";
import { ApiError } from "../api/errors.js";
export type BrandAsset = typeof brandAssets.$inferSelect;
export interface BrandAssetStore {
  put(
    actor: string,
    workspaceId: string,
    kind: "logo" | "background",
    mime: string,
    bytes: Buffer,
  ): Promise<Omit<BrandAsset, "binaryContent">>;
  get(actor: string, workspaceId: string, id: string): Promise<BrandAsset>;
  delete(actor: string, workspaceId: string, id: string): Promise<void>;
}
const invalid = () =>
  new ApiError(
    400,
    "INVALID_IMAGE",
    "Choose a valid, static PNG, JPEG or WebP image up to 4096 × 4096 pixels (16 megapixels).",
  );
export class PostgresBrandAssetStore implements BrandAssetStore {
  constructor(private db: Database) {}
  async put(
    actor: string,
    wid: string,
    kind: "logo" | "background",
    mime: string,
    bytes: Buffer,
  ) {
    await authorize(this.db, actor, wid, "brand.manage");
    const maximum = kind === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (bytes.length > maximum)
      throw new ApiError(
        413,
        "IMAGE_TOO_LARGE",
        `Keep ${kind} uploads under ${kind === "logo" ? 2 : 5} MB.`,
      );
    const format = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "jpeg"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!format || mime !== `image/${format}`) throw invalid();
    let output: Buffer, width: number, height: number;
    try {
      const image = sharp(bytes, {
        limitInputPixels: 16000000,
        failOn: "warning",
        animated: false,
      });
      const meta = await image.metadata();
      if (
        meta.format !== format ||
        !meta.width ||
        !meta.height ||
        meta.width > 4096 ||
        meta.height > 4096 ||
        (meta.pages || 1) > 1
      )
        throw invalid();
      const result = await image
        .rotate()
        .webp({ quality: 88 })
        .toBuffer({ resolveWithObject: true });
      output = result.data;
      width = result.info.width;
      height = result.info.height;
      if (output.length > maximum) throw invalid();
    } catch {
      throw invalid();
    }
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "brand.manage");
      const [usage] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          bytes: sql<number>`coalesce(sum(byte_length),0)::int`,
        })
        .from(brandAssets)
        .where(eq(brandAssets.workspaceId, wid));
      if (usage.count >= 100 || usage.bytes + output.length > 100 * 1024 * 1024)
        throw new ApiError(
          409,
          "ASSET_LIMIT",
          "This workspace reached its technical asset safeguard (100 images or 100 MB). Contact the workspace owner.",
        );
      const row = {
        id: randomUUID(),
        workspaceId: wid,
        kind,
        mimeType: "image/webp",
        byteLength: output.length,
        width,
        height,
        contentHash: createHash("sha256").update(output).digest("hex"),
        createdByUserId: actor,
      };
      await tx.insert(brandAssets).values({ ...row, binaryContent: output });
      return { ...row, createdAt: new Date(), deletedAt: null };
    });
  }
  async get(actor: string, wid: string, id: string) {
    await authorize(this.db, actor, wid, "brand.read");
    const [row] = await this.db
      .select()
      .from(brandAssets)
      .where(
        and(
          eq(brandAssets.id, id),
          eq(brandAssets.workspaceId, wid),
          isNull(brandAssets.deletedAt),
        ),
      );
    if (!row)
      throw new ApiError(404, "ASSET_NOT_FOUND", "That image isn’t available.");
    return row;
  }
  async delete(actor: string, wid: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "brand.manage");
      const refs = await tx.execute(
        sql`select 1 from brand_kit_revisions r join brand_kits k on k.id=r.brand_kit_id where k.workspace_id=${wid} and (r.config->>'logoAssetId'=${id} or r.config->>'backgroundAssetId'=${id}) limit 1`,
      );
      if (refs.rows.length)
        throw new ApiError(
          409,
          "ASSET_REFERENCED",
          "This image is retained by Brand Kit history. Remove it from the current kit to stop displaying it.",
        );
      const rows = await tx
        .update(brandAssets)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(brandAssets.id, id),
            eq(brandAssets.workspaceId, wid),
            isNull(brandAssets.deletedAt),
          ),
        )
        .returning({ id: brandAssets.id });
      if (!rows.length)
        throw new ApiError(
          404,
          "ASSET_NOT_FOUND",
          "That image isn’t available.",
        );
    });
  }
}
