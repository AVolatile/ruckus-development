import { PageHeader } from "../app/PageHeader";
import { StatusBadge } from "../app/StatusBadge";
import WorkspaceMembers from "./WorkspaceMembers";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { NavLink, Link, useNavigate, useParams } from "react-router-dom";
import { useOptionalWorkspace } from "./WorkspaceContext";
import { useHostAuth } from "../auth/HostAuth";
import { request } from "../lib/api";
import { workspaceNameSchema } from "../../shared/workspaces";
import { Logo, Avatar } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
import VerificationNotice from "../auth/VerificationNotice";
type Mode = "create" | "accept" | "general" | "members" | "activity";
function WorkspacePageContent({ mode }: { mode: Mode }) {
  const context = useOptionalWorkspace(),
    auth = useHostAuth(),
    navigate = useNavigate(),
    { token } = useParams();
  const current = context?.current,
    base = current ? `/api/v1/workspaces/${current.id}` : "";
  const [name, setName] = useState(current?.name || ""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [events, setEvents] = useState<
      { id: string; action: string; createdAt: string; actorUserId: string }[]
    >([]),
    [cursor, setCursor] = useState<string | null>(null),
    [confirm, setConfirm] = useState("");
  const load = useCallback(async () => {
    if (!base) return;
    setLoading(true);
    try {
      if (mode === "activity") {
        const result = await request<{
          items: typeof events;
          nextCursor: string | null;
        }>(base + "/activity");
        setEvents(result.items);
        setCursor(result.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }, [base, mode]);
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
  async function saveName(e: FormEvent) {
    e.preventDefault();
    const parsed = workspaceNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await run(async () => {
      if (mode === "create") {
        const result = await request<{ id: string }>("/api/v1/workspaces", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        navigate(`/app/w/${result.id}`, {
          state: { hostNotice: "Workspace created. Invite your people." },
        });
      } else {
        await request(base, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        await context?.refresh();
        setMessage("Workspace name saved.");
      }
    });
  }
  const title =
    mode === "create"
      ? "A space for your people."
      : mode === "accept"
        ? "You’re invited."
        : mode === "members"
          ? "Good company."
          : mode === "activity"
            ? "What changed."
            : "Your shared space.";
  return (
    <>
      <section className="host-page-section">
        <PageHeader
          eyebrow={current?.name || "RUCKUS TOGETHER"}
          title={title}
          meta={
            <>
              {context && (
                <nav className="workspace-tabs" aria-label="Workspace settings">
                  {[
                    ["/workspace", "General"],
                    ["/members", "Members"],
                    ["/brand", "Brand"],
                    ...(context.can("audit.read")
                      ? [["/activity", "Activity"]]
                      : []),
                  ].map(([suffix, label]) => (
                    <NavLink key={suffix} to={context.path(suffix)}>
                      {label}
                    </NavLink>
                  ))}
                </nav>
              )}
            </>
          }
        >
          <p>
            {mode === "create"
              ? "Shared boards, clear roles and a brand your room recognizes."
              : mode === "accept"
                ? `Signed in as ${auth.user?.email}. Invitations are bound to the email that received them.`
                : mode === "members"
                  ? "Give everyone the right seat. Hosts make and run boards; Viewers read; Admins manage the workspace."
                  : mode === "activity"
                    ? "Recent workspace changes, recorded as they happen."
                    : "Manage the name, people and Brand Kits in this workspace."}
          </p>
        </PageHeader>
      </section>
      <section className="section workspace-content">
        <VerificationNotice />
        <ErrorMessage message={error} />
        {message && <StatusBadge>{message}</StatusBadge>}
        {loading && <p role="status">Loading workspace details…</p>}
        {mode === "create" && (
          <form
            className="workspace-form"
            onSubmit={(e) => void saveName(e)}
            noValidate
          >
            <label htmlFor="workspace-name">
              Workspace name
              <input
                id="workspace-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                aria-describedby={error ? "workspace-name-error" : undefined}
              />
            </label>
            <p id="workspace-name-error">
              Choose a name with 2–80 characters. You can change it later.
            </p>
            <button
              className="button"
              disabled={busy || !auth.user?.emailVerified}
            >
              Create shared workspace ↗
            </button>
            <Link to="/app">Back to my workspace</Link>
          </form>
        )}
        {mode === "accept" && (
          <div className="studio-empty">
            <Avatar id={3} size={100} />
            <div>
              <h2>Make a little Ruckus together.</h2>
              <p>
                Accept with the verified address that received this invitation.
                Links expire after seven days and can be used once.
              </p>
              <button
                className="button"
                disabled={busy || !auth.user?.emailVerified}
                onClick={() =>
                  void run(async () => {
                    const result = await request<{ workspaceId: string }>(
                      `/api/v1/invitations/${encodeURIComponent(token || "")}/accept`,
                      { method: "POST", body: "{}" },
                    );
                    navigate(`/app/w/${result.workspaceId}`, { replace: true });
                  })
                }
              >
                Accept invitation ↗
              </button>
              <p>
                <Link to="/app">Back to my workspace</Link> ·{" "}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await auth.logout();
                      navigate(
                        `/login?returnTo=${encodeURIComponent(location.pathname)}`,
                      );
                    })
                  }
                >
                  Use another account
                </button>
              </p>
            </div>
          </div>
        )}
        {mode === "general" && current && (
          <>
            <div className="workspace-panel">
              <h2>
                {current.kind === "personal"
                  ? "Your own corner of Ruckus."
                  : "A name the room knows."}
              </h2>
              {current.kind === "personal" ? (
                <p>
                  Your personal workspace belongs to you. It can’t invite
                  members, change owners or be archived. Create a shared
                  workspace when you’re ready to collaborate.
                </p>
              ) : (
                <form
                  className="workspace-form"
                  noValidate
                  onSubmit={(e) => void saveName(e)}
                >
                  <label>
                    Workspace name
                    <input
                      value={name}
                      maxLength={80}
                      readOnly={!context?.can("workspace.update")}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  {context?.can("workspace.update") && (
                    <button className="button" disabled={busy}>
                      Save name
                    </button>
                  )}
                </form>
              )}
              <p>
                <small>Workspace ID: {current.id}</small>
              </p>
              <Link className="button outline" to="/app/workspaces/new">
                Create shared workspace ↗
              </Link>
            </div>
            {current.kind === "organization" &&
              context?.can("workspace.archive") && (
                <div className="workspace-panel archive-panel">
                  <h2>Archive this workspace.</h2>
                  <p>
                    Members lose normal access. Boards, Brand Kits and history
                    stay preserved. There is no self-service restore in this
                    phase.
                  </p>
                  <label>
                    Type {current.name} to confirm
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                  <button
                    className="button danger"
                    disabled={busy || confirm !== current.name}
                    onClick={() =>
                      void run(async () => {
                        await request(base + "/archive", {
                          method: "POST",
                          body: "{}",
                        });
                        navigate("/app", { replace: true });
                      })
                    }
                  >
                    Archive workspace
                  </button>
                </div>
              )}
          </>
        )}
        {mode === "members" && <WorkspaceMembers />}
        {mode === "activity" && (
          <div className="workspace-panel">
            <h2>Workspace activity.</h2>
            {events.length ? (
              <ol className="activity-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {event.action.replaceAll(".", " · ").replaceAll("_", " ")}
                    </strong>
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              !loading && <p>No changes recorded yet.</p>
            )}
            {cursor && (
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await request<{
                      items: typeof events;
                      nextCursor: string | null;
                    }>(base + `/activity?cursor=${encodeURIComponent(cursor)}`);
                    setEvents((previous) => [...previous, ...result.items]);
                    setCursor(result.nextCursor);
                  })
                }
              >
                Older activity
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default function WorkspacePages({ mode }: { mode: Mode }) {
  const content = <WorkspacePageContent mode={mode} />;
  return mode === "create" || mode === "accept" ? (
    <div className="host-app">
      <header className="site-header">
        <Link to="/app" aria-label="Ruckus host home">
          <Logo />
        </Link>
        <Link to="/app">Back to my workspace ↗</Link>
      </header>
      <main id="main">{content}</main>
    </div>
  ) : (
    content
  );
}
