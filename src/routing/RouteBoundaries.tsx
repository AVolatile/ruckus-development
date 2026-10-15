import { lazy, Suspense } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

const HostBoundary = lazy(() => import("../auth/HostBoundary"));

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

// Host authentication stays outside every guest/player capability route.
export function AppRoute() {
  return <HostBoundary />;
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
