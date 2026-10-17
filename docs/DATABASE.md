# PostgreSQL and board persistence

## Development

`npm run setup:local` generates `.env` with random local database/auth secrets, a `ruckus_development` URL on loopback port 55432 and the local app origin. Existing `.env` files are preserved. No actual credentials belong in `.env.example` or source control.

`npm run db:up` starts Compose's pinned `postgres:18.6-alpine` service, restricted to loopback and a named `ruckus-postgres` volume. `npm run db:migrate` applies committed Drizzle migrations. `npm run db:down` stops the service and preserves the volume. To deliberately reset disposable development data, stop the app and use `docker compose down --volumes`, then start/migrate again; this deletes development accounts and cloud boards, so export anything needed first.

If Docker is unavailable, `npm run db:local` uses pinned `embedded-postgres@18.4.0-beta.17`, a real PostgreSQL 18.4 cluster in ignored `.local/postgres`, bound only to 127.0.0.1 with SCRAM password auth. Leave that process running while migrating/using the app. This optional binary is older than the Compose/CI minor release and is not a production database distribution. Do not run Compose and the fallback on the same port. Removing `.local/postgres` deliberately resets only that development cluster after stopping it.

Use a currently patched supported PostgreSQL service for production, protected networking/TLS appropriate to the provider, backups and tested restores. No production database is provisioned here. PostgreSQL major versions have a [defined support policy](https://www.postgresql.org/support/versioning/).

## Migrations and schema

- `migrations/0000_host_cloud_foundation.sql`: generated auth tables and board/revision tables, FKs, constraints and access-path indexes.
- `migrations/0001_revision_invariants.sql`: deferred same-board current-revision FK, immutable revision trigger, normalized-email constraint and document identity constraint.
- `migrations/meta/*`: Drizzle migration journal/snapshots.
- `server/db/auth-schema.ts`: generated using the pinned Better Auth CLI, with timezone-aware timestamps. Do not casually rename its supported fields.
- `server/db/schema.ts`: typed board model; timestamps are UTC instants.

`npm run db:generate` generates reviewable SQL from schema changes. Use custom migrations for invariants like triggers and deferred constraints. Commit the SQL and journal together. `db:migrate` applies migrations explicitly, including in CI; application startup never auto-syncs or changes tables. Do not use `drizzle-kit push` as a release strategy.

Better Auth owns `user`, `session`, `account` and `verification`. Password hashes live only in the library's supported account schema; session cookies refer to revocable session rows. Normalized emails are unique.

`boards` stores a UUID identity, workspace ownership and creator provenance, list metadata, draft/ready status, schema version, a non-null current revision, optional import key, creation/update times and soft-deletion time. A workspace/import-key unique index makes retries safe; an active workspace/update/ID index supports keyset pagination.

`board_revisions` stores UUID revision identity, board FK, consecutive revision number, validated draft JSONB, stable server hash, creating-user FK, source and timestamp. `(board_id, revision_number)` is unique. The current revision FK references `(board_id, id)` and is deferred until transaction commit, so creation inserts the stable row and revision 1 atomically without a null intermediate pointer. A database trigger rejects ordinary revision updates/deletes. Normal deletion soft-deletes the board and leaves revisions intact.

Draft persistence uses the shared board schema plus unique question IDs/consecutive order. Incomplete questions/titles can be saved. Launch/export still use the existing completeness rules. The schema version remains 1. A board is a versioned document; questions and answer options are not prematurely normalized.

## Operations

`server/boards/service.ts` owns queries and transactions. Every operation resolves session-derived workspace membership and scopes by workspace ID. Nonmembers and missing workspaces receive the same unavailable response; missing/cross-workspace boards receive board-not-found. Lists return summaries only, default 30/max 50, ordered by update time/UUID with validated keyset cursors; question payloads are fetched only when needed.

Create and update are transactions. Updates lock the owned board row and compare the caller's base revision before inserting anything. Stale saves return `BOARD_CONFLICT`/409 with safe revision metadata; there is no last-write-wins fallback. Identical content avoids an extra revision through a SHA-256 canonical content hash excluding server-owned identity/timestamps. Server-assigned ownership, IDs and timestamps cannot be supplied as authority by the browser.

Import keys are unique within a workspace, protected by a transaction-scoped advisory lock for concurrent first imports. Retrying returns the already committed board. Deleted imports are reported as retired rather than silently restored. The same user may explicitly import into two writable workspaces. Validation failures are isolated per board; unexpected database failures remain generic and safely retryable.

## Isolated tests

`npm run db:test:prepare` requires a loopback `ruckus_development` cluster, creates a separate `ruckus_test` database if absent, writes its URL to ignored `.env.test` and applies migrations. It does not truncate development data. `npm run test:integration` requires explicit `TEST_DATABASE_URL`; tests reject production mode, non-local/non-CI hosts and database names outside the `ruckus_test` convention. Tests create unique accounts and content rather than resetting an arbitrary database.

CI supplies PostgreSQL 18.6 and the same explicit test URL. It does not use production secrets or deploy anything. CI execution is separate from local verification; see the Phase 1 report for actual runs.

## Workspace and Brand ownership

`0002_workspaces_brand_kits.sql` transactionally creates workspace, membership, invitation, audit, Brand Kit/revision and asset tables; renames boards.owner_user_id to creator provenance; creates personal workspaces/owner membership for every existing user; backfills workspace_id; then adds non-null/FK constraints and workspace indexes. It never rewrites board revisions, JSON, timestamps or deletion state. A realistic Phase 1 fixture tests both active/deleted boards and multiple revisions. Migration failure rolls back rather than orphaning boards. Drizzle's journal makes re-running migrations safe. No auto-sync is used.

A user-insert trigger creates personal workspace and membership atomically. Personal identity/membership and archive constraints prevent transfer/removal. Membership changes lock the workspace; deferred owner constraints reject ownerless commits. Membership (workspace,user) is unique with a user listing index. Active boards index (workspace,updated_at,id); import keys are unique per workspace, including retired imports. Workspaces and revisions have real foreign keys.

Brand current pointers reference same-kit immutable revisions. A partial unique index permits one active default per workspace. Workspace/update/id supports lists. Invitations index workspace/time, pending workspace/email uniqueness and hashed-token lookup. Audit uses workspace/time/id keyset index and rejects updates/deletes. Small assets are bytea through BrandAssetStore, indexed by workspace with real creator/workspace FKs and byte/dimension/type checks. Ordinary deletes retain immutable history; unused images can be retired, historically referenced images cannot be deleted.

`server/db/workspace-schema.ts` holds new typed domains; `server/db/schema.ts` re-exports them. Database row locks serialize mutation authorization with membership/archive changes; cross-workspace copy locks workspace IDs in deterministic order. These are single PostgreSQL transactions, not client-side locks. Technical caps and storage retention are described in WORKSPACES.md and BRAND-KITS.md. Phase 2 did not add Events tables; Phase 3 adds the domains below. No billing or persisted gameplay answers were added.

## Event persistence — Phase 3

`0003_events_experience_builder.sql` is additive. It creates events, immutable event_revisions, immutable event_launch_snapshots and immutable event_snapshot_assets. Existing board/auth/workspace/Brand rows are not rewritten. Event current pointers use a deferred same-event FK; launch revision pointers also enforce same-event identity. Creator/workspace/source-asset relationships are real FKs. Revisions have positive per-event unique numbers. Assets enforce WebP/kind/byte-length constraints; copied bytes survive source retirement. Lists index active workspace/update/UUID; launch snapshots index event/time; assets index snapshot UUID.

`server/db/event-schema.ts` supplies typed data access and is re-exported by schema.ts. EventService owns workspace-locked optimistic/no-op saves, transactional source resolution/copy and launch writes. The service stores resolved Original prompts and full validated Studio content only at launch. No runtime auto-sync, high-frequency answer writes or deployment migration hook exists. Launch identity is future history preparation, not persisted live recovery. Guest image retention and operational caveats are in EVENTS.md.

## Phase 4 content foundation

Phase 4 migration `0004_adorable_eternity.sql` adds content_packs/content_pack_revisions with owner/workspace consistency, active discovery indexes, same-pack deferred current pointer and immutable revision trigger. Existing board, Brand, Event and launch-history rows remain unchanged. Explicit `content:seed` follows reviewed migrations; readiness requires all six default packs. See [content platform](CONTENT-PLATFORM.md) for schema and release workflow.

## Session History — Phase 5

Additive `0005_broad_terrax.sql` creates session_runs, session_segments and session_participants, workspace/nullable-host FKs, bounds, access-path indexes and result UPDATE protection. `0006_dark_vindicator.sql` raises aggregate segment attendance to the existing 50-question × 30-player ceiling while detail arrays stay capped at 300. `0007_goofy_lily_hollister.sql` adds nullable final_order so shared Event ranks retain exact live display order. Generated filenames and already-applied history are retained. The nullable field also leaves earlier local development fixtures explicitly without inferred order; no fake result backfill is performed.

`server/db/history-schema.ts` is re-exported by schema.ts. The run UUID is its idempotency key; a canonical hash rejects mismatched retries. One transaction writes run/children/safe audit. Source IDs are frozen provenance without source-content FKs; source deletion must not remove results. Workspace deletion cascades history children; host attribution can become null. Results reject updates; DELETE remains available to future reviewed retention tooling. Existing cross-domain deletion constraints still need a product deletion policy.

Indexes cover workspace/start/UUID, workspace/type/start/UUID, workspace/Event/date, unique run/sequence, game/run and run/rank. Detail arrays/results are bounded, no raw creative inputs persist, and no high-frequency gameplay query is added. Migrations run explicitly; readiness requires the history table. See [model/failure/retention policy](SESSION-HISTORY.md) and [analytics query semantics](ANALYTICS.md).

## Phase 6 durable completion

`0008_history_outbox_reliability.sql` adds only `session_history_outbox` and minimal `session_history_receipts`, with workspace/receipt FKs, bounded payload/status/attempt checks and pending/lease/retention/workspace indexes. No historical recap backfill or applied migration rewrite. A receipt retains only run/workspace UUID, hash, creation and optional deletion time; queue payload is removed on committed materialization. See [retention](RETENTION.md) for completed/failed cleanup and why receipts survive it.

Application pool uses ten connections, 5s connection/statement, 3s lock, 10s idle transaction and 15s total transaction bounds. Readiness has one additional short-timeout connection. Acquired-client errors are handled as well as idle-pool errors. Queue/materialization transactions explicitly use synchronous_commit=on; fsync must remain enabled. Migrations have separate 120s statement/transaction and 10s lock bounds, explicit advisory serialization and required-journal/hash checks. Startup never migrates. Preserve SQL/journal history; the documented exact legacy Phase 2 hash/catalog attestation does not rewrite it. [Migration/recovery runbook](PRODUCTION-RUNBOOK.md).

Workspace/account hard deletion remains blocked by other domains' FKs/immutability/ownership policies. History/outbox cascade declarations alone are not a purge implementation. [Full dependency map](RETENTION.md).
