# Session History

History is a workspace library of frozen outcomes. It does not save or restore a live Room. Open `/app/w/:workspaceId/history`; the adjacent Analytics tab summarizes actual recorded sessions. Owner, Admin, Host and Viewer can read both through current server-checked membership. Ordinary players have no history endpoint or account requirement.

## Collection policy

Collection begins with Phase 5. There is no fabricated backfill from launch snapshots, audit events or old rooms.

A run qualifies after at least one round has closed in the authoritative engine. Merely opening a lobby, starting an intro, or ending an unfinished first question produces no history. Round outcomes include surviving submissions/votes at closure; unfinished questions and creative artifacts are not archived. Host-skipped collection still counts as a closed round, including a round with no responses. This is a lifecycle policy, not a claim about how much guests enjoyed playing.

Standalone `final` and Event `EVENT_FINAL` produce `completed`. Explicit end, five-minute host-loss cleanup, inactivity cleanup or orderly server shutdown before the finale produce `ended_early`, if qualified. A finale reached after intentionally skipping future Event items is still completed; only actually played segments appear, with original sequence positions preserved. No speculative abandoned/errored/crash classifications are recorded. An abrupt process exit cannot report its unobserved results.

The run UUID is independent of its five-character room label. Standalone rematches receive a fresh UUID. Event launch UUID identifies its one run. Refresh, reconnect, duplicate END and cleanup reuse the same finalized identity. Existing host/player capabilities remain memory-only authorization for live controls.

## Runtime boundary

`RoomOutcomes` collects bounded counters in memory when the existing Room publishes state. It never queries PostgreSQL and never retains an input, prompt, stroke, token, socket or network address. Round closure aggregates score deltas, eligibility, submissions, game-defined correct/majority responses and votes. Room Temperature labels those outcomes as majority responses, not objective correctness. EventRuntime keeps each inner engine's counters before replacing it, alongside the existing separately authoritative Event placement totals.

The socket adapter freezes and validates a `SessionSummary` once at the terminal boundary. Phase 6 replaces direct process-local history writes with a narrow PostgreSQL outbox. The bounded memory queue now retries **durable enqueue**, and the finale remains immediate. Before that short transaction commits a crash/outage can still lose an unconfirmed summary. `pending` means durable handoff, `saved` means committed recap, and failures never claim success.

A database worker claims with fenced sixty-second leases, bounded concurrency and eight persisted attempts. Startup automatically recovers pending/expired work. Recap, children, completion audit and queue acknowledgement commit atomically; duplicate/hash mismatches cannot rewrite history. Payload is compacted at completion, and a minimal receipt prevents recreation after deletion or terminal retirement. Local host callbacks and a bounded terminal-only observation query keep acknowledgement truthful even if a second process materializes the job. No database read/write enters answer, timer, vote or reconnect handling.

Only host snapshots receive `{status, sessionId, workspaceId}`. Saving/Check recap remains available while materialization is pending; unreadable pending recaps offer retry. State dispatch still checks exact current Room identity and recipient capabilities, and expiry retires identities/channels before code reuse. SIGTERM prioritizes enqueue/in-flight work within a configured deadline; committed pending work survives process exit, live rooms do not.

See [Reliability](RELIABILITY.md) for queue/transaction/shutdown limits and [Runbook](PRODUCTION-RUNBOOK.md) for recovery. This supersedes Phase 5's memory-only retry boundary without changing its collection/scoring rules.

## Model

