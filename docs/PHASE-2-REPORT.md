# Phase 2 — Secure Workspaces, Memberships, Shared Ownership and Brand Kits

Implemented October 14, 2026 on `feat/phase-2-workspaces-brand-kits` in `AVolatile/ruckus-development`. The initial working tree was clean and already on the requested branch. No remote Git settings, upstream/demo checkout, hosted service, production credential or deployment was changed.

## Executive summary

Ruckus now supports verified multi-user organization collaboration alongside every host’s personal workspace. PostgreSQL owns workspace membership, shared board access, versioned Brand Kits, private imagery and operational activity. Existing Studio saves/history/gameplay remain in use. Two verified browser accounts can create/join a shared workspace, edit the same board according to role, retrieve persisted Brand settings and launch an organization board to an unauthenticated guest.

## Pre-implementation audit findings

Reviewed Phase 1 docs, auth/generated schema/migrations, board/revision transactions, API/Origin/limits, repository/provider, host boundary/routes/shell/settings/import, launch adapter, tests/CI and preserved artwork/styles. Direct user ownership needed replacement; row-locked revision saves and immutable history were already suitable and retained. Email ownership/recovery/delivery needed closure before invitations. See [audit](PHASE-2-AUDIT.md).

## Identity-security changes

Better Auth 1.7.8 remains responsible for credentials, sessions, verification signatures/expiry and password reset. Signup issues one-hour verification links. A supported before-hook atomically consumes a hashed delivery marker in the existing verification table to reject replay, while Better Auth validates the signed token and verifies the user. A failed verification after marker consumption requires a resend. No custom password/signature protocol was introduced.

