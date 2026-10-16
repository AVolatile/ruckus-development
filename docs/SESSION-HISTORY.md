# Session History

History is a workspace library of frozen outcomes. It does not save or restore a live Room. Open `/app/w/:workspaceId/history`; the adjacent Analytics tab summarizes actual recorded sessions. Owner, Admin, Host and Viewer can read both through current server-checked membership. Ordinary players have no history endpoint or account requirement.

## Collection policy

Collection begins with Phase 5. There is no fabricated backfill from launch snapshots, audit events or old rooms.

A run qualifies after at least one round has closed in the authoritative engine. Merely opening a lobby, starting an intro, or ending an unfinished first question produces no history. Round outcomes include surviving submissions/votes at closure; unfinished questions and creative artifacts are not archived. Host-skipped collection still counts as a closed round, including a round with no responses. This is a lifecycle policy, not a claim about how much guests enjoyed playing.

Standalone `final` and Event `EVENT_FINAL` produce `completed`. Explicit end, five-minute host-loss cleanup, inactivity cleanup or orderly server shutdown before the finale produce `ended_early`, if qualified. A finale reached after intentionally skipping future Event items is still completed; only actually played segments appear, with original sequence positions preserved. No speculative abandoned/errored/crash classifications are recorded. An abrupt process exit cannot report its unobserved results.

The run UUID is independent of its five-character room label. Standalone rematches receive a fresh UUID. Event launch UUID identifies its one run. Refresh, reconnect, duplicate END and cleanup reuse the same finalized identity. Existing host/player capabilities remain memory-only authorization for live controls.

## Runtime boundary

`RoomOutcomes` collects bounded counters in memory when the existing Room publishes state. It never queries PostgreSQL and never retains an input, prompt, stroke, token, socket or network address. Round closure aggregates score deltas, eligibility, submissions, game-defined correct/majority responses and votes. Room Temperature labels those outcomes as majority responses, not objective correctness. EventRuntime keeps each inner engine's counters before replacing it, alongside the existing separately authoritative Event placement totals.

The socket adapter freezes and validates a `SessionSummary` once at the terminal boundary. `SessionFinalizer` submits a detached copy to a process-local queue. The final screen is published without awaiting a database transaction. Four writes may run concurrently; at most 128 await execution. Each write gets one attempt plus three retries after 250/1,000/3,000 ms. PostgreSQL transactions have a five-second statement timeout and three-second lock timeout, in addition to the existing pool connection timeout. Queue pressure reports failure rather than growing without bound.

A UUID primary key and canonical summary hash protect finalization. An identical retry returns the original record; a conflicting payload fails without changing the result. Run, segment, participant and `session.completed` / `session.ended_early` operational audit rows commit in one transaction. An ambiguous commit acknowledgement is safely retried. Audit metadata contains source identity/counts/duration, never a leaderboard or creative content.

Only the host snapshot receives `history: {status, sessionId, workspaceId}`. Saving is not success. `saved` and the Open saved recap link appear after commit; exhaustion/capacity/capture failure does not claim durability. Logs contain bounded event/run IDs and attempt numbers, not raw exceptions or database configuration. Logging or presentation callback failure cannot reject a live action.

State broadcasts check the current Room instance and each recipient’s existing capability. Expiry retires old socket identities/channel membership, so a delayed write cannot address a new room through a recycled code. A held-write/replacement-room regression verifies this lifecycle.

The queue survives room disposal while the process lives. It is **not a durable outbox**. A process crash, or the existing three-second forced shutdown deadline, may interrupt uncommitted work. Exhausted summaries have no durable recovery or manual retry queue. Final results remain visible in the live room while available; Studio's existing live CSV remains usable. Readiness now checks that the history table exists; startup still never migrates.

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

History is immutable through product APIs and database UPDATE triggers. DELETE is deliberately permitted to future reviewed retention tooling: deleting a run cascades to its children, and the workspace FK has ON DELETE CASCADE. The host FK has ON DELETE SET NULL; its narrow trigger exception permits removing attribution without rewriting outcomes. Source deletion does not affect a recap. The schema does not itself implement workspace/account deletion: other domains, audit records and legal/operational policy must be handled before exposing such a flow. Operational audit deletion remains a separate existing policy.

There is no deletion/retention UI or automatic retention job in this phase. Define retention, access expectations and deletion procedures before confidential or employee-data pilots. This is usage history, never an employee assessment or a compliance certification.
