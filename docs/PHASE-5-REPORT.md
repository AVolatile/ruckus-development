# Phase 5 — Session History & Analytics

Implemented October 16, 2026 on `feat/phase-5-session-history-analytics` in `AVolatile/ruckus-development`, from clean milestone `07c96d1`. No commit, merge, deployment, remote change, dependency installation, new credential or Phase 6 implementation. Additive migrations were applied locally; no existing workspace content, historical revision or user backup was reset or rewritten. Generated QA content uses the isolated test database.

**Technical verification and art direction are separate. Human visual approval is pending Anthony’s review.** Phase 4.5B approval remains pending as documented in that milestone; this report does not approve it retroactively.

## Outcome

Hosts can revisit real Original, Studio and mixed Event sessions in workspace History, open a frozen recap, compare the exact final pecking order, inspect played segments/source revisions, export CSV and see lightweight SQL usage summaries. One History navigation item contains Sessions and Analytics. Public/player routes remain separate; guests still join without accounts.

The live engine remains authoritative and memory-based. History is a completion snapshot, never a live-state database. Failed persistence does not delay the final screen or gameplay acknowledgement. Recaps become available only after a committed transaction.

## Audit and architecture

[Pre-implementation audit](PHASE-5-AUDIT.md) reviewed the requested Phase 3/4/4.5 reports, runtime/architecture/database/product vision, Room and EventRuntime, scoring/identity, source/Brand snapshots, launch adapters, workspace policy/audit, shell/Library/Event UI and existing CSV. A critical finding was that EventRuntime replaces the inner Room and resets raw game scores. Counters must be retained before replacement, while Event placement points remain separately authoritative.

`RoomOutcomes` observes existing publication boundaries and keeps bounded numeric counters/roster snapshots in memory. It retains no raw input, prompt, token or network identity. At final/early end the socket adapter validates/freezes one summary and passes a detached copy to SessionFinalizer. SessionHistoryService owns one transactional PostgreSQL write and safe operational audit event. No timer, answer, vote, reaction, heartbeat or reconnect performs a history database write. Final lifetime review also found that an asynchronous completion callback could outlive a room and address a reused code. A narrow transport module now requires current Room identity and each recipient’s existing capability, and expiry clears old identities/channel subscriptions. A held-write/recycled-room regression verifies stale callbacks and stale cleanup cannot reach or remove the replacement.

The queue allows four active transactions and 128 waiting summaries. It makes one attempt plus three retries after 250/1,000/3,000 ms. Transaction statement/lock timeouts and existing pool connection limits bound database work. Logs contain event/run IDs and attempt counts, never raw exceptions/URLs. Logging/presentation callback failures cannot reject progression. Queue pressure and retry exhaustion report failure, never success. Tasks outlive room disposal while the process lives; shutdown drains within the existing overall forced-exit limit.

There is no durable outbox. A crash or forced shutdown can lose an uncommitted recap; exhausted summaries have no persistent recovery queue. This does not restore rooms after restart. These limits are explicit in [Session History](SESSION-HISTORY.md).

## Identity, qualification and idempotency

A run qualifies after at least one closed engine round. Lobbies, failed creates, intros and unfinished first questions leave no history. A closed round with no submissions still counts as a round; this is a precise lifecycle rule, not an enjoyment metric. Final/ EVENT_FINAL means completed; qualified explicit end/host-loss/inactivity/shutdown before finale means ended_early. No unsupported crash/abandon/error classification is inferred. An Event finale after intentional skips remains completed, with only played segments recorded and original sequence positions retained.

Standalone run UUID is independent of code and resets on rematch. Event launch UUID identifies its run. One adapter attempt per terminal identity plus database primary-key/canonical-hash verification makes duplicate END, refresh, reconnect, cleanup and ambiguous commit retries safe. Identical payloads reuse the record; mismatches cannot rewrite it. Run, children and `session.completed`/`session.ended_early` audit commit atomically.

## Data model and minimization

