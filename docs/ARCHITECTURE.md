# Ruckus product architecture

## Boundaries

`main.tsx` owns the browser router and error boundary. `routing/AppRoutes.tsx` declares three responsibilities:

1. **Public:** `components/Layout` renders only marketing navigation and footer. `marketing/*` never imports PartyProvider, Socket.IO, board repositories, or large question banks. Static interactive StagePreview is shared UI, not a session. Fonts, catalog metadata, topic names, assets, and visual tokens remain shared.
2. **Host:** `AppRoute` wraps `/app` and is the Phase 1 guard insertion point. `app/AppShell` provides host navigation and a truthful open-access/local-storage notice. Originals, setup, Studio, and dashboard use existing game and authoring implementations. Future workspace/analytics sections give an honest explanation and working next action.
3. **Live session / guest:** a lazy `SessionRoutes` mounts PartyProvider around both host application and live/guest routes. This preserves context across a Studio/Original launch into the stage, without exposing live state to public marketing. `/join` and player routes sit outside AppRoute and AppShell; keep them outside future host authentication. The full-screen host stage also bypasses dashboard chrome. In Phase 1, host-stage authorization needs a separate owner check, not an account requirement on every socket.

The provider connects automatically only on `/app/host`, `/join`, and `/room/*`. Studio launches connect explicitly via the existing create API. Returning to non-live routes disconnects; leaving the session route group also cleans up listeners. Existing `ruckus-session` sessionStorage identity and reconnect tokens are unchanged. A public visit never mounts or eagerly loads the provider.

Public pages, host features, Studio, and live screens have lazy module boundaries. Home uses only lightweight catalog metadata; question libraries load on host/Studio surfaces. TemplateShelf is lazy and creates boards through the same `createLocalBoard` operation used in Studio.

## Routes before and after

Before Phase 0, a global PartyProvider wrapped marketing and product pages. A single Layout handled everything except joining and active rooms.

| Before                                          | Canonical now                                          | Compatibility                                                            |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `/`                                             | `/`                                                    | Marketing copy cleaned; existing visual composition preserved.           |
| `/how-it-works`                                 | `/product`                                             | Client redirect.                                                         |
| `/for-teams`, `/remote`                         | `/teams`                                               | Client redirects; remote play also explained on `/events`.               |
| `/pricing`                                      | `/pricing`                                             | Honest development/early-access state.                                   |
| `/resources`                                    | `/resources`                                           | Host guide with customer-facing copy.                                    |
| `/about`                                        | `/product`                                             | Client redirect; old portfolio About archived.                           |
| `/host`                                         | `/app/host`                                            | Client redirect, including `?game=slug`.                                 |
| `/games`, `/games/:slug`                        | `/app/originals`, `/app/originals/:slug`               | Prefix redirect. Six game implementations unchanged.                     |
| `/studio`, `/studio/boards`                     | `/app/studio`, `/app/studio/boards`                    | Prefix redirect.                                                         |
| `/studio/boards/new`                            | `/app/studio/boards/new`                               | Prefix redirect.                                                         |
| `/studio/boards/:id`                            | `/app/studio/boards/:id`                               | Prefix redirect.                                                         |
| `/studio/boards/:id/preview`                    | `/app/studio/boards/:id/preview`                       | Prefix redirect.                                                         |
| `/join`, `/room/:code/play`, `/room/:code/host` | Same                                                   | QR links and session contracts unchanged.                                |
| `/brand`, `/campaign`, `/case-study`            | No production route                                    | Normal not-found screen. Source archived.                                |
| None                                            | `/events`, `/login`, `/signup`                         | New marketing/account-entry surfaces.                                    |
| None                                            | `/app`, `/app/library`, `/app/events`, `/app/settings` | Host dashboard, discovery, live event entry, and local storage guidance. |
| None                                            | `/app/analytics`, `/app/workspace`                     | Explicitly future-facing; no fabricated metrics/workspaces.              |

`LegacyRedirect` uses replacement navigation and preserves the full suffix, query, and hash. Saved board IDs and exported files do not change. Redirects are client-side, not HTTP 301s. Unknown public and app paths have appropriate recovery links.

Netlify's existing `/* -> /index.html` 200 rewrite serves all direct links. Express’s production SPA fallback covers the same route shape locally. No rewrite, deployment, server engine, CORS, origin validation, or socket event change was needed. Local production verification exercises the compiled app; an actual Netlify deploy remains a separate action.

## Persistence and Phase 1 hooks

`studio/repository.ts` keeps the existing synchronous BoardRepository API and `boards` local implementation. The `ruckus-studio-v1` storage key, schemas, corrupt-data preservation, and limits remain unchanged. `createLocalBoard` is the shared template/draft creation operation. The UI never pretends a local board has cloud ownership.

Phase 1 should introduce asynchronous repository operations and explicit loading/error states alongside the authenticated API. Do not implement a cloud repository behind this synchronous contract or silently switch storage. Migrate local boards only with explicit ownership, import validation, duplicate handling, recovery/export, and user-visible confirmation. Preserve local export and recovery paths.

Authenticate host HTTP CRUD and enforce owner/organization access on the server. PostgreSQL should model users, sessions, boards, and immutable board revisions before shared organization features. Live rooms should consume a validated immutable revision snapshot. The authoritative realtime engine remains independent of account-provider internals; guest joining retains room-scoped identity tokens.

Auth entry routes intentionally contain no credential form or provider buttons yet. Replace their content with a real provider integration in Phase 1, then protect AppRoute. No fake login state, stored passwords, fake cloud records, entitlement framework, database, or checkout was added.

## Visual and source preservation

Existing tokens, typography, responsive sheets, gameplay/editor CSS, illustrations, and interaction conventions remain the product language. `styles/app-shell.css` adds only surface composition and adapts the existing menu pattern to the longer navigation. `components/StagePreview` and `components/DemoButton` split static marketing visuals from actual room creation. Original and Studio game rules and scoring remain untouched.

See [the audit](PHASE-0-AUDIT.md) for KEEP/MOVE/REMOVE_FROM_PRODUCTION/REBUILD_PRESENTATION classifications, and [the archive notes](../src/archive/README.md) for retained demo assets. The portfolio stylesheet is retained in source and excluded from the production CSS entry point.
