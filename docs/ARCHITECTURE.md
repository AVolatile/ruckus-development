# Ruckus architecture — Phase 5

Public marketing/account routes remain separate from host tools and guest capability routes. `/app` requires a server session. `/app/w/:workspaceId/...` additionally resolves an active membership before rendering a workspace-scoped repository and the existing AppShell/Studio. Compatibility `/app/*` and Phase 0 redirects preserve suffix/query/hash and deterministically open the personal workspace. Invitations resume through validated app-only login/signup return paths. Account forms and workspace settings remain lazy; public routes avoid question banks and realtime connections.

Better Auth owns credentials, cookies, verification signatures/expiry, password recovery and revocable sessions. `/api/v1/me` returns minimal identity including emailVerified. `server/email` supplies SMTP, guarded development files and in-memory test capture. See [authentication](AUTHENTICATION.md).

`server/workspaces/policy.ts` resolves session-derived actor membership and a central capability policy. Organization creation/invitation/acceptance also require verified email. Every board, Brand, asset, member and activity endpoint enforces this independently. Workspace identifiers and hidden controls never grant access. Workspace row locks serialize role/archive changes with content mutations; deferred database triggers preserve owner/personal invariants. See [roles and invitations](WORKSPACES.md).

`boards.workspace_id` is the ownership boundary; `created_by_user_id` is provenance. Phase 2 backfills all Phase 1 boards to their original creator's personal workspace. UUIDs, revision IDs, pointers, hashes, authorship, JSON content, timestamps, soft deletion and import keys remain unchanged. Board revisions retain same-board deferred FKs, immutable triggers, row-locked base-revision comparisons and no-op hashes. [Database details](DATABASE.md).

`CloudBoardRepository` operates in one validated workspace. There is one Studio editor and one 750ms serialized autosave coordinator for personal/shared boards. Pending edits, in-flight changes, explicit flush, conflict export/latest recovery and account/workspace/board-scoped tab recovery remain intact. Local storage is only a legacy import/recovery boundary; `ruckus-studio-v1` is unchanged. Import defaults to personal space with explicit writable target selection. Copy requires source read and target create and starts a new identity/history.

Brand Kits have stable workspace ownership and immutable revisions; private raster assets live behind `BrandAssetStore`. A pure validated frozen BrandSnapshot resolver feeds immutable Event launch presentation. [Brand and asset details](BRAND-KITS.md). Selected customer colors never change the dashboard.

SessionRoutes retains lazy PartyProvider continuity into live stages. It connects only on host setup/join/live routes or explicit launch, never settings/Brand previews. Cloud board launch optionally sends `{workspaceId, boardId}` to `room:create`; the socket adapter checks membership/launch capability and reads authorized content before passing a validated snapshot to the existing engine. Legacy authenticated raw-board launch remains available for portable content. All subsequent room authority uses unchanged host/player capabilities. Guests need neither accounts nor membership. The engine, scoring, player controller, bots, rematches, reconnect and QR join flow remain independent of workspace data. Rooms remain in memory.

## Live audio presentation

`RoomView.audio` normalizes standalone and Event semantic cues with a stable room identity, sequence, stage/profile and authoritative elapsed/remaining timing. It contains no filenames/private answers. A lazy live-route AudioProvider delegates to one per-tab engine, independent music/SFX/UI/master buses, bounded cached decoding and room-scoped baseline/deduplication. Hosts own the soundtrack; phones only play quiet local/acknowledged feedback. Existing gameplay timers and access boundaries remain authoritative. Public, account, Studio and Event editor/preview surfaces fetch no audio; account settings only load preference controls. Production serves hashed `/audio` files with immutable caching.

The original sample-free procedural pack is included as a pre-release reference with human listening pending. Preferences are versioned local data, account-scoped for hosts where available and device-scoped for players; they grant no authorization and add no database model. [Audio architecture](AUDIO-ARCHITECTURE.md) · [Sonic design](SONIC-DESIGN.md) · [Provenance](../audio/ASSET-PROVENANCE.md).

