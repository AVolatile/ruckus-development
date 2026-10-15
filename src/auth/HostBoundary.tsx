import { Navigate, Outlet, useLocation } from "react-router-dom";
import { HostAuthProvider, useHostAuth } from "./HostAuth";
import { safeReturnTo } from "./returnTo";
function RequireHost() {
  const auth = useHostAuth(),
    location = useLocation();
  if (auth.loading)
    return (
      <main id="main" className="page-hero">
        <p role="status">Opening your host account…</p>
      </main>
    );
  if (auth.error)
    return (
      <main id="main" className="page-hero">
        <h1>Your account needs a moment.</h1>
        <p role="alert">{auth.error}</p>
        <button className="button" onClick={() => void auth.refresh()}>
          Try again
        </button>
      </main>
    );
  if (!auth.user)
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(safeReturnTo(location.pathname + location.search + location.hash))}`}
      />
    );
  return <Outlet key={auth.user.id} />;
}
export default function HostBoundary() {
  return (
    <HostAuthProvider>
      <RequireHost />
    </HostAuthProvider>
  );
}
