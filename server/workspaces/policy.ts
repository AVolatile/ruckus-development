import { and, eq, isNull } from "drizzle-orm";
import { memberships, workspaces } from "../db/workspace-schema.js";
import { roleCapabilities, type Capability } from "../../shared/workspaces.js";
import type { Database } from "../db/client.js";
import { ApiError } from "../api/errors.js";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Connection = Database | Transaction;
export const workspaceMissing = () =>
  new ApiError(404, "WORKSPACE_NOT_FOUND", "That workspace isn’t available.");
export async function authorize(
  db: Connection,
  actor: string,
  workspaceId: string,
  capability: Capability,
) {
  const [row] = await db
    .select({ workspace: workspaces, role: memberships.role })
    .from(workspaces)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, workspaces.id),
        eq(memberships.userId, actor),
      ),
    )
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)));
  if (!row) throw workspaceMissing();
  if (!roleCapabilities[row.role].includes(capability))
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      "Your workspace role doesn’t allow this action.",
    );
  return row;
}
export async function lockWorkspace(tx: Transaction, id: string) {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .for("update");
}
export async function personalWorkspace(db: Connection, userId: string) {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.createdByUserId, userId),
        eq(workspaces.kind, "personal"),
      ),
    );
  if (!row) throw workspaceMissing();
  return row.id;
}