## Product API

All below use `/api/v1`, safe errors/correlation IDs, bounded input, exact Origin/Host protection, server sessions and current workspace permissions.

| Path                                                          | Operations                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `/me`                                                         | GET minimal host identity                                    |
| `/workspaces`                                                 | GET bounded memberships; POST verified organization creation |
| `/workspaces/:workspaceId`                                    | GET current role/capabilities; PATCH name                    |
| `/workspaces/:workspaceId/archive`                            | POST owner-only archive                                      |
| `/workspaces/:workspaceId/members`                            | GET bounded joined members                                   |
| `/workspaces/:workspaceId/members/:userId`                    | PATCH role; DELETE removal/leave                             |
| `/workspaces/:workspaceId/invitations`                        | GET pending; POST verified invite                            |
| `/workspaces/:workspaceId/invitations/:invitationId`          | DELETE revoke                                                |
| `/invitations/:token/accept`                                  | POST verified matching-email acceptance                      |
| `/workspaces/:workspaceId/boards`                             | GET summaries/keyset pages; POST atomic create               |
| `/workspaces/:workspaceId/boards/import`                      | POST bounded idempotent imports/per-item results             |
| `/workspaces/:workspaceId/boards/:boardId`                    | GET document; PUT base-revision save; DELETE soft-delete     |
| `/workspaces/:workspaceId/boards/:boardId/copy`               | POST copy to authorized target workspace                     |
| `/workspaces/:workspaceId/brand-kits`                         | GET bounded kits; POST create                                |
| `/workspaces/:workspaceId/brand-kits/:brandKitId`             | GET; PUT base-revision save; DELETE soft-delete              |
| `/workspaces/:workspaceId/brand-kits/:brandKitId/default`     | POST change default                                          |
| `/workspaces/:workspaceId/brand-assets?kind=logo\|background` | POST bounded image bytes with exact supported MIME           |
| `/workspaces/:workspaceId/brand-assets/:assetId`              | GET private bytes/ETag; DELETE unused asset                  |
| `/workspaces/:workspaceId/activity`                           | GET bounded keyset audit pages                               |
| `/boards*`                                                    | Deprecated Phase 1 compatibility, personal workspace only    |

`/api/auth/*` retains Better Auth routes including send-verification-email, verify-email, request-password-reset and reset-password. `/ready` checks database/schema separately from existing liveness. No credentials, invitation links, token values, uploaded bytes or board documents enter routine logs. No wildcard credentialed CORS or third-party cookie topology is added. Use the combined same-origin Node service; no deployment occurred.

## Events and live orchestration

[Events](EVENTS.md) describes workspace definitions, immutable revisions, readiness and launch. [EventRuntime](EVENT-RUNTIME.md) wraps existing Room engines with stable room/player capabilities, explicit lifecycle states, placement points and typed semantic cue context. Frozen Original prompts and Studio/Brand revisions protect active events from edits. Snapshot image bytes are separate bearer assets gated by active in-memory room availability; private workspace asset routes remain session-protected. Event settings/preview create no realtime connection.

Workspace API adds `/workspaces/:workspaceId/events` (GET keyset summaries, POST), `/events/templates` (GET), `/events/validate` (POST read-only readiness), `/events/:eventId` (GET/PUT base revision), and POST suffixes `/archive`, `/copy`, `/launch`. Guest GET `/event-assets/:assetId` returns only an immutable attached image while its Event room is available. This route precedes the account guard but retains request IDs, bounded per-IP access and production Host checks. Development additionally allows the current machine’s actual interface addresses on the configured port for guest images only.

Canonical host routes: `/app/w/:workspaceId/events`, `/events/new`, `/events/:eventId`, `/events/:eventId/preview`. Existing `/app/events` redirects into personal space. No account requirement is added to joining or guest controllers.

## Phase 4 content foundation

