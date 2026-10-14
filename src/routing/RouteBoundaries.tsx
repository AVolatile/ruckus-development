import { lazy, Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

const RealtimeProvider = lazy(async () => {
  const { PartyProvider } = await import("../lib/party");
  return { default: PartyProvider };
});

export function RouteLoading() {
  return (
    <section className="page-hero">
      <p role="status">Opening Ruckus…</p>
    </section>
  );
}

// Hosts and guests share live-session continuity; public routes never mount this provider.
export function SessionRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <RealtimeProvider>
        <Outlet />
      </RealtimeProvider>
    </Suspense>
  );
}

// Phase 1 inserts the host auth guard here, outside every guest/player route.
export function AppRoute() {
  return <Outlet />;
}

// Keep room parameters, import links, and saved preview links usable.
export function LegacyRedirect({ from, to }: { from: string; to: string }) {
  const { pathname, search, hash } = useLocation();
  return (
    <Navigate
      replace
      to={`${to}${pathname.slice(from.length)}${search}${hash}`}
    />
  );
}