Personal usage remains available before verification. Creating organizations, issuing invitations and accepting invitations query verified identity server-side. Password reset uses the library’s single-use 30-minute token and revokes all existing sessions. See the official [email/password flow](https://better-auth.com/docs/authentication/email-password). Forgot-password responses match for present/absent addresses. Existing exact Secure/HttpOnly/Lax production cookies and revocation tests remain. Unexpected auth errors are sanitized through the library’s error hook, avoiding raw fallback logging.

## Email architecture

`EmailTransport` has provider-neutral SMTP, in-memory automated capture and private development files. Production rejects memory/file modes and requires SMTP_HOST/EMAIL_FROM; TLS is required through implicit TLS or STARTTLS using [Nodemailer SMTP](https://nodemailer.com/smtp). Optional SMTP credentials must be paired. Links use validated APP_ORIGIN, with escaped accessible HTML/plain-text templates for verification, reset and invitations. No URL/token is logged. Files are ignored under `.local/mail`, directory 0700/files 0600. Browser verification explicitly uses file capture; domain integration tests use memory. No external SMTP service or real provider credentials were used.

## Workspace model

Workspaces have permanent UUID/kind/creator, name, creation/update and archive time. A database user-insert trigger creates exactly one personal workspace and owner membership atomically. Existing users are backfilled. Personal membership/kind/creator cannot change; personal workspaces cannot be independently archived/deleted. Organizations have role memberships, preserve data on archive and disappear from normal access/selection. Names are not globally unique. Creation has a technical 20-active-organization-per-creator safeguard.

## Role/permission matrix

| Action                                        | Owner | Admin | Host | Viewer                             |
| --------------------------------------------- | ----- | ----- | ---- | ---------------------------------- |
| Read workspace/members/boards/Brand           | Yes   | Yes   | Yes  | Yes                                |
| Create/edit/delete/duplicate/launch boards    | Yes   | Yes   | Yes  | No                                 |
| Copy readable board into writable destination | Yes   | Yes   | Yes  | Yes, if destination permits create |
| Rename organization                           | Yes   | Yes   | No   | No                                 |
| Invite/manage non-owner members               | Yes   | Yes   | No   | No                                 |
| Grant/change/remove ownership                 | Yes   | No    | No   | No                                 |
| Manage Brand Kits/images                      | Yes   | Yes   | No   | No                                 |
| Read activity                                 | Yes   | Yes   | No   | No                                 |
| Archive organization                          | Yes   | No    | No   | No                                 |

Shared capability/role-grant definitions feed a central server authorization boundary and presentation. Personal membership APIs reject modification. The final owner cannot leave, be removed or be demoted until another owner exists. Hosts deliberately may delete shared boards; Viewers may not launch workspace boards. UI controls reflect capabilities; APIs independently enforce them.

## Phase 1 board migration strategy and results

`0002_workspaces_brand_kits.sql` creates personal workspaces/owner membership for every existing user, renames owner_user_id to created_by_user_id provenance, backfills workspace_id and adds constraints/indexes after backfill. It does not rewrite revision/content rows, identity, current pointers, timestamps, soft deletion or import keys. Migrations run transactionally and fail on orphans.

The isolated Phase 1 fixture creates two users, active/deleted boards and two revisions per board, applies both Phase 1 SQL migrations then Phase 2 SQL, and compares all historical rows and metadata. It passes with IDs, pointers, authorship, JSON, numbers, timestamps, deletion and import keys unchanged. The fixture flushes its initial deferred FK checks before simulating the upgrade boundary. Final test database inspection reports PostgreSQL 18.4, zero orphan boards and zero users with an incorrect personal-workspace count. Development/test migrations and repeated compiled migration runner succeed. No development data was reset.

## Membership/invitation architecture

Memberships use real user/workspace FKs and unique pairs. Relationship grant/removal policy is shared centrally. Workspace row locks serialize membership changes and protect final-owner checks; deferred database triggers also reject ownerless commits. Admins cannot grant/remove ownership, including their own promotion.

Invitations generate 32 random bytes, store only SHA-256 token hashes and expire after seven days. Authenticated acceptance requires verified matching normalized email and locks workspace/invitation before one membership insert/consumption. Revoked, expired, reused and wrong-email invitations fail. Existing members use role management rather than a second invite. A pending-email uniqueness rule prevents duplicate invites; expired pending entries are retired before replacement. Pending invites are capped at 50. SMTP is awaited before commit; a rare commit failure after delivery can produce an unusable link and requires safe reissue. No bulk invites, delivery outbox or token browser storage exists.

## Shared board ownership changes

Every board CRUD/import query operates in a validated workspace. Creator provenance and immutable revision authors identify collaborators. Same-base competing saves still yield one success/one conflict; no-op hashes retain the revision. One CloudBoardRepository/editor/autosave implementation serves both workspace types. Recovery keys include account/workspace/board and consume compatible Phase 1 tab recovery without modifying the legacy library.

Local import defaults to personal workspace with explicit allowed target selection. Hints are account/destination-scoped; server idempotency is workspace-scoped. A previously imported personal source can still be explicitly imported into an organization. Raw local originals remain untouched. Cross-workspace copy locks both workspaces in sorted order, checks source read/target create, creates a new ID/revision 1 and audits atomically; source history never moves.

Cloud launches send an optional workspace/board reference. The server locks/checks launch permission and reads current content before passing a validated snapshot to the unchanged engine. Other room/player payloads and capabilities remain intact. Legacy authenticated raw-board launch supports portable authored content; reading/exporting/copying permitted content is allowed. Organization membership is never required for ordinary guests.

## Brand Kit architecture

Workspace-owned kits persist name, default flag, creator, current pointer, timestamps and soft deletion. Config includes display name, canonical hex primary/secondary/accent/surface colors, private logo/background IDs, optional footer and required Ruckus attribution. Defaults use the existing Ruckus palette. Branding customizes experience previews, never dashboard theme. Owners/Admins manage; Hosts/Viewers read. There is a technical 50-active-kit safeguard, no paid plan limit.

## Brand revision architecture

Immutable revisions store name/config/hash/author/time with unique per-kit numbers. A deferred same-kit FK protects current pointers. Saves compare baseRevisionId under locking; stale admins get BRAND_CONFLICT with their edits preserved for export or explicit latest replacement. No-op updates retain revision identity. One active default is enforced by a partial unique index. The first kit becomes default; deleting default selects the oldest remaining active kit (UUID tie-break), or falls back to ordinary Ruckus styling. Defaults/deletion serialize on workspace.

## Brand asset architecture

`BrandAssetStore` isolates byte storage; `PostgresBrandAssetStore` stores small bytea assets now and can later be replaced by object storage. Input must be static PNG/JPEG/WebP with matching magic/MIME. SVG/GIF/HTML/PDF/arbitrary files/remote URLs are rejected. Limits are 2 MB logo, 5 MB background, 4096 pixels per edge and 16 megapixels. Sharp bounds decode, rejects malformed/animated/oversized images, rotates orientation, strips metadata and emits WebP. Processed output is bounded too.

Asset GET requires session/membership/brand.read and scopes by workspace; delivery uses image/webp, nosniff, private revalidation, content-hash ETags and restrictive CSP. Referenced IDs must match workspace and image kind. Remove in the editor records null in the next revision. Unused uploads can be retired; historically referenced images retain bytes. A lifetime technical safeguard of 100 assets/100 MB per workspace bounds orphan accumulation pending future retention tooling. No unauthenticated/public asset URL exists.

## Accessibility/contrast handling

Colors canonicalize to uppercase six-digit hex. Relative luminance/contrast calculations derive readable black/white foregrounds while preserving selected colors. Low primary/surface contrast produces an explanatory warning; previews use safe text on opaque solid panels, keeping image backgrounds decorative. Warnings include words/ratios rather than color alone. Forms have labels, errors/statuses, keyboard controls and preserved focus treatment. Mobile members use wrapped rows, not overflowing desktop tables.

## BrandSnapshot preparation

`resolveBrandSnapshot` validates IDs, revision, name/config and returns a frozen transport-safe presentation object with frozen color pairs and an immutable revision reference. It performs no I/O and creates no events/session rows. Private asset IDs are references, not public delivery URLs. Phase 3 must deliberately define guest-safe immutable asset snapshots.

## Workspace audit events

Sensitive workspace/name/archive, invitations/revocation/acceptance, roles/removal, Brand creation/update/delete/default and board creation/copy/delete append operational events. Writes share action transactions. Ordinary update/delete is rejected; metadata excludes secrets and full board content. Owner/Admin activity uses keyset pages of 30. No compliance certification is claimed.

## API changes

[Architecture](ARCHITECTURE.md) lists every endpoint. New `/api/v1/workspaces` and `/:workspaceId` routes cover details/name/archive, members/roles, invitation issue/revoke, scoped boards/import/copy, Brand CRUD/default, image POST/GET/DELETE and bounded activity. `/api/v1/invitations/:token/accept` handles verified acceptance. `/api/v1/me` adds emailVerified. Phase 1 `/api/v1/boards*` remains deprecated personal-workspace compatibility. Better Auth exposes supported verification/resend/reset endpoints. Existing error envelopes, request IDs and no-store private JSON remain; image delivery uses private revalidation.

## Route changes

Canonical `/app/w/:workspaceId` descendants include host, Originals, Studio, Library, general workspace, members, Brand list/editor/preview, activity and account settings. `/app/workspaces/new` and `/app/invitations/:token` remain host-guarded. `/verify-email`, `/forgot-password` and `/reset-password` use public account presentation. Old `/app/*` opens personal space; earlier redirects preserve suffix/query/hash. Invalid/nonmember workspace pages share an unavailable state. Public marketing remains separate; players/live stage remain outside AppShell and membership guard. Settings/Brand previews do not connect sockets.

## Database migrations

Added `migrations/0002_workspaces_brand_kits.sql`, `meta/0002_snapshot.json` and journal entry. Existing Phase 1 SQL is preserved. Generated typed schema is in workspace-schema.ts and re-exported by schema.ts. No startup schema synchronization or deployment migration hook was added. `npm run db:generate` reports no schema drift.

## Indexes and constraints

Unique personal creator, membership pair, pending invitation email, token hash, kit/revision number, kit/revision identity, active default and workspace/import keys. Membership user and pair indexes support listing/authorization; workspace/update/ID supports active boards and kits; workspace/time/ID supports audit; workspace indexes bound assets/invitations. User/workspace/creator FKs are real. Personal immutability, owner retention, revision/history immutability and same-entity pointers have database enforcement. No speculative Events/billing indexes exist.

## Concurrency protections

Workspace locks serialize authorization with role/archive mutations. Cross-copy takes sorted locks. Board save retains row/base-revision checks and canonical no-op hashes; server authorship is authoritative. Brand save/default/delete and invitation acceptance are transactional. Import advisory/unique keys remain safe under retry. Browser saves serialize, retain in-flight edits and pause on conflicts/errors. Brand navigation warns about unsaved changes and supports export/latest recovery. Room-code allocation occurs after the authorized async board lookup.

## Security controls

Preserved signed HttpOnly sessions, revocation, exact Origin/Host and fetch metadata, no wildcard credentialed CORS, strict schemas/body limits and safe error envelopes. Email resend/reset are capped at five/minute/IP/category; organization creation five/minute/actor/IP, invite issue ten, acceptance twenty and uploads fifteen, alongside existing API limits. Denial logs are bounded and contain request/actor/code only; no secret URL/body/error object. Global no-referrer policy protects link-bearing account/invitation URLs. Asset processing/delivery and current membership prevent IDOR. Secrets remain server-only and ignored local files stay excluded from Docker.

## Files added

- Domain/server: `server/workspaces/{policy,service,audit}.ts`, `server/db/workspace-schema.ts`, `server/email/transport.ts`, `server/brand/{service,assets}.ts`, `server/api/workspaces.ts`.
- Shared: `shared/{workspaces,brand}.ts`.
- UI: `src/workspaces/{context,navigation,WorkspaceContext,WorkspacePages,WorkspaceMembers}` with .ts/.tsx extensions; `src/brand/{BrandPage,BrandFields,BrandPreview}.tsx`; `src/auth/{SecurityFlow,VerificationNotice}.tsx`; `src/styles/workspaces.css`.
- Migrations/metadata above; `tests/brand.test.ts`, `tests/integration/workspaces.test.ts`, `tests/browser/workspaces.spec.ts`.
- Documentation: this report, `PHASE-2-AUDIT.md`, `WORKSPACES.md`, `BRAND-KITS.md`.

## Files removed

No useful source, artwork, local boards, historical reports or portfolio assets were deleted. The obsolete workspace-coming-soon content was replaced by real routes. No engine/player-controller implementation was removed or rewritten.

## Files materially changed

Auth factory/config, product HTTP installer, board service/schema, narrow socket launch adapter/shared optional reference, cloud identity contract; host boundaries/routes/shell/dashboard/settings/import; repository/provider and Studio navigation/launch/recovery; existing host game links; factual marketing availability; additive styles. README/architecture/auth/database/deployment/vision/roadmap, environment example, Render configuration, verification helper, existing CI quality workflow, existing integration/browser fixtures/assertions, package/lock and migration journal were updated. See Git diff for the complete inventory. No remotes, commits, deployment, original demo checkout or production account data were changed.

## Dependencies added and justification

- `nodemailer@10.1.1`: maintained provider-neutral SMTP delivery with TLS and no vendor coupling.
- `sharp@0.35.5`: bounded server-side raster decode, validation, orientation, metadata stripping and re-encoding.
- Dev `@types/nodemailer@8.0.2`: transport types.

Existing Better Auth/Drizzle/pg/Zod compatibility remains. Server libraries never ship to browser bundles. npm audit reports zero vulnerabilities. No force/legacy-peer install was used.

## Environment variables added

EMAIL_TRANSPORT, EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD. Existing APP_ORIGIN remains the link authority; DATABASE_URL/AUTH_SECRET are unchanged server-only configuration. File/memory modes are impossible through production configuration. No real SMTP credentials were requested or committed.

## Exact commands executed

Local commands used `PATH="/opt/homebrew/bin:$PATH"` (Node 25.9.0); CI targets Node 22. Major commands:

```sh
npm install nodemailer sharp
npm install -D @types/nodemailer
npm install --save-exact nodemailer@10.1.1 sharp@0.35.5
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:test:prepare
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
node scripts/verification-app.mjs --compiled
PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e
TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test
npm audit --audit-level=low
```

Also ran targeted cloud/workspace browser passes, changed-file Prettier checks, `git diff --check`, safe aggregate database inspection and the compiled migration runner with DATABASE_URL explicitly set to TEST_DATABASE_URL in-process. Initial development-server browser attempts revealed outdated test matchers and rate/HMR interference; final verification uses compiled artifacts and isolated test services. An attempted offline npm pin found no cached registry metadata; the normal pinned install succeeded. No unexecuted Docker/CI/SMTP/deploy result is claimed.

## Exact test results

| Command/check                                                                      | Actual result                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                | PASS, client/shared and server                                                                               |
| `npm run lint`                                                                     | PASS, no errors or warnings                                                                                  |
| `npm test` without live origins                                                    | 22 passed, 3 intentional skips, 0 failed                                                                     |
| `TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test` | **25 passed, 0 skipped, 0 failed**, 123.2 seconds                                                            |
| `npm run test:integration`                                                         | **9 passed, 0 skipped, 0 failed**, about 2.3 seconds, real PostgreSQL                                        |
| `npm run build` and final `npm run build:server`                                   | PASS                                                                                                         |
| `PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e`                       | **14 passed, 0 failed**, 3.8 minutes, compiled app                                                           |
| Targeted cloud + workspace browser run after adding the legacy-recovery case       | **6 passed, 0 failed**, 1.3 minutes                                                                          |
| Final workspace browser run against the final compiled server                      | **1 passed, 0 failed**, 42.3 seconds, including organization-reference launch and account-free guest joining |
| Migration fixture/history comparison, repeated and compiled migrations             | PASS; actual PostgreSQL 18.4; zero orphan boards/bad personal counts                                         |
| `npm run db:generate`                                                              | No schema changes                                                                                            |
| Axe WCAG 2 A/AA and 2.1 AA                                                         | Zero violations on tested signup/dashboard/library/settings/Members/Brand screens                            |
| Responsive layouts/switcher/Brand preview                                          | No overflow at tested 320, 390, 768, 1024 and 1440px widths                                                  |
| Browser public/settings boundaries                                                 | Public pages avoid realtime/question banks; Brand previews open no Socket.IO connection                      |
| Bundle scan                                                                        | No SMTP/database/auth-server configuration or libraries in client assets                                     |
| `npm audit --audit-level=low` / pinned install audit                               | Zero vulnerabilities                                                                                         |
| Changed/new supported-file Prettier check and `git diff --check`                   | PASS                                                                                                         |

There are **15 distinct browser cases** after the new recovery test. The full 14-case run preceded that addition; the six-case targeted run covers the added case plus the affected cloud/workspace paths. The final one-case rerun checks the last server-only launch sanitization. This is not a claim of an unexecuted single 15-case command.

Integration coverage includes real verification/reset email capture, marker/token expiry/reuse, generic reset responses and revoked sessions; production cookie restoration; missing/unverified/incorrect roles; invitation acceptance races, revocation/expiry/email binding; final-owner races; shared revisions/authorship/stale conflicts; workspace-scoped imports/retirement/copy; private HTTP asset delivery/ETags and cross-workspace IDs; Brand no-ops/conflicts/default fallback/immutability; image byte/MIME/dimension rejection; and frozen readable snapshots. Existing gameplay tests cover every Original, bots, scoring, reconnect, room locks, rematch and authoritative custom-board behavior.

## Migration verification results

Real PostgreSQL 18.4 was used through the existing embedded local development cluster. Fresh Phase 1 fixture upgrade and exact history comparison pass; live test database aggregate inspection: orphan_boards=0, bad_personal_counts=0. Development/test schema upgrades, repeat migration and compiled runner succeed. Compose/CI PostgreSQL 18.6 and Docker execution were unavailable locally and were not run. No emulator/fake SQL database was substituted.

## Bundle/performance observations

Final client entry approximately 93.62 kB gzip versus Phase 1 92.97 kB. Workspace management (~3.91 kB gzip) and Brand UI (~6.07 kB gzip) remain lazy; realtime (~14.38 kB) and question library (~16.24 kB) remain separate. Brand pages do not load question banks or establish Socket.IO connections. Workspace listing is one bounded query (100 choices); members/kits/activity are paginated, board summaries remain lightweight and autosave does not refetch lists. Private image bytes load separately from workspace list/kit JSON. Workspace row serialization favors clear permission invariants over maximum mutation throughput; no real-time co-edit merge is promised.

## Accessibility results

Browser verification checks existing public/host/account surfaces plus Members and Brand at 320, 390, 768, 1024 and 1440 pixels. Axe uses WCAG 2 A/AA and 2.1 AA tags. All checked surfaces returned zero Axe violations; no tested layout overflow was found. Desktop/phone Brand screenshots were visually reviewed; existing typography, palette, card language and artwork remain. Derived foreground tests cover every grayscale value without changing selected colors.

## Known limitations

Rooms remain in memory. Brand preview is static and never publishes live event branding. There is no Events domain, session history, billing, entitlements, SSO, player account/progression or distributed state. Workspace picker/list is bounded to 100 choices; archived workspaces have no self-service restore. Brand manual drafts are in-memory until save (with export/navigation/unload warnings), while board drafts retain optional tab recovery. No browser cache guarantees durability before acknowledgement.

Assets remain low-volume PostgreSQL data with documented lifetime safeguards; historically referenced bytes persist, and retention/orphan cleanup tooling is not implemented. Email has no durable outbox; delivery/commit can rarely diverge. Rate limits are per process. No cloud object storage, public/tokenized guest assets, hosted SMTP/DNS/TLS/proxy, physical-phone/cellular, Docker image, PostgreSQL 18.6 or GitHub Actions execution was verified locally. Node 22 is configured for CI, while this local runtime was Node 25.9. No broad compliance/security certification is implied.

## Security gaps remaining before public release

Validate actual-domain SMTP delivery and SPF/DKIM/DMARC, TLS/proxy/cookie/device behavior, PostgreSQL network/TLS policy and backup restore. Establish retention/account deletion, abuse/delivery monitoring, dependency patch/secret rotation procedures and independent security review. Duplicate registration availability is not claimed enumeration-resistant. Plan operational asset retention and reliable delivery/outbox work before scale. No customer or employer data was used in samples.

## Recommended Phase 3

**Events & Experience Builder:** persistent workspace events, multi-game playlists, event-specific immutable Brand Kit/asset snapshots, event launch orchestration, reusable event templates and preparation for persistent session history. Define guest-safe immutable asset delivery before consuming private Brand assets. No Phase 3 implementation was begun.

The isolated verification app was stopped after checks. Local PostgreSQL remains running with the development/test migrations applied; use `npm run dev` to open development. Development email links are in private ignored `.local/mail` files.
