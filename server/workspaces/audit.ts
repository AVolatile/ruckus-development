import { randomUUID } from "node:crypto";
import { auditEvents } from "../db/workspace-schema.js";
import type { Transaction } from "./policy.js";
export async function audit(
  tx: Transaction,
  workspaceId: string,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(auditEvents).values({
    id: randomUUID(),
    workspaceId,
    actorUserId,
    action,
    targetType,
    targetId,
    metadata,
  });
}
