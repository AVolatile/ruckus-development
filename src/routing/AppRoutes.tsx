import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Home } from "../marketing/Home";
import {
  AppRoute,
  LegacyRedirect,
  RouteLoading,
  SessionRoutes,
} from "./RouteBoundaries";

const Product = lazy(() =>
  import("../marketing/Product").then((m) => ({ default: m.Product })),
);
const Audience = lazy(() =>
  import("../marketing/Audiences").then((m) => ({ default: m.Audience })),
);
const Pricing = lazy(() =>
  import("../marketing/Access").then((m) => ({ default: m.Pricing })),
);
const AccountEntry = lazy(() => import("../auth/AccountEntry"));
const Resources = lazy(() =>
  import("../marketing/Resources").then((m) => ({ default: m.Resources })),
);
const AppShell = lazy(() =>
  import("../app/AppShell").then((m) => ({ default: m.AppShell })),
);
const WorkspaceCapability = lazy(() =>
  import("../workspaces/WorkspaceContext").then((m) => ({
    default: m.WorkspaceCapability,
  })),
);
const WorkspaceBoundary = lazy(() =>
  import("../workspaces/WorkspaceContext").then((m) => ({
    default: m.WorkspaceBoundary,
  })),
);
const PersonalWorkspaceRedirect = lazy(() =>
  import("../workspaces/WorkspaceContext").then((m) => ({
    default: m.PersonalWorkspaceRedirect,
  })),
);
const WorkspacePages = lazy(() => import("../workspaces/WorkspacePages"));
const BrandPage = lazy(() => import("../brand/BrandPage"));
const SecurityFlow = lazy(() => import("../auth/SecurityFlow"));
const Dashboard = lazy(() => import("../app/Dashboard"));
const Games = lazy(() =>
  import("../pages/Games").then((m) => ({ default: m.Games })),
);
const GameDetail = lazy(() =>
  import("../pages/Games").then((m) => ({ default: m.GameDetail })),
);
const HostSetup = lazy(() =>
  import("../pages/Setup").then((m) => ({ default: m.HostSetup })),
);
const Join = lazy(() =>
  import("../pages/Setup").then((m) => ({ default: m.Join })),
);
const LiveAudioBoundary = lazy(() => import("../audio/AudioProvider"));
const HostRoom = lazy(() =>
  import("../pages/HostRoom").then((m) => ({ default: m.HostRoom })),
);
const PlayerRoom = lazy(() =>
  import("../pages/PlayerRoom").then((m) => ({ default: m.PlayerRoom })),
);
const StudioLibrary = lazy(() => import("../studio/StudioLibrary"));
const StudioEditor = lazy(() => import("../studio/StudioEditor"));
const StudioPreview = lazy(() => import("../studio/StudioPreview"));
const Library = lazy(() =>
  import("../app/ProductSections").then((m) => ({ default: m.Library })),
);
const PackPages = lazy(() => import("../content/PackPages"));
const PackEditor = lazy(() => import("../content/PackEditor"));
const HostEvents = lazy(() => import("../events/EventList"));
const EventNew = lazy(() => import("../events/EventNew"));
const EventBuilder = lazy(() => import("../events/EventBuilder"));
const FutureSection = lazy(() =>
  import("../app/ProductSections").then((m) => ({ default: m.FutureSection })),
);
const Settings = lazy(() =>
  import("../app/AccountSettings").then((m) => ({
    default: m.AccountSettings,
  })),
);

