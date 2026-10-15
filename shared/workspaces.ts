import { z } from "zod/v3";
export const roles = ["owner", "admin", "host", "viewer"] as const;
export type WorkspaceRole = (typeof roles)[number];
export const capabilities = [
  "workspace.read",
  "workspace.update",
  "workspace.archive",
  "members.read",
  "members.invite",
  "members.manage",
  "boards.read",
  "boards.create",
  "boards.update",
  "boards.delete",
  "boards.launch",
  "brand.read",
  "brand.manage",
  "audit.read",
  "events.read",
  "events.create",
  "events.update",
  "events.archive",
  "events.launch",
] as const;
export type Capability = (typeof capabilities)[number];
const reader: Capability[] = [
  "workspace.read",
  "members.read",
  "boards.read",
  "brand.read",
  "events.read",
];
const host: Capability[] = [
  ...reader,
  "boards.create",
  "boards.update",
  "boards.delete",
  "boards.launch",
  "events.create",
  "events.update",
  "events.launch",
];
export const roleCapabilities: Record<WorkspaceRole, readonly Capability[]> = {
  owner: capabilities,
  admin: [
    ...host,
    "workspace.update",
    "members.invite",
    "members.manage",
    "brand.manage",
    "audit.read",
    "events.archive",
  ],
  host,
  viewer: reader,
};
export interface Workspace {
  id: string;
  name: string;
  kind: "personal" | "organization";
  role: WorkspaceRole;
  permissions: Capability[];
  memberCount: number;
}
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
}
export const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80, "Use 80 characters or fewer.");
export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(roles),
  })
  .strict();

// Ownership grants are a relationship policy shared with presentation, enforced again by the server.
export function assignableRoles(role: WorkspaceRole): readonly WorkspaceRole[] {
  return role === "owner"
    ? roles
    : role === "admin"
      ? roles.filter((value) => value !== "owner")
      : [];
}
export function canManageMemberRole(
  actor: WorkspaceRole,
  target: WorkspaceRole,
) {
  return assignableRoles(actor).includes(target);
}
