import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useHostAuth } from "../auth/HostAuth";
import LocalImportPrompt from "./LocalImportPrompt";
import { Logo, Icon } from "../components/Visuals";

const navigation = [
  ["/app", "Home"],
  ["/app/originals", "Originals"],
  ["/app/studio", "Studio"],
  ["/app/library", "Library"],
  ["/app/events", "Events"],
];

export function AppShell() {
  const { user } = useHostAuth();
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
          <Link className="button small" to="/app/host">
            Start a Ruckus <Icon name="arrow" />
          </Link>
        </nav>
      </header>
      <div className="app-access-note">
        Your private host library · {user?.email}
      </div>
      <main id="main">
        <LocalImportPrompt />
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Your screen. Your people. Your Ruckus.</span>
        <nav aria-label="Host account and product information">
          <Link to="/app/settings">Settings</Link>
          <Link to="/app/workspace">Workspace · coming soon</Link>
          <Link to="/app/analytics">Analytics · coming soon</Link>
          <Link to="/">Ruckus website</Link>
        </nav>
      </footer>
    </div>
  );
}