Three tables support the scope: run metadata; ordered segments with bounded aggregate result JSON; session-local participants. Run metadata contains workspace/optional actor, type/title, historical code, frozen sources/Brand identity, timestamps/wall seconds, joined/completed/demo/omitted counts, segment count, terminal status, format version and hash. Segment rows contain actual provenance, timing, scored/completed flags, round/participation/submission/vote counts and numeric player outcomes. Participant rows contain session-local UUID/name/avatar/demo, join instant, completion, final points/rank/**display order** and segment participation/completion counts.

Standalone scoreboard places are sequential, including score ties; Event aggregate ranks share ties. Persisted display order separately preserves the live order of tied Event rows after runtime IDs are replaced with session-local UUIDs. Recap highlighting treats every shared first place equally. No read request recomputes placements from mutable scoring rules.

Wholly unscored Studio/polls have no invented score or leaderboard. Events with accumulation disabled receive participation recaps; real scored segment outcomes remain. Hiding the live finale leaderboard does not discard earned aggregate totals from authenticated history. A strengthened unit test first demonstrated that omission, then unit, PostgreSQL and browser checks verified preserved totals while the live stage remains hidden. Interrupted games do not acquire unearned Event placement points. Removed guests remain attendance outside the terminal leaderboard; disconnected guests retain earned results. Participant completion means participated and still in the roster at normal finale, not proof of physical presence.

The limit is 300 attendee details and 300 numeric results per segment, prioritizing the terminal roster under unusual removal/replacement turnover. Joined and submission totals remain separate; the 350-entry test preserves truthful totals with 50 omitted details. Segment eligibility is bounded at 1,500 (50 questions × 30 concurrent guests). Summaries have at most 50 segments and a 2 MB serialized bound. These are technical safeguards, not entitlements.

No player email, IP, location, fingerprint, device identifier, capability, auth token, cookie, creative text or drawing enters history. No cross-session identity is inferred. Attendance means entries per session, including separately identified demo players. Existing auth data stays in its existing separate domain.

## Frozen sources and retention

Authorized standalone board launch now selects content and revision together under the existing lock. Pack resolution already returns exact immutable references. Portable raw boards remain supported with explicitly absent verified cloud provenance. Legacy unscoped launches resolve to the authenticated host's personal workspace. Event summaries retain Event/board/pack revisions, frozen labels and modest Brand Kit/revision/display/color metadata. They never copy full launch documents or private image bytes/URLs.

History reads its own frozen names. Integration tests edit/archive private Packs and Events and edit/delete a Studio source; recaps keep the original names/revisions. Current-source actions check current availability/access and open current previews. They never silently replay an old snapshot.

Results reject UPDATE. Source references deliberately do not depend on source-row lifetime. Run deletion cascades children; workspace FK deletion cascades history; host attribution can become null without altering outcomes. Retention/deletion UI is deferred. Other domains/audit constraints and operational policy still need deliberate workspace/account deletion work; this schema does not claim those product flows exist.

## Migrations, indexes and compatibility

- `0005_broad_terrax.sql`: three history tables, FKs, checks, indexes and immutable-result triggers.
- `0006_dark_vindicator.sql`: permits full aggregate segment attendance while preserving bounded detail arrays.
- `0007_goofy_lily_hollister.sql`: explicit nullable final_order for exact tied leaderboard display. Earlier local development fixtures are not assigned invented order.
- Matching 0005/0006/0007 snapshots and journal entries are included in the working tree for review; earlier Phase 0–4 migrations remain unchanged.

The generated names were retained. Automatic approval review rejected an attempted rename of already-applied migration files/journal tags because it could disrupt migration tracking. That command did not execute; the safer additive migration path completed the task without renaming applied history.

Development/test upgrades, repeated migrations, compiled production migration runner pointed explicitly at the test DB, and fresh disposable database migrations all succeeded. The fresh test applies all eight migrations twice, asserts zero fabricated history and removes only its newly created disposable database. No development/test reset, deployment hook or startup auto-sync was added. db:generate reports no drift.

Indexes cover workspace/start/UUID, workspace/type/start/UUID, workspace/Event/date, unique run/sequence, game/run and run/participant rank. List queries fetch metadata only; detail uses bounded run/segment/participant queries; analytics performs six SQL aggregates. No N+1 source/content load or per-player query is added. All-time aggregation and rare workspace-row contention have not been capacity-tested.

## API, authorization and analytics

Added GET `/api/v1/workspaces/:workspaceId/sessions`, `/sessions/:sessionId` and `/analytics/summary`. Lists use descending start/UUID keysets, default 30/max 50. Filters cover 7/30/90/all, type, game (including games in Events), Event identity and optional UTC from/inclusive-through dates. Preset ranges anchor to a supplied through date. Date validation, missing/cross-workspace non-enumeration, safe errors/request IDs, private no-store responses and existing process rate limits apply.

New history.read/analytics.read capabilities are server-enforced for Owner/Admin/Host/Viewer. No player history endpoint or client write endpoint exists. Session-derived actors and launch-authorized workspace/source data remain authoritative. APIs omit stored hash and host account identity from recap/list JSON.

PostgreSQL computes sessions, attendances/demo subset, wall seconds/averages, completed fraction, active-day/month counts, play types and most-played games/Packs/Events. Names are recorded labels, not current source lookups. Top lists/activity are bounded. Missing zero-play periods and the 120-active-bucket cap are explicitly labelled. The browser does not fetch all sessions/participants to aggregate them. Metrics describe usage, never proficiency, fun, employee performance or cross-session unique people. See [definitions](ANALYTICS.md).

CSV includes recap metadata, source revisions, actual final standings and ordered segment aggregates. Quoting/formula-prefix protection includes leading whitespace. Bulk export, player search, session deletion, BI integrations and AI insights remain outside scope.

## Host experience and rendered review

History adapts the original collection/editorial vocabulary into a dated chronological shelf with actual game colors/icons and directional recap actions. Recaps adapt the original final pecking order and Event sequence into a keepsake with standings, run of show and current-source/export actions. Analytics uses one blue editorial number, a labelled activity strip, actual game lineup and restrained supporting facts; no KPI-card grid, chart dependency, sidebar or dashboard reskin.

Phase 4.5B Library, Packs, Originals, Studio, Event and Brand compositions are preserved. The new History item fits the existing shell; Analytics stays within History. Loading, unavailable/retry, empty workspace, zero filtered results, date validation, unavailable source, saving and committed feedback are explicit. Source metadata is disclosed on demand instead of turning the recap into a developer panel.

Reviewed preserved original Home/reference and restored Library captures, source/design constitution, then actual compiled Chromium History/recap/Analytics screenshots. Browser skill was read; the required Node REPL execution tool was unavailable, so repository Playwright/Chromium supplied rendered verification. No in-app browser connection, new hosted reference capture, physical phone or human approval is claimed.

Actual visual review caught narrow game titles fragmented by adjacent action links at 320px despite zero overflow/Axe errors. The action now occupies its own grid row, supported by a character-position regression. It also prompted equal emphasis for tied Event leaders, shorter date presets and singular/plural corrections. Automated layout checks did not substitute for art-direction inspection.

The ignored review index is `.local/visual-qa/phase-5/index.html`, with links to retained original/4.5B evidence. Generated fixtures play real sockets against the isolated database; they do not seed invented production analytics. Rapid programmatic round advancement can truthfully produce zero-second rounded durations; these fixtures are not representative hosted occasions. Credentials remain in private temporary storage outside Vite, never in the screenshot index. No Downloads backup was opened/imported/modified.

## Files and dependencies

Added shared/history.ts; server/broadcast.ts; server/history/{outcomes,finalizer,service}.ts; server/db/history-schema.ts; server/api/history.ts; three migrations/metadata; src/history/{HistoryPage,SessionRecap,AnalyticsPage,HistoryParts,HistorySaved,useHistoryRequest,history.css,live-feedback.css}; scripts/history-visual-qa.mts; unit/integration/browser history cases and reusable test helpers; this report/audit/history/analytics guides.

Narrow changes touch Room publication/rematch counters, Event counter retention/final snapshot, socket adapter/source selection/cleanup, board launch revision selection, API installer/readiness, schema exports, capability policy, lazy routes/shell, live host persistence feedback and accurate Studio CSV copy. Existing socket/autoplay tests gain committed recap/order assertions. CI's existing glob-based unit/integration/browser commands include all new cases; step descriptions make the scope explicit. README/architecture/database/runtime/vision/roadmap are updated.

No useful assets/data or existing test checks were removed. No audio implementation/asset, gameplay scoring/timer rule, player-controller implementation, auth algorithm, content authoring schema, membership algorithm, package/lockfile or environment variable change. No dependencies were added.

## Exact verification

The results below are completed command runs. Earlier passing/interrupted iterations are not substituted for a final result.

| Check                                             | Actual result                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck / lint / client + server build          | PASS on handoff code                                                                                                                                                                                                                           |
| Focused outcome unit cases                        | 13 passed: all six Originals, polls, ties/order, qualification, bounds, retries/log failure and UTC dates                                                                                                                                      |
| `npm test` without live origins                   | **73 passed, 6 intentional skips, 0 failed**, 1.01s                                                                                                                                                                                            |
| Full unit/live/socket/autoplay                    | **79 passed, 0 skipped, 0 failed**, 123.41s; final lifecycle/scoring backend                                                                                                                                                                   |
| Full PostgreSQL integration                       | **24 passed, 0 skipped, 0 failed**, 3.35s; includes real completion-callback DB failure, source rename/archive and all eight fresh/repeated migrations                                                                                         |
| Complete compiled browser suite                   | **37 passed, 0 failed**, 9.6 minutes; includes phone title regression; precedes the final focused corrections described below                                                                                                                  |
| Final affected compiled browser suite             | **4 passed, 0 failed**, 15.8s; handoff artifact, including query/hash preservation, custom-date navigation, phone whole-word checks, majority wording, CSV, source availability, guest-safe launch and earned totals with a hidden live finale |
| Final visual matrix                               | **62 route/width checks**, zero document overflow; **65 Axe scans**, zero WCAG 2 A/AA + 2.1 AA violations (62 checkpoints + three expanded provenance checks)                                                                                  |
| Focused visual states                             | Expanded provenance at 320/390/1440; loading/error at 390/1440; date filters/navigation and seven game-lineup detail captures; **143 PNG artifacts** total                                                                                     |
| Audio validation                                  | **27 assets / 54 files / 4,750,034 bytes**, unchanged                                                                                                                                                                                          |
| Dependency audit                                  | **Zero vulnerabilities**                                                                                                                                                                                                                       |
| Schema drift / repeated/fresh/compiled migrations | PASS; no data reset/backfill                                                                                                                                                                                                                   |
| Client marker scan                                | **61 JavaScript assets, zero known server configuration/library marker matches**                                                                                                                                                               |
| Changed-file formatting / whitespace              | PASS; migration metadata formatting checked for identical parsed values                                                                                                                                                                        |

The final full browser command and the later four-case command are distinct. The last refinements preserve Analytics date selections and legacy query/hash navigation, print complete chart dates, guard recycled-room transport and retain earned Event totals independently of finale visibility. The affected History browser suite verifies the final artifact, including the live finale staying hidden while earned totals remain in the recap. Live persistence feedback now carries its own tiny stylesheet instead of depending on a prior History visit; the final affected suite and visual matrix cover the handoff client. No second complete 37-case run after those refinements is claimed. The backend's last complete live suite and the final real PostgreSQL suite passed as listed.

Major commands ran from ruckus-app with `/opt/homebrew/bin` first in PATH, Node 22.23.3:

```sh
npm run db:generate
npm run db:migrate
npm run db:test:prepare
node --env-file=.env.test --import tsx --test tests/integration/history.test.ts
node --import tsx --test tests/history.test.ts
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run audio:validate
npm audit --audit-level=low
VERIFY_PORT=4312 node scripts/verification-app.mjs
VERIFY_PORT=4312 node scripts/verification-app.mjs --compiled
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
VERIFY_PORT=4316 node scripts/verification-app.mjs --compiled
TEST_ORIGIN=http://localhost:4316 AUTOPLAY_ORIGIN=http://localhost:4316 npm test
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/history.spec.ts --output=test-results/phase5-history-source
PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4314 npx playwright test tests/browser/history.spec.ts --output=test-results/phase5-handoff
PLAYWRIGHT_BASE_URL=http://localhost:4312 node --import tsx scripts/history-visual-qa.mts
node --env-file=.env.test --input-type=module -e 'process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;await import("./dist-server/server/db/migrate.js")'
npm run build:server
npm run build:client
npx prettier --write <changed supported files>
npx prettier --check <changed supported files>
git diff --check
```

The test URL was also selected in-process for additive test migration application without printing configuration. The db:test:prepare command reported all existing default Pack seeds unchanged. Initial browser attempts exposed exact-label locator assumptions; those checks now use semantic combobox names. Two full-browser iterations were deliberately interrupted for final order/visual corrections; neither is reported as passing. A fixture import typo, the optional test callback signature and the personal-membership role-test setup were corrected; database policy was not weakened. Aggregate fixtures use past instants rather than a potentially future 01:00 UTC timestamp, and tied-outcome fixtures use majority scoring to avoid timing-sensitive assumptions. The hidden-finale unit case intentionally failed before the collection fix and passed after it. An earlier complete 37-case run passed, then visual review found the title issue described above. A capture-only locator that shrank as disclosures opened was corrected to stable details elements; scroll normalization keeps fixed offscreen skip links out of full-page review artifacts. Final captures were repeated, and failed capture/fixture attempts are not counted as passes.

## Performance and limits

Final client entry is about 94.44 kB gzip versus Phase 4.5B's 94.21 kB. Existing global CSS remains about 30.16 kB; History CSS is a separate lazy asset (2.91 kB gzip); live feedback has a 0.20 kB gzip component stylesheet. History/Analytics/recap components remain lazy. Audio remains 11.29 kB and the question library 16.23 kB gzip in separate chunks. No chart framework, server database/auth/email package or new service belongs in client assets. These are build observations, not a large-workspace load benchmark.

Local PostgreSQL 18.4 and Chromium only. No Docker/PostgreSQL 18.6, CI execution, hosted SMTP/DNS/TLS/proxy, Safari/Firefox, physical device, cellular verification or new human audio listening. Existing public-release security/operational gaps remain. Process-local retry, no deletion/retention UI, no guaranteed recovery and bounded attendance detail are deliberate limits, not hidden enterprise claims.

Recommended Phase 6: production reliability and reviewed retention/deletion/observability, informed by real pilot hosting. Preserve the independent authoritative engine and original brand. No Phase 6 implementation was begun.

Human visual approval remains pending Anthony’s review. Task-owned verification servers on 4312/4314/4316 were stopped after checks. The original development service on 4310 and PostgreSQL on 55432 remain running. Changes remain uncommitted on the requested branch.
