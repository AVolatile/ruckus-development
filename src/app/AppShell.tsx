import { ActionNotice } from "./ActionNotice";
import {
  WorkspaceSwitcher,
  useWorkspace,
} from "../workspaces/WorkspaceContext";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Link, NavLink } from "../workspaces/navigation";
import { useHostAuth } from "../auth/HostAuth";
import LocalImportPrompt from "./LocalImportPrompt";
import { Logo, Icon } from "../components/Visuals";

const navigation = [
  ["/app", "Home"],
  ["/app/originals", "Originals"],
  ["/app/studio", "Studio"],
  ["/app/library", "Library"],
  ["/app/content-packs", "Packs"],
  ["/app/events", "Events"],
  ["/app/history", "History"],
];

export function AppShell() {
  const { user } = useHostAuth();
  const { current, can } = useWorkspace();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="host-app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header app-header">
        <Link to="/app" aria-label="Ruckus host home">
          <Logo />
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="host-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"} <span>☰</span>
        </button>
        <nav
          id="host-navigation"
          className={open ? "open" : ""}
          aria-label="Host navigation"
        >
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/app"}>
              {label}
            </NavLink>
          ))}
          {can("boards.launch") && (
            <Link className="button small" to="/app/host">
              Start a Ruckus <Icon name="arrow" />
            </Link>
          )}
        </nav>
      </header>
      <div className="app-access-note">
        <WorkspaceSwitcher />{" "}
        <Link
          className="host-account-link"
          to="/app/settings"
          aria-label={`Account settings for ${user?.email}`}
        >
          Account ↗
        </Link>
      </div>
      <main id="main">
        <LocalImportPrompt key={current.id} />
        <ActionNotice />
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Your screen. Your people. Your Ruckus.</span>
        <nav aria-label="Host account and product information">
          <Link to="/app/settings">Settings</Link>
          <Link to="/app/workspace">Workspace</Link>
          <Link to="/app/history/analytics">Your Ruckus lately</Link>
          <Link to="/">Ruckus website</Link>
        </nav>
      </footer>
    </div>
  );
}
