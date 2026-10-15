# Ruckus architecture — Phase 1

## Product boundaries

Public Layout renders `/`, `/product`, `/teams`, `/events`, `/pricing`, `/resources`, `/login` and `/signup`. Marketing does not mount PartyProvider or import question banks. Account forms lazy-load only their small browser auth/session code. Shared fonts, catalog/topic metadata and visual assets remain lightweight product primitives.

AppRoute lazy-loads HostBoundary. HostAuth resolves `/api/v1/me` before any host content renders, then the account-scoped RepositoryProvider supplies CloudBoardRepository. `/app` and all its descendants require a valid server session. The dashboard and Studio use cloud summaries/documents; they never silently fall back to a separate local authoritative copy. Account settings display actual email and revoke the session on sign out. Workspace/analytics remain explicit future states.

SessionRoutes preserves one lazy PartyProvider across host app → live stage transitions. `/join`, `/room/:code/play` and `/room/:code/host` remain outside the host guard and dashboard. New room creation checks host authentication at the socket adapter; all other live host/player authority remains the existing room capability model. Players never need accounts. Live tokens still use `ruckus-session` sessionStorage; those are distinct from account sessions, whose primary tokens exist only in HttpOnly cookies.

`server/engine.ts` and socket payload contracts are unchanged. Existing validation, scoring, timers, bots, leaderboards, pause, rematches, player redaction and snapshot cloning remain authoritative. Cloud launch flushes/loads an authorized board and passes its validated immutable content to the existing adapter/engine. Subsequent board edits cannot mutate that room.

## Authentication and API

Better Auth owns password hashing, signed cookies and revocable PostgreSQL sessions at `/api/auth/*`. Host email/password flows and seven-day sessions are real; no external auth SaaS is required. Email verification and password recovery are pre-public-launch work, not simulated controls. See [AUTHENTICATION.md](AUTHENTICATION.md).

The authenticated product API is versioned separately:

