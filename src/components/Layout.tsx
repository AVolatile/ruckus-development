import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo, Icon } from "./Visuals";
export function Layout() {
  const [open, setOpen] = useState(false),
    location = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
    const publicUrl = import.meta.env.VITE_PUBLIC_APP_URL;
    if (publicUrl) {
      let canonical = document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]',
      );
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.append(canonical);
      }
      canonical.href = new URL(location.pathname, publicUrl).href;
    }
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" aria-label="Ruckus home">
          <Logo />
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          aria-controls="public-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"} <span>☰</span>
        </button>
        <nav
          id="public-navigation"
          className={open ? "open" : ""}
          aria-label="Main navigation"
        >
          <NavLink to="/product">Product</NavLink>
          <NavLink to="/teams">Teams</NavLink>
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/join" className="nav-join">
            Join a room ↗
          </NavLink>
          <NavLink to="/login">Log in</NavLink>
          <Link className="button small" to="/signup">
            Start free <Icon name="arrow" />
          </Link>
        </nav>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <Link to="/">
            <Logo light />
          </Link>
          <p>
            Good company.
            <br />
            Questionable competition.
          </p>
          <Link to="/signup" className="button yellow">
            Start free <Icon name="arrow" />
          </Link>
        </div>
        <div className="footer-links">
          <div>
            <Link to="/product">Explore Ruckus</Link>
            <Link to="/teams">For teams</Link>
            <Link to="/events">For events</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div>
            <Link to="/app">Host tools</Link>
            <Link to="/resources">Host’s field guide</Link>
            <Link to="/join">Join a room</Link>
            <Link to="/login">Log in</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            Turn any shared screen into something the room can play with.
          </span>
          <span>© 2026 Ruckus. Players join without accounts.</span>
        </div>
      </footer>
    </>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="error-message">
      {message}
    </p>
  ) : null;
}
