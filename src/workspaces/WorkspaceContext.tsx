import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import type { Workspace, Capability } from "../../shared/workspaces";
import { request } from "../lib/api";
import { RepositoryProvider } from "../studio/RepositoryProvider";
import {
  WorkspaceContext as Context,
  useWorkspace,
  type WorkspaceState as State,
} from "./context";
export { useWorkspace, useOptionalWorkspace } from "./context";
export function WorkspaceBoundary() {
  const { workspaceId } = useParams();
  const [items, setItems] = useState<Workspace[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    const result = await request<{ items: Workspace[] }>("/api/v1/workspaces");
    setItems(result.items);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void request<{ items: Workspace[] }>("/api/v1/workspaces")
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  if (loading)
    return (
      <main id="main" className="page-hero">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  const current = items.find((w) => w.id === workspaceId);
  if (error || !current)
    return (
      <main id="main" className="page-hero">
        <h1>Workspace unavailable.</h1>
        <p role="alert">
          {error || "This workspace isn’t available to your account."}
        </p>
        <Link to="/app" className="button">
          Your personal workspace ↗
        </Link>
      </main>
    );
  const state: State = {
    current,
    items,
    refresh,
    path: (suffix = "") => `/app/w/${current.id}${suffix}`,
    can: (permission) => current.permissions.includes(permission),
  };
  return (
    <Context.Provider value={state}>
      <RepositoryProvider key={current.id} workspaceId={current.id}>
        <Outlet />
      </RepositoryProvider>
    </Context.Provider>
  );
}
export function PersonalWorkspaceRedirect() {
  const location = useLocation();
  const [id, setId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void request<{ items: Workspace[] }>("/api/v1/workspaces")
      .then((result) => {
        const own = result.items.find((w) => w.kind === "personal");
        if (own) setId(own.id);
        else setError("Your personal workspace couldn’t be opened.");
      })
      .catch((e) => setError(e.message));
  }, []);
  if (error)
    return (
      <main id="main" className="page-hero">
        <p role="alert">{error}</p>
      </main>
    );
  if (!id)
    return (
      <main id="main" className="page-hero">
        <p role="status">Opening your workspace…</p>
      </main>
    );
  return (
    <Navigate
      replace
      to={`/app/w/${id}${location.pathname.slice(4)}${location.search}${location.hash}`}
    />
  );
}
// All workspace navigation uses ordinary links so the Studio flush guard can preserve pending edits.
export function WorkspaceSwitcher() {
  const { current, items } = useWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace-switcher">
      <button
        className="button small outline"
        aria-expanded={open}
        aria-controls="workspace-options"
        onClick={() => setOpen((v) => !v)}
      >
        {current.name} ▾
      </button>
      {open && (
        <nav id="workspace-options" aria-label="Choose workspace">
          {items.map((w) => (
            <Link
              key={w.id}
              to={`/app/w/${w.id}`}
              onClick={() => setOpen(false)}
            >
              {w.name}{" "}
              <small>{w.kind === "personal" ? "Personal" : w.role}</small>
            </Link>
          ))}
          <Link to="/app/workspaces/new">Create shared workspace ↗</Link>
        </nav>
      )}
      <span className="workspace-role">
        {current.role} ·{" "}
        {current.kind === "personal"
          ? "Just you"
          : `${current.memberCount} members`}
      </span>
    </div>
  );
}
export function WorkspaceLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const { path } = useWorkspace();
  return <Link to={path(to)}>{children}</Link>;
}

export function WorkspaceCapability({
  permission,
  children,
}: {
  permission: Capability;
  children: ReactNode;
}) {
  const { can, path } = useWorkspace();
  const { id } = useParams();
  if (can(permission)) return children;
  if (permission === "boards.update" && id)
    return <Navigate replace to={path(`/studio/boards/${id}/preview`)} />;
  return (
    <section className="page-hero">
      <h1>A different seat.</h1>
      <p>
        Your workspace role allows reading. An Owner or Admin can change your
        role if you need to create or host.
      </p>
      <Link className="button" to={path("/studio")}>
        Open shared boards ↗
      </Link>
    </section>
  );
}
