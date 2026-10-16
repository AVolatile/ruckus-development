import { createHash } from "node:crypto";
import { packDocumentSchema } from "../../shared/content-packs.js";
export const packHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(packDocumentSchema.parse(value)))
    .digest("hex");