| Method | Route                   | Behavior                                                                      |
| ------ | ----------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/v1/me`            | Session-derived minimal host identity.                                        |
| GET    | `/api/v1/boards`        | Private summaries, default 30/max 50, keyset cursor.                          |
| POST   | `/api/v1/boards`        | Validate draft; stable identity + revision 1 atomically. Optional retry key.  |
| GET    | `/api/v1/boards/:id`    | Owned current document and revision metadata.                                 |
| PUT    | `/api/v1/boards/:id`    | Require `baseRevisionId`; append revision atomically or conflict.             |
| DELETE | `/api/v1/boards/:id`    | Owned soft deletion; retain history.                                          |
| POST   | `/api/v1/boards/import` | Validated batch envelope; owner-scoped keys and per-board outcomes.           |
| GET    | `/ready`                | Database/schema readiness, separate from process `/health` and `/api/health`. |

Ownership is derived only from the server session. IDs from URLs are scoped by owner in every query; another owner's board is indistinguishable from a nonexistent board. Client timestamps/IDs in imported documents are never authoritative. Private responses are no-store. Unsafe authenticated requests require the configured Origin/Host; malformed JSON, oversized bodies, credential bounds and rate limits are enforced. Errors use `{ error: { code, message, requestId, details? } }` with safe details; Better Auth retains its own endpoint response format.

The principal codes are AUTH_REQUIRED, VALIDATION_ERROR, BOARD_NOT_FOUND, BOARD_CONFLICT, IMPORT_RETIRED, RATE_LIMITED, ORIGIN_REJECTED and INTERNAL_ERROR. Import responses use 207 for mixed validation outcomes and provide per-board codes rather than claiming a failed board was saved. Unexpected failures log only correlation IDs, never credential/content payloads.

## Database and revisions

Better Auth's generated user/session/account/verification tables are separate from `boards` and `board_revisions`. Boards are validated JSONB documents, not relational question/answer rows. The stable board owns private identity/list metadata and a current revision pointer. Every revision is immutable and belongs to that board. A deferred same-board FK makes create + revision 1 one atomic transaction; a trigger rejects revision update/delete. Ordinary deletion is soft.

Updates lock the owned row, compare the base revision, validate content, insert the next revision and move the pointer in one transaction. A stale base receives HTTP 409 with safe current-revision metadata. Canonical server SHA-256 hashes skip identical-content revisions. No user-provided timestamp or owner is trusted. See [DATABASE.md](DATABASE.md) for migration/index details and local/CI setup.

## Repository and Studio state

`studio/repository.ts` defines the async BoardRepository contract and CloudBoardRepository. List/get/create/save/delete/duplicate operations call the same-origin authenticated API. `RepositoryProvider` is recreated for a changed host account; there is no shared cross-account board cache. List responses update on library entry/import/action, not after every editor keystroke.

`studio/localRepository.ts` retains the original synchronous store, key, validation and recovery/export behavior. `LocalBoardRepository` is its Promise-compatible adapter. It is used for legacy detection/import, not normal authenticated saves. Valid and invalid local entries are inspected separately without modifying the source payload.

`useCloudDraft` owns asynchronous loading and save coordination outside the visual editor. Saves debounce 750ms and serialize against the last acknowledged revision. Edits during a request stay in the current draft and save next; older responses cannot claim newer text is saved. Returning exactly to acknowledged content restores the confirmed status without creating unnecessary revisions. Preview, launch, return and duplication explicitly flush first. Internal link navigation flushes or stays in the editor on failure; browser unload warns about unconfirmed edits.

On network/save failure, autosave pauses and offers retry/export. A 409 keeps local edits and the server version separate, offers raw draft export and explicit latest-version replacement, and never performs a silent merge/overwrite. A separate account/board-scoped sessionStorage cache stores only unconfirmed draft edits plus base revision. It retires on confirmation, restores same-base edits after refresh/re-auth, and reports a conflict if the server advanced. It never stores auth credentials or becomes the cloud source of truth.

## Local-to-cloud import

AppShell shows a nonblocking prompt for unimported `ruckus-studio-v1` entries and the destination account. Hosts choose import or Not now, and can export the exact raw local backup. Valid boards are checked before sending; invalid entries receive precise per-board feedback. Requests are bounded (the UI imports one board per request); the API also accepts bounded batches.

PostgreSQL's `(owner_user_id, client_import_key)` uniqueness and transaction-scoped advisory locks make concurrent/retried imports return the committed identity. A separate optional `ruckus-cloud-imports-v1` mapping is only a UI hint keyed by account/local ID. Mapping failures cannot create duplicates. The source library is never cleared, rewritten or marked in place.

## Route compatibility

| Earlier route                                      | Canonical route                          | Behavior                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/host`                                            | `/app/host`                              | Preserve `?game=slug`; login first when needed.                                                                                       |
| `/games`, `/games/:slug`                           | `/app/originals`, `/app/originals/:slug` | Prefix redirect, then host guard.                                                                                                     |
| `/studio`, `/studio/boards`                        | `/app/studio`, `/app/studio/boards`      | Prefix redirect, then host guard.                                                                                                     |
| `/studio/boards/new`                               | `/app/studio/boards/new`                 | New cloud draft after sign-in.                                                                                                        |
| `/studio/boards/:id`, `/studio/boards/:id/preview` | Same suffix under `/app/studio`          | Preserve suffix/query/hash. Local IDs require explicit local import; do not silently query another owner's data or auto-map to cloud. |
| `/how-it-works`, `/about`                          | `/product`                               | Public redirects.                                                                                                                     |
| `/for-teams`, `/remote`                            | `/teams`                                 | Public redirects.                                                                                                                     |
| `/join`, `/room/:code/host`, `/room/:code/play`    | Same                                     | Live capability URLs unchanged.                                                                                                       |
| `/brand`, `/campaign`, `/case-study`               | No production route                      | Source remains archived; ordinary not-found.                                                                                          |

Client redirects replace browser history and preserve suffixes, query strings and fragments. Unknown app/public pages have recovery links. Express serves compiled SPA deep links; marketing remains available without a host session. Netlify's old static fallback alone is insufficient for the authenticated API.

## Deployment and future scope

The supported Phase 1 topology is a combined Node application on one public origin, with PostgreSQL behind it and the existing in-memory Socket.IO rooms. Unrelated Netlify/Render third-party cookies are unsupported. A future split topology needs an intentional same-origin proxy or reviewed same-site domain configuration. Production fails closed without database/auth configuration and HTTPS APP_ORIGIN; see [DEPLOYMENT.md](DEPLOYMENT.md).

Organizations, memberships, workspace-owned boards, Brand Kits, entitlements, billing and analytics remain separate future domains. They are not encoded into authentication internals or overloaded into board revisions. Future workspace ownership should extend the service authorization boundary; current owner-scoped repositories do not pretend organizations already exist.
