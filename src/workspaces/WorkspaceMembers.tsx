import { StatusBadge } from "../app/StatusBadge";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "./context";
import { useHostAuth } from "../auth/HostAuth";
import { request } from "../lib/api";
import { ErrorMessage } from "../components/Layout";
import {
  assignableRoles,
  canManageMemberRole,
  type WorkspaceRole,
  type Member,
  type Invitation,
} from "../../shared/workspaces";
export default function WorkspaceMembers() {
  const context = useWorkspace(),
    current = context.current,
    auth = useHostAuth(),
    navigate = useNavigate();
  const base = `/api/v1/workspaces/${current.id}`;
  const [email, setEmail] = useState(""),
    [role, setRole] = useState<WorkspaceRole>("host"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [memberOffset, setMemberOffset] = useState<number | null>(null),
    [confirm, setConfirm] = useState("");
  const canManage = context.can("members.manage"),
    canInvite = context.can("members.invite"),
    allowedRoles = assignableRoles(current.role);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request<{
        items: Member[];
        nextOffset: number | null;
      }>(base + "/members");
      setMembers(result.items);
      setMemberOffset(result.nextOffset);
      if (canInvite)
        setInvitations(
          (await request<{ items: Invitation[] }>(base + "/invitations")).items,
        );
    } finally {
      setLoading(false);
    }
  }, [base, canInvite]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That action didn’t finish. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorMessage message={error} />
      {message && <StatusBadge>{message}</StatusBadge>}
      {loading && <p role="status">Loading members…</p>}

      {canInvite && current?.kind === "organization" && (
        <form
          className="workspace-form invite-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              setError("Enter a valid invitation email address.");
              return;
            }
            void run(async () => {
              await request(base + "/invitations", {
                method: "POST",
                body: JSON.stringify({ email, role }),
              });
              setEmail("");
              setMessage("Invitation email sent. It expires in seven days.");
              await load();
            });
          }}
        >
          <h2>Bring someone in.</h2>
          <label>
            Email address
            <input
              type="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Workspace role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            >
              {allowedRoles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={busy || !auth.user?.emailVerified}
          >
            Send invitation ↗
          </button>
        </form>
      )}
      <div className="member-list" aria-label="Workspace members">
        {members.map((member) => (
          <article className="member-row" key={member.userId}>
            <div>
              <h3>
                {member.name}
                {member.userId === auth.user?.id ? " (you)" : ""}
              </h3>
              <p>{member.email}</p>
            </div>
            {canManage && canManageMemberRole(current.role, member.role) ? (
              <div className="member-actions">
                <label>
                  Role for {member.email}
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(e) =>
                      void run(async () => {
                        await request(
                          base +
                            `/members/${encodeURIComponent(member.userId)}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({
                              role: e.target.value,
                            }),
                          },
                        );
                        await load();
                        await context?.refresh();
                        setMessage("Member role updated.");
                      })
                    }
                  >
                    {allowedRoles.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() => setConfirm(member.userId)}
                >
                  Remove
                </button>
                {confirm === member.userId && (
                  <div role="group" aria-label="Confirm member removal">
                    <p>Remove {member.email} from this workspace?</p>
                    <button
                      className="button small danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await request(
                            base +
                              `/members/${encodeURIComponent(member.userId)}`,
                            { method: "DELETE" },
                          );
                          setConfirm("");
                          if (member.userId === auth.user?.id) navigate("/app");
                          else {
                            await load();
                            await context?.refresh();
                            setMessage("Member removed.");
                          }
                        })
                      }
                    >
                      Confirm removal
                    </button>
                    <button
                      className="button small outline"
                      onClick={() => setConfirm("")}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="role-tag">{member.role}</p>
            )}
          </article>
        ))}
      </div>
      {memberOffset !== null && (
        <button
          className="button outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await request<{
                items: Member[];
                nextOffset: number | null;
              }>(base + `/members?offset=${memberOffset}`);
              setMembers((previous) => [...previous, ...result.items]);
              setMemberOffset(result.nextOffset);
            })
          }
        >
          More members
        </button>
      )}
      {current?.kind === "organization" && (
        <button
          className="button outline"
          disabled={busy}
          onClick={() => setConfirm("leave")}
        >
          Leave workspace
        </button>
      )}
      {confirm === "leave" && (
        <div className="workspace-panel">
          <p>
            Leave {current?.name}? You’ll need a new invitation to return. The
            final owner must assign another owner first.
          </p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await request(base + `/members/${auth.user?.id}`, {
                  method: "DELETE",
                });
                navigate("/app");
              })
            }
          >
            Confirm leaving
          </button>
          <button className="button outline" onClick={() => setConfirm("")}>
            Cancel
          </button>
        </div>
      )}
      {canInvite && (
        <div className="workspace-panel">
          <h2>Pending invitations.</h2>
          {invitations.length ? (
            invitations.map((invite) => (
              <article className="member-row" key={invite.id}>
                <div>
                  <h3>{invite.email}</h3>
                  <p>
                    {invite.role} ·{" "}
                    {new Date(invite.expiresAt) < new Date()
                      ? "Expired"
                      : "Expires"}{" "}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  className="button small outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await request(base + `/invitations/${invite.id}`, {
                        method: "DELETE",
                      });
                      await load();
                      setMessage("Invitation revoked.");
                    })
                  }
                >
                  Revoke
                </button>
              </article>
            ))
          ) : (
            <p>No pending invitations. Invite someone when you’re ready.</p>
          )}
        </div>
      )}
    </>
  );
}
