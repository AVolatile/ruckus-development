# Phase 1 — Authentication + PostgreSQL + CloudBoardRepository

Completed October 14, 2026 in `AVolatile/ruckus-development`. The working tree was clean at the initial audit. No upstream/demo repository, remote Git settings, live services, real production credentials or deployment were changed. An existing server on port 4310 was left running; verification used separate ports 4311/4312.

## Executive summary

Ruckus now has real host accounts and private PostgreSQL-backed Studio boards. A host can sign up, create/import/edit a cloud board, sign out/in, retrieve it in a second browser and launch it into the existing account-free multiplayer flow. Server-derived ownership, immutable revisions, optimistic concurrency and explicit local import are enforced and tested. The established visual language, six Originals, Studio UX, guest join routes and authoritative engine are preserved.

## Authentication architecture chosen and why

Better Auth **1.7.8**, its supported Express handler, Drizzle PostgreSQL adapter and generated auth schema. Core email/password needs no external SaaS credentials. The library owns password hashing, signed cookies and revocable sessions; no custom password/JWT/session crypto was created. A modular `createAuthentication` factory supports testing and future supported providers without coupling the room engine to provider internals.

The browser uses same-origin endpoint calls and `/api/v1/me`. Seven-day sessions refresh after one day; cookie caching is disabled. Production uses an exact __Host session cookie with Secure, HttpOnly, SameSite=Lax, root path and no Domain. The library's automatic __Secure prefix is disabled in favor of explicit secure cookie attributes, avoiding a double prefix. Production attributes **and actual session restoration** were integration tested. No auth token is stored in browser storage, and no social sign-in/recovery controls are simulated.

