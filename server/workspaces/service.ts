import { randomBytes, randomUUID, createHash } from "node:crypto";
import { and, eq, isNull, sql, desc, lt, or } from "drizzle-orm";
import {
  workspaces,
  memberships,
  invitations,
  auditEvents,
} from "../db/workspace-schema.js";
import { user } from "../db/auth-schema.js";
import type { Database } from "../db/client.js";
import { authorize, lockWorkspace } from "./policy.js";
import { audit } from "./audit.js";
import { ApiError } from "../api/errors.js";
import {
  roleCapabilities,
  assignableRoles,
  canManageMemberRole,
  workspaceNameSchema,
  inviteSchema,
  type WorkspaceRole,
  type Workspace,
} from "../../shared/workspaces.js";
import { actionEmail, type EmailTransport } from "../email/transport.js";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class WorkspaceService {
  constructor(
    private db: Database,
    private mail: EmailTransport,
    private origin: string,
  ) {}
  async verified(actor: string) {
    const [row] = await this.db
      .select({ verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, actor));
    if (!row?.verified)
      throw new ApiError(
        403,
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email before creating, inviting or joining a shared workspace.",
      );
  }
  async list(actor: string): Promise<Workspace[]> {
    const rows = await this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        kind: workspaces.kind,
        role: memberships.role,
        memberCount: sql<number>`(select count(*)::int from workspace_memberships m where m.workspace_id = ${workspaces.id})`,
      })
      .from(workspaces)
      .innerJoin(
        memberships,
        and(
          eq(memberships.workspaceId, workspaces.id),
          eq(memberships.userId, actor),
        ),
      )
      .where(isNull(workspaces.archivedAt))
      .orderBy(desc(workspaces.kind), workspaces.createdAt)
      .limit(100);
    return rows.map((r) => ({
      ...r,
      permissions: [...roleCapabilities[r.role]],
    }));
  }
  async get(actor: string, id: string) {
    const { workspace, role } = await authorize(
      this.db,
      actor,
      id,
      "workspace.read",
    );
    const [counts] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.workspaceId, id));
    return {
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      role,
      permissions: [...roleCapabilities[role]],
      memberCount: counts.count,
    };
  }

  async create(actor: string, name: string) {
    await this.verified(actor);
    name = workspaceNameSchema.parse(name);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"org:" + actor},0))`,
      );
      const counts = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.createdByUserId, actor),
            eq(workspaces.kind, "organization"),
            isNull(workspaces.archivedAt),
          ),
        );
      if (counts[0].count >= 20)
        throw new ApiError(
          409,
          "WORKSPACE_LIMIT",
          "You can create up to 20 active shared workspaces as a technical safeguard.",
        );
      const id = randomUUID();
      await tx
        .insert(workspaces)
        .values({ id, kind: "organization", name, createdByUserId: actor });
      await tx
        .insert(memberships)
        .values({ workspaceId: id, userId: actor, role: "owner" });
      await audit(tx, id, actor, "workspace.created", "workspace", id);
      return { id };
    });
  }
  async update(actor: string, id: string, name: string) {
    name = workspaceNameSchema.parse(name);
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, id);
      const { workspace } = await authorize(tx, actor, id, "workspace.update");
      if (workspace.kind !== "organization")
        throw new ApiError(
          400,
          "PERSONAL_WORKSPACE",
          "Personal workspace identity is managed by your account.",
        );
      await tx
        .update(workspaces)
        .set({ name, updatedAt: new Date() })
        .where(eq(workspaces.id, id));
      await audit(tx, id, actor, "workspace.updated", "workspace", id);
    });
  }
  async archive(actor: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, id);
      const { workspace } = await authorize(tx, actor, id, "workspace.archive");
      if (workspace.kind === "personal")
        throw new ApiError(
          400,
          "PERSONAL_WORKSPACE",
          "Your personal workspace cannot be archived.",
        );
      await tx
        .update(workspaces)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(workspaces.id, id));
      await audit(tx, id, actor, "workspace.archived", "workspace", id);
    });
  }
  async members(actor: string, id: string, offset = 0) {
    await authorize(this.db, actor, id, "members.read");
    const rows = await this.db
      .select({
        userId: memberships.userId,
        name: user.name,
        email: user.email,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
      })
      .from(memberships)
      .innerJoin(user, eq(memberships.userId, user.id))
      .where(eq(memberships.workspaceId, id))
      .orderBy(memberships.joinedAt, memberships.userId)
      .limit(51)
      .offset(offset);
    return {
      items: rows.slice(0, 50),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async changeMember(
    actor: string,
    id: string,
    target: string,
    role?: WorkspaceRole,
  ) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, id);
      const access = await authorize(
        tx,
        actor,
        id,
        actor === target && !role ? "workspace.read" : "members.manage",
      );
      if (access.workspace.kind !== "organization")
        throw new ApiError(
          400,
          "PERSONAL_WORKSPACE",
          "Personal workspace membership cannot change.",
        );
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(eq(memberships.workspaceId, id), eq(memberships.userId, target)),
        );
      if (!member)
        throw new ApiError(
          404,
          "MEMBER_NOT_FOUND",
          "That member isn’t available.",
        );
      if (
        (!canManageMemberRole(access.role, member.role) &&
          !(actor === target && !role && member.role !== "owner")) ||
        (role && !assignableRoles(access.role).includes(role))
      )
        throw new ApiError(
          403,
          "PERMISSION_DENIED",
          "Only owners can manage ownership.",
        );
      if (member.role === "owner" && role !== "owner") {
        const owners = await tx
          .select()
          .from(memberships)
          .where(
            and(eq(memberships.workspaceId, id), eq(memberships.role, "owner")),
          );
        if (owners.length <= 1)
          throw new ApiError(
            409,
            "FINAL_OWNER",
            "Assign another owner before leaving or changing the final owner.",
          );
      }
      if (role)
        await tx
          .update(memberships)
          .set({ role })
          .where(
            and(
              eq(memberships.workspaceId, id),
              eq(memberships.userId, target),
            ),
          );
      else
        await tx
          .delete(memberships)
          .where(
            and(
              eq(memberships.workspaceId, id),
              eq(memberships.userId, target),
            ),
          );
      await audit(
        tx,
        id,
        actor,
        role ? "member.role_changed" : "member.removed",
        "member",
        target,
        role ? { from: member.role, to: role } : {},
      );
    });
  }
  async pending(actor: string, id: string) {
    await authorize(this.db, actor, id, "members.invite");
    return this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.workspaceId, id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(100);
  }
  async invite(actor: string, id: string, value: unknown) {
    await this.verified(actor);
    const input = inviteSchema.parse(value);
    const token = randomBytes(32).toString("base64url");
    // SMTP is awaited inside this short transaction so failed sends roll back the pending invitation.
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, id);
      const access = await authorize(tx, actor, id, "members.invite");
      if (access.workspace.kind !== "organization")
        throw new ApiError(
          400,
          "PERSONAL_WORKSPACE",
          "Personal workspaces cannot invite members.",
        );
      if (!assignableRoles(access.role).includes(input.role))
        throw new ApiError(
          403,
          "PERMISSION_DENIED",
          "Only owners can invite another owner.",
        );
      const [existing] = await tx
        .select({ id: user.id })
        .from(memberships)
        .innerJoin(user, eq(memberships.userId, user.id))
        .where(
          and(eq(memberships.workspaceId, id), eq(user.email, input.email)),
        );
      if (existing)
        throw new ApiError(
          409,
          "ALREADY_MEMBER",
          "This person is already a member. Change their role from Members.",
        );
      const pending = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.workspaceId, id),
            isNull(invitations.revokedAt),
            isNull(invitations.acceptedAt),
          ),
        );
      if (pending.filter((p) => p.expiresAt > new Date()).length >= 50)
        throw new ApiError(
          409,
          "INVITATION_LIMIT",
          "This workspace has 50 pending invitations. Revoke or wait for existing invitations first.",
        );
      const same = pending.find((p) => p.email === input.email);
      if (same && same.expiresAt > new Date())
        throw new ApiError(
          409,
          "INVITATION_PENDING",
          "An invitation is already pending. Revoke it before sending another.",
        );
      if (same)
        await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(eq(invitations.id, same.id));
      const invitationId = randomUUID();
      await tx.insert(invitations).values({
        id: invitationId,
        workspaceId: id,
        email: input.email,
        role: input.role,
        tokenHash: hash(token),
        createdByUserId: actor,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      const url = new URL(`/app/invitations/${token}`, this.origin);
      await this.mail.send(
        actionEmail(
          input.email,
          "Join your Ruckus workspace",
          `${access.workspace.name} invited you as ${input.role}. Sign in with this email and verify it to accept within seven days.`,
          url.href,
          this.origin,
        ),
      );
      await audit(tx, id, actor, "member.invited", "invitation", invitationId, {
        role: input.role,
      });
      return { id: invitationId };
    });
  }
  async revoke(actor: string, id: string, inviteId: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, id);
      await authorize(tx, actor, id, "members.invite");
      const rows = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitations.id, inviteId),
            eq(invitations.workspaceId, id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
          ),
        )
        .returning();
      if (!rows.length)
        throw new ApiError(
          404,
          "INVITATION_NOT_FOUND",
          "That pending invitation isn’t available.",
        );
      await audit(
        tx,
        id,
        actor,
        "member.invite_revoked",
        "invitation",
        inviteId,
      );
    });
  }
  async accept(actor: string, token: string) {
    await this.verified(actor);
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hash(token)));
      const invalid = () =>
        new ApiError(
          400,
          "INVITATION_INVALID",
          "This invitation is unavailable, expired or belongs to another email.",
        );
      if (!candidate) throw invalid();
      await lockWorkspace(tx, candidate.workspaceId);
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.id, candidate.id))
        .for("update");
      const [person] = await tx.select().from(user).where(eq(user.id, actor));
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId));
      if (
        !person?.emailVerified ||
        person.email !== invite.email ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt <= new Date() ||
        !workspace ||
        workspace.archivedAt ||
        workspace.kind !== "organization"
      )
        throw invalid();
      const [member] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, invite.workspaceId),
            eq(memberships.userId, actor),
          ),
        );
      if (member)
        throw new ApiError(
          409,
          "ALREADY_MEMBER",
          "You are already a member of this workspace.",
        );
      await tx.insert(memberships).values({
        workspaceId: invite.workspaceId,
        userId: actor,
        role: invite.role,
        invitedByUserId: invite.createdByUserId,
      });
      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invite.id));
      await audit(
        tx,
        invite.workspaceId,
        actor,
        "member.invite_accepted",
        "invitation",
        invite.id,
      );
      return { workspaceId: invite.workspaceId };
    });
  }
  async activity(
    actor: string,
    id: string,
    cursor?: { createdAt: string; id: string },
  ) {
    await authorize(this.db, actor, id, "audit.read");
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, id),
          cursor
            ? or(
                lt(auditEvents.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(auditEvents.createdAt, new Date(cursor.createdAt)),
                  lt(auditEvents.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(31);
    const last = rows.slice(0, 30).at(-1);
    return {
      items: rows.slice(0, 30),
      nextCursor:
        rows.length > 30 && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }
}