function NotFound({ host = false }: { host?: boolean }) {
  return (
    <section className="page-hero">
      <h1>
        Wrong room.
        <br />
        Right people.
      </h1>
      <p>That page isn’t part of the party.</p>
      <Link to={host ? "/app" : "/"} className="button">
        Back to Ruckus ↗
      </Link>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="product" element={<Product />} />
          <Route path="teams" element={<Audience />} />
          <Route path="events" element={<Audience events />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="login" element={<AccountEntry />} />
          <Route path="signup" element={<AccountEntry signup />} />
          <Route
            path="forgot-password"
            element={<SecurityFlow mode="forgot" />}
          />
          <Route
            path="reset-password"
            element={<SecurityFlow mode="reset" />}
          />
          <Route path="verify-email" element={<SecurityFlow mode="verify" />} />
          <Route path="resources" element={<Resources />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<SessionRoutes />}>
          <Route element={<AppRoute />}>
            <Route
              path="app/workspaces/new"
              element={<WorkspacePages mode="create" />}
            />
            <Route
              path="app/invitations/:token"
              element={<WorkspacePages mode="accept" />}
            />
            <Route path="app/w/:workspaceId" element={<WorkspaceBoundary />}>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route
                  path="host"
                  element={
                    <WorkspaceCapability permission="boards.launch">
                      <HostSetup />
                    </WorkspaceCapability>
                  }
                />
                <Route path="originals" element={<Games />} />
                <Route path="originals/:slug" element={<GameDetail />} />
                <Route path="studio" element={<StudioLibrary />} />
                <Route path="studio/boards" element={<StudioLibrary />} />
                <Route
                  path="studio/boards/new"
                  element={
                    <WorkspaceCapability permission="boards.update">
                      <StudioEditor />
                    </WorkspaceCapability>
                  }
                />
                <Route
                  path="studio/boards/:id"
                  element={
                    <WorkspaceCapability permission="boards.update">
                      <StudioEditor />
                    </WorkspaceCapability>
                  }
                />
                <Route
                  path="studio/boards/:id/preview"
                  element={<StudioPreview />}
                />
                <Route path="library" element={<Library />} />
                <Route path="content-packs" element={<PackPages />} />
                <Route
                  path="content-packs/new"
                  element={
                    <WorkspaceCapability permission="content.create">
                      <PackPages create />
                    </WorkspaceCapability>
                  }
                />
                <Route path="content-packs/:packId" element={<PackPages />} />
                <Route
                  path="content-packs/:packId/edit"
                  element={
                    <WorkspaceCapability permission="content.update">
                      <PackEditor />
                    </WorkspaceCapability>
                  }
                />
                <Route path="events" element={<HostEvents />} />
                <Route
                  path="events/new"
                  element={
                    <WorkspaceCapability permission="events.create">
                      <EventNew />
                    </WorkspaceCapability>
                  }
                />
                <Route
                  path="events/:eventId"
                  element={
                    <WorkspaceCapability permission="events.update">
                      <EventBuilder />
                    </WorkspaceCapability>
                  }
                />
                <Route
                  path="events/:eventId/preview"
                  element={<EventBuilder preview />}
                />
                <Route
                  path="analytics"
                  element={<FutureSection section="analytics" />}
                />
                <Route
                  path="workspace"
                  element={<WorkspacePages mode="general" />}
                />
                <Route
                  path="members"
                  element={<WorkspacePages mode="members" />}
                />
                <Route
                  path="activity"
                  element={<WorkspacePages mode="activity" />}
                />
                <Route path="brand" element={<BrandPage />} />
                <Route path="brand/:brandKitId" element={<BrandPage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound host />} />
              </Route>
            </Route>
            <Route path="app/*" element={<PersonalWorkspaceRedirect />} />
          </Route>
          <Route path="join" element={<Join />} />
          <Route element={<LiveAudioBoundary />}>
            <Route path="room/:code/host" element={<HostRoom />} />
            <Route path="room/:code/play" element={<PlayerRoom />} />
          </Route>
        </Route>
        <Route
          path="studio/*"
          element={<LegacyRedirect from="/studio" to="/app/studio" />}
        />
        <Route
          path="games/*"
          element={<LegacyRedirect from="/games" to="/app/originals" />}
        />
        <Route
          path="host"
          element={<LegacyRedirect from="/host" to="/app/host" />}
        />
        <Route
          path="how-it-works"
          element={<LegacyRedirect from="/how-it-works" to="/product" />}
        />
        <Route
          path="for-teams"
          element={<LegacyRedirect from="/for-teams" to="/teams" />}
        />
        <Route
          path="remote"
          element={<LegacyRedirect from="/remote" to="/teams" />}
        />
        <Route
          path="about"
          element={<LegacyRedirect from="/about" to="/product" />}
        />
      </Routes>
    </Suspense>
  );
}
