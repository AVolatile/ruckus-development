# Phase 5 pre-implementation audit

Audited October 16, 2026, clean `feat/phase-5-session-history-analytics` at `07c96d1`. Reviewed Phase 3/4/4.5 reports, Event runtime, architecture, database and product vision; Room/EventRuntime, socket launch/cleanup, board/pack/Event/Brand snapshots, workspace policy/audit, host shell and existing summary CSV.

## Authoritative data and safe boundary

`Room` owns scores, eligible round membership, accepted entries/votes and final player order. Its current per-board summary contains question prompts: that payload must not be stored wholesale. Creative entries contain text/drawings and are deliberately excluded. Round closure can accumulate counts, correct choices, votes and score deltas in bounded memory. No analytics query or write belongs in a timer, submit or reconnect path.

A standalone playlist keeps cumulative scores. Its Scoreboard sorts descending with stable insertion order and displays sequential places, including equal scores. EventRuntime resets scores by replacing the inner Room, awards placement points once at GAME_RESULTS, and displays competition ranks on equal aggregate totals (UUID only orders equal totals). History must preserve both policies, not unify or recalculate them on retrieval. Entirely scoreless Studio boards and Events without an aggregate leaderboard require participation recaps, not invented standings.

Capture per-game summaries before Room changes game or EventRuntime replaces its inner engine. Finalize standalone at final/explicit end; Event at EVENT_FINAL/early end. Freeze synchronously, write asynchronously through one idempotent finalizer. Rematch gets a new run UUID even though code, players and host capability remain. Refresh/resume/duplicate END/cleanup cannot create another outcome. Qualify only after at least one round closes; lobbies and unfinished first questions produce no history. Host/cleanup ending qualified gameplay is `ended_early`; normal finale is `completed`. Do not infer abandonment, crash recovery or an error status from missing evidence.

## Sources and compatibility

Event launch already freezes Event/revision/workspace/actor, ordered board and pack revisions, Brand configuration and guest assets. Persist only Brand identity/colors, never image bytes/URLs or the entire launch document. Standalone pack resolution already returns exact PackReference. Board launch currently returns only document; add an authorized atomic launch-result method retaining revision identity, preserving existing callers. Portable raw boards have no verified cloud provenance and must be labelled accordingly. Missing standalone workspace reference resolves to the authenticated actor's personal workspace; ordinary guest joins remain account-free.

Historical source UUIDs are immutable provenance, independent of source foreign keys, so future hard deletion does not destroy a recap or require rewriting it. Store frozen labels, source versions and outcomes directly. Derive SQL usage totals, duration averages and chart buckets later. Do not backfill from past launch snapshots, audit rows or old rooms.

## Model and bounds

Use run metadata, ordered segment rows with bounded participant-result JSON, and session-local participant rows. Fresh historical participant UUIDs replace runtime identity. No cross-session linking. Track removed players as attendance but exclude them from the terminal leaderboard, matching runtime; disconnected players retain their authoritative results. Distinguish demo attendances. Bound retained attendee details and disclose truncation; joined totals remain counts, never unique-person estimates. Bound segments by the existing playlist limits and validate all summary objects before persistence.

One transaction inserts an immutable run, children and safe operational audit event. Unique UUID/idempotency plus canonical hash makes retry safe and rejects conflicting finalizations. UPDATE triggers protect results; DELETE remains available to future reviewed workspace retention tooling with child cascades. Host account FK can become null; workspace FK cascades. No historical edit or deletion UI is required now.

## API, presentation and operational limits

Current workspace policy is the authorization boundary. Owner/Admin/Host/Viewer read History/Analytics; players get no history API. Lists use metadata and keyset pages, detail uses bounded queries, analytics aggregates in PostgreSQL. Attendance means session-local entries, never unique people across runs. Date ranges are UTC, validated, with 7/30/90/all-time presets. CSV must escape spreadsheet formula prefixes as existing export does.

Add one History nav entry with Sessions/Analytics tabs; redirect the old analytics placeholder. Preserve restored Library/Originals/Packs/Studio/Event/Brand compositions. Recaps use game identity, ordered run-of-show and actual standings; analytics uses one editorial number/activity strip/ordered lineup, not a KPI grid. Empty workspaces contain no seeded sample analytics.

Retries must be bounded, logged with safe IDs only, survive room disposal while process lives, and never claim durability before commit. There is no durable outbox: process exit before commit can lose history. Live rooms remain in memory; this work cannot restore them after restart. User server 4310 and local PostgreSQL 55432 remain independent of isolated verification.