Phase 4 adds the [content platform](CONTENT-PLATFORM.md): authenticated system/private pack catalogs, strict six-game documents, immutable revisions and explicit seeds. Standalone and Event launch copy exact revisions before room creation; the runtime performs no pack queries. Canonical host routes are `/app/w/:workspaceId/content-packs`, `/new`, `/:packId` and `/:packId/edit`. Library and Original details link into this surface. Public/player routes remain separate.

## Host presentation boundary

Phase 4.5 adds `PageHeader`, `StatusBadge` and acknowledged route `ActionNotice` composition with a host-only CSS token layer. The existing repository, autosave, permission, auth, socket and gameplay boundaries are unchanged. Local import is collapsed by default; its account-scoped tab dismissal preserves backup/import recovery in Settings. Direct Packs navigation and active workspace tabs improve route identity. See the [host design system](HOST-DESIGN-SYSTEM.md) for tokens, component contracts and reproducible rendered QA.

## Completion history boundary — Phase 5

`RoomOutcomes` keeps bounded in-memory aggregate counters beside the authoritative engine. EventRuntime retains them before replacing inner Rooms. The terminal socket adapter validates/freezes a summary once, then SessionFinalizer writes asynchronously through SessionHistoryService. A run UUID plus hash and one transaction protect retries; database failure cannot delay a gameplay acknowledgement or final screen. No per-answer, timer, heartbeat, creative-input or reconnect write is added.

History uses run, segment and session-local participant tables, immutable results, source-independent frozen metadata and retention-capable child cascades. Standalone rematches get new identities; Event launch UUID identifies its run. Host-only persistence status distinguishes saving, committed and failed. `server/broadcast.ts` validates the current room instance and existing recipient capabilities; expiry retires subscriptions/identities before a code can be reused. Delayed completion callbacks cannot revive an expired room or reach a replacement. [History architecture/privacy/failure policy](SESSION-HISTORY.md).

Added authenticated GET `/workspaces/:workspaceId/sessions`, `/sessions/:sessionId` and `/analytics/summary` beneath `/api/v1`. `history.read` and `analytics.read` belong to all four workspace roles; membership remains independently checked. Lists are metadata-only keyset pages, recap children are bounded, and analytics uses PostgreSQL aggregates. No player history route exists.

Host routes are `/app/w/:workspaceId/history`, `/history/:sessionId` and `/history/analytics`. One History shell item contains Sessions/Analytics tabs; old `/app/analytics` resolves to real personal-workspace analytics. History CSS and route components remain lazy. Original 4.5B compositions are preserved; the new pages use chronological, outcome and editorial-usage archetypes. Human art-direction approval is pending.

## Phase 6 reliability boundary

`server/history/outbox.ts` owns durable validated enqueue, receipt/hash checking, fenced claims, retry/retention and bounded terminal-status reads. `worker.ts` owns bounded scheduling; `SessionHistoryService.finalize` can participate in its transaction so result/audit/queue completion are atomic. The runtime's bounded `SessionFinalizer` now queues short durable handoffs, with no database dependency in live timing. Current-room callbacks and periodic pending-terminal reconciliation match run identities, never display codes. No distributed room engine or generic job bus is added.

`server/ops` contains startup config, lifecycle state, readiness, trusted socket address policy, safe logs/metrics and operator history CLI. `server/start.ts` catches startup failures without dumping configuration. `/healthz` is process-only; `/readyz` checks critical DB/schema/default-content/durability and drain state. Legacy probes remain aliases. SIGUSR2 drains; SIGTERM/SIGINT stop idempotently with a configurable deadline. Socket mutations stop at shutdown; active play/reconnect continue during drain.

DELETE `/api/v1/workspaces/:workspaceId/sessions/:sessionId` requires current `history.delete` (Owner/Admin), explicit confirmation and existing Origin/session safeguards. Run/children/job removal, minimal receipt tombstone and `session.history_deleted` audit commit together. No player write or operational metrics endpoint exists. [Reliability](RELIABILITY.md) · [Retention/dependency map](RETENTION.md) · [Observability](OBSERVABILITY.md) · [Runbook](PRODUCTION-RUNBOOK.md).