References: [Express](https://better-auth.com/docs/integrations/express), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [sessions](https://better-auth.com/docs/concepts/session-management), [cookies and first-party topology](https://better-auth.com/docs/concepts/cookies).

## Database/data-access architecture chosen and why

PostgreSQL plus **Drizzle ORM 0.45.4**, **drizzle-kit 0.31.11** and **pg 8.23.1**. Typed schema/query boundaries and explicit migrations fit the existing TypeScript/Express system without moving persistence into React. `server/boards/service.ts` owns transactions and authorization; `server/db` owns database wiring. Boards remain validated JSONB documents rather than prematurely normalized question/answer tables.

Compose and CI pin PostgreSQL **18.6**. Docker/PostgreSQL tools were absent here, so actual local verification used the pinned optional **embedded-postgres 18.4.0-beta.17**, running real PostgreSQL **18.4** on loopback with generated local-only secrets. It is a development fallback, not a production database distribution. No in-memory SQL emulator or fake persistence was used.

## Database schema

Better Auth's generated `user`, `session`, `account`, `verification` tables store supported provider/session data. Email is normalized and unique. All timestamps are timezone-aware instants.

`boards`: UUID identity, owner user FK, title/description, draft/ready status, schema version, non-null current revision, optional owner-scoped import key, creation/update and soft-deletion times. Active owner/update/ID and owner/import-key indexes support current access paths.

`board_revisions`: UUID identity, board FK, unique per-board revision number, validated JSONB draft content, canonical server hash, creating-user FK, source and timestamp. A deferred same-board current-revision FK makes completed boards point to exactly one of their own revisions. A trigger rejects ordinary revision update/delete. Soft deletion never rewrites history.

## Migration files created

- `migrations/0000_host_cloud_foundation.sql`: generated auth and product tables, FKs, uniqueness, checks and indexes.
- `migrations/0001_revision_invariants.sql`: deferred current-revision FK, immutable revision trigger, normalized-email and document-identity constraints.
- `migrations/meta/{0000_snapshot,0001_snapshot,_journal}.json`: committed Drizzle metadata.

Both fresh development/test databases were migrated. Re-running migrations and running the compiled production migration command succeeded. `npm run db:generate` also confirms no unexpected schema changes after the development-tool override. Application startup does not auto-sync. Docker runtime includes the migration directory and compiled runner; no deployment migration hook was added.

## API endpoints

| Method | Endpoint                | Result                                                                           |
| ------ | ----------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/v1/me`            | Minimal session-derived host identity.                                           |
| GET    | `/api/v1/boards`        | Owned summaries only, bounded keyset pagination.                                 |
| POST   | `/api/v1/boards`        | Atomic board/revision 1; optional idempotency key.                               |
| GET    | `/api/v1/boards/:id`    | Owned current document and revision metadata.                                    |
| PUT    | `/api/v1/boards/:id`    | Base-revision comparison and atomic immutable revision.                          |
| DELETE | `/api/v1/boards/:id`    | Owned soft deletion.                                                             |
| POST   | `/api/v1/boards/import` | Owner-scoped import keys, per-board results, 207 for partial validation failure. |
| GET    | `/ready`                | Database/schema readiness separate from unchanged liveness routes.               |

Better Auth remains at `/api/auth/*`. Product errors are safe machine-readable envelopes with correlation IDs; other owners and nonexistent boards receive the same board-not-found response. Optional revision-history listing was not added.

## BoardRepository changes

`BoardRepository` is now an asynchronous contract returning summaries/current documents with revision metadata. `CloudBoardRepository` calls the authenticated API; all signed-in dashboard/Studio/template flows use it. `LocalBoardRepository` adapts the original store to Promises for legacy import/recovery. The old synchronous implementation and exact `ruckus-studio-v1` payload remain in `localRepository.ts`; existing data is not silently migrated or invalidated.

`RepositoryProvider` is account-scoped, with no cross-user global content cache. The editor's `useCloudDraft` serializes 750ms-debounced saves, waits for acknowledgements, preserves edits made during a request, flushes before preview/launch/return/duplicate/navigation, and pauses on failed/conflicting saves. Lists are not refetched after each autosave. Dashboard, summaries, imports, previews and launch all use the same repository boundary.

## Local-to-cloud migration behavior

AppShell detects unimported local entries after login, identifies the destination email, offers Import/Not now and a raw backup export, and leaves local originals intact. Valid entries are checked before sending; invalid entries are reported separately. The UI sends bounded individual requests; the API supports bounded batches.

An owner/import-key unique constraint plus transaction-scoped lock prevents duplicates under retry/concurrency. Successful results alone populate a separate optional account/local-ID mapping. A corrupt or unwritable mapping does not compromise server idempotency or destroy the source. Retrying a deleted import reports it as retired rather than silently resurrecting it. Old local editor IDs require explicit import/library navigation; there is no silent local persistence fallback inside authenticated Studio.

## Route/auth guard behavior

Public marketing and real account entry stay public. Every `/app` descendant resolves a valid host session before rendering. Unauthenticated requests go to login with a validated app-only return path; API checks remain independent of that guard. Existing legacy redirects keep query/hash/suffix compatibility.

`/join`, `/room/:code/play` and `/room/:code/host` remain outside AppRoute and AppShell. New room creation checks the host account at the socket adapter; existing live capability tokens still handle controls/reconnect independently. No ordinary player authentication was added. Logout revokes the account session and leaves local boards and room capability state alone.

## Security controls implemented

Library-backed hashing/session signing; database-backed revocation; explicit production cookie attributes; normalized unique email; 12–128-character passwords; password-manager-friendly fields; generic login failures; safe return paths; exact Origin/Host checks on unsafe cookie requests; same-site cookies; per-IP auth/API limits using the existing limiter; bounded streamed auth bodies and board JSON; strict Zod validation; no-store private responses; correlation IDs; sanitized errors/logging; safe production configuration failure; explicit proxy trust only; owner-scoped queries and FKs; non-enumerating board responses. Existing socket-origin and room-capability validation remain intact.

No session secrets/passwords/DB URLs are printed by application logging. Auth/DB libraries remain server-only. Development/generated files are ignored by Git and excluded from Docker build contexts.

## Concurrency/revision behavior

Create inserts stable board identity and revision 1 atomically. Save locks the owned row and checks base revision before appending a revision/moving the pointer. Concurrent saves from the same base yield one success and one conflict. No-op content does not append a revision. Server-owned identity/timestamps do not affect content hashes. Previous snapshots remain unchanged and cannot be updated/deleted normally.

A conflict retains the host's draft and offers export or explicit replacement with the latest cloud version. Network failures never claim success and offer retry/export. A separate account/board-scoped sessionStorage cache preserves unconfirmed edits through reload/re-auth when available, retires on confirmation, and detects an advanced server base. It is not a second authoritative library. Browser unload warns about unconfirmed work; internal links flush or stay in the editor on failure.

## Files added

- Infrastructure: `compose.yaml`, `drizzle.config.ts`, `.github/workflows/quality.yml`, the migration SQL/metadata above.
- Server auth: `server/auth/{config,create-auth,environment}.ts`.
- Server data/API: `server/db/{auth-schema,client,schema,migrate}.ts`, `server/boards/{content,service}.ts`, `server/api/{errors,http}.ts`.
- Shared contract: `shared/cloud.ts`.
- Browser auth: `src/auth/{AccountEntry,HostAuth,HostBoundary}.tsx`, `returnTo.ts`, `src/lib/api.ts`.
- Product/repository UX: `src/app/{AccountSettings,LocalImportPrompt}.tsx`, `src/studio/{LocalBoardRepository,RepositoryProvider,localRepository,useBoardLibrary,useCloudDraft}` with their corresponding `.ts`/`.tsx` extensions.
- Development/testing scripts: `scripts/{setup-local,local-database,prepare-test-database,verification-app}.mjs`, `scripts/migrate.ts`.
- Tests: `tests/cloud.test.ts`, `tests/integration/cloud.test.ts`, `tests/support/host-session.ts`, `tests/browser/{cloud.spec,fixtures}.ts`.
- Documentation: `docs/{PHASE-1-AUDIT,PHASE-1-REPORT,DATABASE,AUTHENTICATION}.md`.

## Files removed

No useful source/assets/data were deleted. The old local repository implementation moved into `src/studio/localRepository.ts`; the original repository entry now defines the async cloud contract. Placeholder AccountEntry/Settings presentation was replaced by real auth/account components. Portfolio surfaces remain archived.

## Files materially changed

`server/index.ts` installs API/auth and checks authentication on create only; engine and socket payload contracts remain untouched. `server/validation.ts` and `shared/boards.ts` only change the Zod import to its supported v3 compatibility path. `src/routing/*`, `src/app/*`, `src/studio/{repository,StudioEditor,StudioLibrary,StudioPreview}`, `src/marketing/{Access,Home,Product,Resources}` and shell CSS adopt real account/cloud states while preserving visual primitives. Existing browser/socket tests use real authenticated host fixtures while preserving guest/game checks. `package.json`, lockfile, environment/ignore files, Docker runtime, Render blueprint, Playwright config, README and architecture/deployment/vision/roadmap docs were updated for the new foundation.

## Dependencies added and justification

- `better-auth@1.7.8`, `@better-auth/drizzle-adapter@1.7.8`: mature auth/session implementation and supported SQL integration.
- `drizzle-orm@0.45.4`, `pg@8.23.1`: typed PostgreSQL queries/transactions and maintained driver.
- Dev `drizzle-kit@0.31.11`, `@types/pg@8.23.1`: explicit SQL migration generation and types.
- Dev `embedded-postgres@18.4.0-beta.17`: optional real local PostgreSQL fallback because Docker is absent here.
- Root Zod is `4.6.7` for Better Auth's peer dependency; existing Ruckus validation imports `zod/v3`, preserving its semantics through the officially supported compatibility entry point. [Zod versioning reference](https://zod.dev/v4/versioning).
- A targeted override patches Drizzle's development-only transitive esbuild dependency to a safe 0.25.x version. No force/legacy-peer install was used. The resulting npm audit reports zero vulnerabilities.

## Environment variables added

`DATABASE_URL`, `AUTH_SECRET`, `APP_ORIGIN`; optional reviewed `TRUST_PROXY=loopback`; Compose-only `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`; explicit `TEST_DATABASE_URL` for isolated tests. Existing PORT/public URL/socket allowlist values remain. `PLAYWRIGHT_BASE_URL`/`VERIFY_PORT` allow isolated verification without interrupting an existing development server. Production secrets are never committed or baked into frontend variables. Setup generated only ignored local development secrets.

## Tests executed and exact results

| Command/check                                                                                           | Actual result                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                                     | PASS, client/shared and server.                                                                                                     |
| `npm run lint`                                                                                          | PASS.                                                                                                                               |
| `npm test` without live origins                                                                         | 20 passed, 3 intentionally skipped, 0 failed.                                                                                       |
| `TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test` against compiled app | **23 passed, 0 skipped, 0 failed**, about 123 seconds.                                                                              |
| `npm run test:integration`                                                                              | **4 passed, 0 skipped, 0 failed** against real PostgreSQL, including production cookies.                                            |
| `npm run build`                                                                                         | PASS, frontend plus server.                                                                                                         |
| `npm run build:server` after adding the compiled migration runner                                       | PASS.                                                                                                                               |
| Development/test migrations and compiled migration runner                                               | PASS; actual server version **18.4**.                                                                                               |
| Targeted cloud/Studio browser runs                                                                      | Account/import/conflict/isolation and original Studio flows passed after correcting an autosave status edge case.                   |
| `PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e` against final compiled app                 | **13 passed, 0 failed**, about 2.6 minutes.                                                                                         |
| Browser accessibility                                                                                   | Zero Axe WCAG 2 A/AA and 2.1 AA violations on real signup, dashboard, library and settings.                                         |
| Responsive/navigation                                                                                   | 320, 390, 768, 1024 and 1440px new public/host/account surfaces; existing gameplay phone/host sizes; no overflow in tested layouts. |
| Browser bundle/network                                                                                  | Public pages avoid realtime and question banks; no PostgreSQL/Drizzle/server-auth/secret configuration in JS assets.                |
| Dependency audit                                                                                        | Zero reported npm vulnerabilities after the development esbuild override.                                                           |
| Formatting / diff                                                                                       | PASS — selected changed/new code/docs pass Prettier check; `git diff --check` is clean.                                             |

Coverage includes real signup/login/logout, duplicate signup handling, normalized email, generic invalid credentials, revocation, unsafe-origin rejection, request limits, direct ownership attacks, non-enumeration, list summaries, invalid drafts, no-op saves, row-locked conflicts, immutable history, soft deletion and concurrent idempotent imports. Browser tests verify second-context retrieval, preserved local originals, retry/no duplicate, real cloud launch to an unauthenticated phone, conflict export/latest recovery, offline/reload recovery and edits during an in-flight save. All six Original loops, bots, reconnect, voting, keyboard drawing, QR URLs and Studio JSON/CSV/previews remain covered.

The extensive responsive test has a deliberate 120-second budget. Unit/socket fixtures create real host accounts, while guest browser contexts remain unauthenticated. Test databases are explicit/local and never target production. The existing engine, player controller and PlayerRoom have no code changes.

## Performance/bundle observations

Final client entry is approximately **92.97 kB gzip** versus Phase 0's **92.72 kB**. HostAuth, AccountEntry, repository/editor code, realtime (~14.34 kB gzip) and question library (~16.24 kB gzip) remain separate lazy chunks. No server auth/PostgreSQL libraries ship to browsers. Lists use one summary query with bounded pagination, not N+1 content loads; autosave does not refetch the library.

## Known limitations

Rooms remain in memory and do not survive a server restart. Local imports copy rather than delete sources. Optional unsaved recovery depends on tab storage and is not a guarantee of durability before cloud acknowledgement. Historical local board IDs are not silently treated as cloud IDs. No cloud revision-history UI, account deletion, shared organizations, Brand Kits, billing, saved analytics or player progression was added.

Docker/Compose, actual PostgreSQL 18.6 and the GitHub Actions workflow were **not run in this environment**; local PostgreSQL 18.4 plus the equivalent test/build/browser commands were run. Docker image execution was unavailable. No hosted deployment, real TLS proxy, physical phone or cellular verification was performed. Native production cookie construction/restoration was separately integration tested; local compiled browsers used HTTP/test mode.

## Deployment considerations

Use the combined Node service for pages/auth/API/Socket.IO under one public origin with a protected PostgreSQL service. Run reviewed migrations explicitly before release; readiness is separate from liveness. The Docker artifact includes migrations/the native compiled runner and excludes generated local databases/secrets. The Render blueprint now describes the combined service with manually configured secrets/origin, without provisioning a database or adding an automatic migration/deploy hook. The old Netlify split guide is marked historical; unrelated-domain cookie auth is unsupported. No live deployment was performed.

## Pre-public-launch security gaps

Implement and verify outbound transactional email, email ownership verification and safe password recovery through the selected auth library. Do not launch public signup with unrecoverable accounts. Duplicate signup availability is not claimed to be enumeration-resistant. Complete actual-domain TLS/proxy/cookie checks, PostgreSQL network/TLS policy, backups/restores, retention/account deletion procedures, production abuse monitoring, dependency patch policy and an independent security review. No enterprise certification or comprehensive compliance claim is made.

## Recommended Phase 2

**Organizations + memberships + shared workspace ownership + the first real Ruckus Brand Kit model.** Build it after the pre-public-launch account/security work, on the server-derived ownership and immutable content foundation. No Phase 2 implementation was begun.