- `session_runs`: stable UUID/idempotency key, workspace/optional actor FK, historical code, type/title, frozen source/Brand metadata, start/end/wall duration, joined/completed/demo/omitted counts, played segment count, bounded terminal status, summary launch format 1, hash and creation time.
- `session_segments`: run FK, unique original sequence, Original/Studio type, frozen title and source references, timing, completed/scored flags, round/participant/submission/vote counts and bounded participant-result JSON. The document contains aggregate numbers, never answers or drawings.
- `session_participants`: fresh session-local UUID, display name/avatar/demo flag, first observed join instant, completion, final score/rank/**display order**, and participated/completed segment counts. Display order preserves the live Event row order even where ranks tie. No runtime player ID is stored. Participant UUID derivation is salted by the new run UUID; it cannot join a person across runs.

At most 300 attendee detail rows and 300 participant results per segment are retained. The current terminal roster is prioritized if removed-player turnover exceeds that bound. Totals remain separate: a tested 350-entry poll retains 300 details, reports 50 omitted, and still counts 350 attendances/submissions. A segment's eligible count is bounded by the existing 50-question × 30-player ceiling (1,500), even with turnover. An entire validated summary is capped at 2 MB and 50 segments. A scalar safety bound is 1,000,000 for counts/duration. These are technical safeguards, not paid-plan limits.

`completed` for a participant means eligible in at least one played segment and still in the roster at a normal finale. It does not infer physical presence from connectivity. Disconnected players retain earned results; removed players remain attendance outside the terminal leaderboard. Partial run standings are current points at early end, not a completed Event award for an interrupted game. Segment scores are score deltas for that segment; standalone cumulative final scores are saved separately.

## Scoring and source snapshots

Standalone places match the current Scoreboard: descending score, stable order, sequential displayed places. Equal scores still share the top score/crown. Event final ranks use competition ties; equal totals share rank while a separate final order preserves the original UUID-based display sequence. Read endpoints do not recompute scores or placements.

Wholly unscored Studio/polls have null final scores and ranks. Event totals are recorded whenever accumulation is enabled and a scored round exists. Hiding the live finale leaderboard changes presentation, never the earned totals retained for authenticated recap readers. With accumulation disabled or no scored rounds, the recap presents participation; played scored segments still retain their real raw outcomes. An interrupted scored segment does not earn new Event placement points.

Authorized standalone board launch now returns document and revision together under the existing workspace lock. Standalone pack resolution already returns exact PackReference. Portable raw boards have no verified cloud identity and are labelled accordingly. Unscoped legacy launches belong to the authenticated host's personal workspace; supplied workspace references remain independently authorized.

Event source metadata pins Event revision, ordered board/pack revisions, and Brand Kit/revision/display identity/colors. History excludes full launch documents and private asset bytes/URLs. Source UUIDs are provenance, not ownership FKs into mutable content. A recap uses its stored names and survives source edits, archive and future source deletion. Open current source checks current access/availability and opens its current preview; it never silently launches an old frozen revision.

## API and export

All routes use the existing session guard, exact application Host policy, rate limits, safe error envelopes/request IDs and no-store private responses:

- `GET /api/v1/workspaces/:workspaceId/sessions`: metadata only; default 30, maximum 50; descending `(started_at,id)` keyset cursor. Filters: `range=7|30|90|all`, `type=original|studio|event`, `game`, `eventId`, optional ISO `from` / inclusive `to` dates.
- `GET /api/v1/workspaces/:workspaceId/sessions/:sessionId`: one run plus bounded ordered segments and participants, no N+1 content fetches. Actor identity/hash are not returned. Cross-workspace and missing session IDs share the same recap-unavailable error.
- `GET /api/v1/workspaces/:workspaceId/analytics/summary`: [SQL usage aggregates](ANALYTICS.md).

The API's default range is 30 days; the Sessions UI explicitly requests all time, Analytics 30 days. Dates are UTC. If only an end date is supplied with a preset, that end date anchors the preset. From/through dates override their respective bounds; reversed explicit dates receive validation feedback.

Recap CSV exports session metadata, frozen revision references, final standings and ordered segment counts. It includes display names/demo labels and protects quoted cells against formula prefixes, including leading whitespace. No player search, workspace bulk export or raw creative export was added.

## Privacy and retention

Display names and avatars are session-local user content. A returning display name counts again as a separate attendance; this system cannot identify a returning person. No player email, IP, geolocation, fingerprint, device identifier, capability, auth token, cookie or creative text/drawing is stored in these tables. Existing account/session data remains in its existing separate authentication domain.

History is immutable through product APIs and database UPDATE triggers. DELETE is deliberately permitted to the reviewed Phase 6 deletion service: deleting a run cascades to its children, and the workspace FK has ON DELETE CASCADE. The host FK has ON DELETE SET NULL; its narrow trigger exception permits removing attribution without rewriting outcomes. Source deletion does not affect a recap. The schema does not itself implement workspace/account deletion: other domains, audit records and legal/operational policy must be handled before exposing such a flow. Operational audit deletion remains a separate existing policy.

Phase 6 adds confirmed individual deletion and bounded outbox retention. Full workspace/account erasure and time-based history expiry are not implemented. Agree on retention/access expectations before confidential or employee-data pilots. This is usage history, never an employee assessment or a compliance certification.

## Phase 6 deletion and retention

Owner/Admin may call DELETE on the individual session path with `{ "confirm": "delete" }`; UI requires typing DELETE. The transaction removes the run and children, retires any queued job/receipt and writes one minimal `session.history_deleted` activity event. Analytics uses only remaining history. Source content is unaffected. Host/Viewer retain read-only history access. See [Retention](RETENTION.md) for queue intervals, backup copies and the explicit blockers to workspace/account erasure.
