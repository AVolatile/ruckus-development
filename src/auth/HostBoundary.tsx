import { Navigate, Outlet, useLocation } from "react-router-dom";
import { HostAuthProvider, useHostAuth } from "./HostAuth";
import { RepositoryProvider } from "../studio/RepositoryProvider";
import { safeReturnTo } from "./returnTo";
function RequireHost() {
  const auth = useHostAuth(),
    location = useLocation();
  if (auth.loading)
    return (
      <section className="page-hero">
        <p role="status">Opening your host account…</p>
      </section>
    );
  if (auth.error)
    return (
      <section className="page-hero">
        <h1>Your account needs a moment.</h1>
        <p role="alert">{auth.error}</p>
        <button className="button" onClick={() => void auth.refresh()}>
          Try again
        </button>
      </section>
    );
  if (!auth.user)
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(safeReturnTo(location.pathname + location.search + location.hash))}`}
      />
    );
  return (
    <RepositoryProvider key={auth.user.id}>
      <Outlet />
    </RepositoryProvider>
  );
}
export default function HostBoundary() {
  return (
    <HostAuthProvider>
      <RequireHost />
    </HostAuthProvider>
  );
}
