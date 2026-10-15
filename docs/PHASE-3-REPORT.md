# Phase 3 — Events & Experience Builder

Implemented October 15, 2026 on `feat/phase-3-events-experience-builder` in `AVolatile/ruckus-development`. The initial tree was clean and already on the requested branch. No commit, remote setting, original demo repository, hosted service, production credential or deployment was changed. Existing development data and local boards were preserved.

## Executive summary

Ruckus now persists workspace Events composed of Originals and Studio boards. Hosts can build/reorder/save a lineup, choose real branding, preview and validate it, then launch one room that keeps the same guests through multiple games and a cumulative finale. Launch freezes the Event, Studio revisions, actual Original prompts/configuration, Brand revision and copied image bytes. Live scores/state remain in memory; no restart recovery, analytics or new AudioEngine is claimed.

## Pre-implementation audit findings

Phase 2 already supplied workspace locks, centralized roles, immutable revisions, private processed images, safe HTTP boundaries and proven Studio saves. The existing Room engine owns timers, scoring, bots, reconnect and controller redaction. These were retained. Raw game score ranges differ materially, requiring a separate event placement adapter. See [audit](PHASE-3-AUDIT.md).

## Event domain architecture

`EventService` owns workspace-scoped lists, CRUD, copies, validation and launch transactions. Event identity is separate from immutable revision and live runtime identity. The launch snapshot UUID prepares later history without implying a durable running room. A minimal event_runs table was deliberately omitted because it would duplicate identity without providing restart recovery in this phase.

## Event revision model

Events have workspace/creator provenance, title/description/status, timestamps, archive time and non-null current revision. Revisions store validated shared JSONB, SHA-256 canonical hash, number, author and time. Workspace locks serialize saves with role/archive changes. Base-revision mismatch returns EVENT_CONFLICT; no-op content keeps the same revision. Deferred same-event current pointers and immutable SQL triggers protect history.

## Playlist model

Discriminated Original/Studio items have stable UUIDs, enabled/order, optional display title/transition label and private host note. Original settings reuse supported rounds/pace/packs. Studio definitions reference stable board IDs until launch. Repeats are allowed; unique item IDs, consecutive order and a 50-item bound are enforced. Disabled sources stay editable but are excluded from launch. Missing sources are reported without silently deleting anything.

## Permission model

Owner/Admin: read/create/update/archive/launch. Host: read/create/update/launch. Viewer: read/preview. Copy requires source read and destination create, plus source-board read/destination-board create when crossing workspaces. Existing policy definitions drive both server checks and controls. Archived workspaces/lost membership block new resource access; established live room capabilities remain independent, matching existing gameplay behavior.

## Event Builder UX

Canonical list/new/editor/preview routes live beneath `/app/w/:workspaceId/events`. The placeholder is replaced by real bounded summaries, empty/loading/error states, six starter choices and real saved definitions. Keyboard up/down, duplicate/remove/enable, expandable segment options, source repair, settings/messages, Brand choice, readiness, export/copy/archive and launch are functional.

The 750ms save coordinator serializes acknowledgements, retains edits during requests, flushes navigation, pauses on errors/conflicts and supports export/latest recovery. Optional tab drafts are account/workspace/event-scoped and detect an advanced cloud base. Unload warns about unconfirmed work. Explicit operations disable configuration inputs while awaiting completion. No local authoritative Event library is introduced.

## Event templates

Team Warmup, Friday Wind Down, New Hire Mixer, Holiday Party, Company Trivia Night and Offsite Social are honest Ruckus-authored Original lineups. Each creates a fresh editable Event/revision 1 with independent playlist IDs. Hosts add real Studio boards for organization-specific questions; no fictitious customer/employer events or hidden cross-workspace references are seeded.

## Brand Kit integration

The builder lists authorized kits and clearly offers Ruckus styling. Preview resolves current Brand data; launch pins an exact immutable revision. Colors derive readable foregrounds without mutating the selected values. Dashboard branding stays Ruckus. Live event framing is restrained, with logo, opaque content panels, decorative background, footer and attribution. Existing Original stages retain their visual/gameplay identity within an event banner.

## Guest-safe Brand asset snapshots

Only referenced logo/background images are copied to immutable snapshot bytea rows. Guest URLs contain random snapshot-asset UUIDs, never private source IDs. Delivery requires that the matching in-memory Event room is available. It returns WebP bytes with nosniff, CSP, private revalidation and content-hash ETags, without source/workspace metadata. Source URLs still require accounts/membership. URLs are bearer capabilities for intentionally published event artwork, not confidential file sharing.

Ending/expiring/restarting the room prevents subsequent delivery. Historical snapshot bytes remain in PostgreSQL pending retention tooling. Source Brand edits/deletion do not mutate copied bytes. Development phone addresses are allowed only for read-only guest images on an actual local interface and configured port; production keeps the exact configured Host policy.

## Launch snapshot architecture

A workspace-locked transaction checks current launch permission/base revision, validates all enabled sources, resolves board IDs/revisions/full validated documents, captures actual Original prompts/settings/content version and Brand revision, copies referenced bytes and writes immutable launch/audit records. Zero enabled games, invalid/missing/deleted sources, bad Brand/assets/configuration or stale revision block launch. Readiness reports per-item repair messages; absent branding/subtitle/footer, one segment or hidden final leaderboard are warnings.

Room allocation happens after commit, and the browser resumes its returned host capability before navigating to the stage. A rare commit/allocation failure can leave an unusable immutable launch record, with no publicly available images because no room exists. PostgreSQL/process-memory allocation is not a distributed transaction. Each explicit HTTP launch creates a new snapshot; launch requests are not retry-idempotent. In-room progression commands reject stale retries.

## Runtime state machine

LOBBY → optional EVENT_INTRO → SEGMENT_INTRO → GAME_ACTIVE → GAME_RESULTS → optional INTERMISSION → next SEGMENT_INTRO or EVENT_FINAL → ENDED. Only the host controls boundaries. Existing game clocks control active rounds/voting. End is available from any state. Expected transition sequences and round keys reject stale actions. Skip-next is restricted to between-game states and never discards an active game.

Failed upcoming initialization retains the prior audience/state and gives the host a safe correlation reference with retry/skip/end recovery. Guests keep a waiting screen. No raw internal exception reaches them.

## Existing engine integration

`EventRuntime` delegates to a fresh existing Room per segment and disposes old timers/bot jobs. It shares the original player/token Map, host connection and join URL, resetting only per-game score/statistics. The only engine extension is an optional frozen Original prompt list; standalone prompt lookup remains the fallback. No scoring, voting, drawing or moderation algorithm was rewritten. Controllers retain existing inputs with segment-qualified React/round keys.

## One-room multi-game flow

One five-character code and QR cover the entire lineup. The parent host capability stays stable even as inner Room instances change. Guests retain IDs, names, avatars and capability tokens. No second join or workspace membership is required. Event banners show progression; intermissions and a unified winner/final scoreboard connect the separate games.

## Score aggregation strategy

Hotwire awards 500–1,000 by speed; Room Temperature 600; Odd One In 700; creative games 300 per vote; Studio can be scored or scoreless. Raw sums would favor game/vote scales. Existing game scores therefore remain separate, and each scored segment contributes tied placement points from 0–1,000. Equal positive top scores earn equal 1,000-point placements. An all-zero segment awards zero; wholly scoreless Studio segments do not contribute. UUID only orders equal totals for display; ranks remain tied. Full formula is documented in [runtime](EVENT-RUNTIME.md).

Participants are those eligible in at least one round. Disconnected players retain points; late joiners receive no past participation. Carry-scores disabled omits accumulation/presentation. Hidden final leaderboard affects presentation only, retaining runtime totals. Points are not persisted results.

## Reconnect behavior

Existing room resume capabilities return current game/controller/event state, sequence, aggregate points and cue. No transition history replays. Segment-qualified round keys reject delayed answers from earlier games. Reconnect remains available with late joins disabled. Host/player refresh works while the process/room is available; server restart ends the live experience.

## Host event console

Lobby shows title/Brand, code/QR, guests, demo crew, join lock and lineup. Between games the host sees connected count, current/upcoming games, progress, game results, enabled aggregate standings and valid next/skip/end controls. Active games retain pause/reveal/moderation controls. Ending requires confirmation. Final returns to workspace Events; rematch does not accidentally reset an Event segment.

## Player event experience

Account-free guests see branded lobby/introduction, current controller, game results, intermission, cumulative standings and final celebration. They never receive host notes, editable definition, database source pointers or private answer keys before reveal. Late joins begin at zero and use existing next-round eligibility. No account wall, host navigation or organization requirement is introduced.

## Audio semantic hooks

Shared typed cues cover LOBBY_ENTER, EVENT_START, EVENT_INTRO_ENTER, SEGMENT_INTRO_ENTER, QUESTION_OPEN, ANSWER_LOCKED, REVEAL_ENTER, GAME_RESULTS_ENTER, EVENT_LEADERBOARD_ENTER, INTERMISSION_ENTER, FINAL_RESULTS_ENTER and EVENT_END. Current transition context includes cue names, monotonic sequence and authoritative timestamp. Simultaneous meanings share context; reconnect establishes a current baseline. No music, new Audio API calls, ducking, volume engine or SFX assets were added. Existing standalone optional sounds are preserved; Event stages do not opt into them.

## API changes

Workspace-scoped `/events`: GET summaries/keyset pages, POST create/template; `/events/templates`: GET; `/events/validate`: POST read-only readiness; `/events/:eventId`: GET/PUT base-revision save; POST `/archive`, `/copy`, `/launch`. Guest GET `/api/v1/event-assets/:assetId` precedes the account guard but keeps request IDs/Host protection and its own rate bound. Private mutable JSON remains no-store. Readiness now requires Events schema. Existing APIs remain compatible.

## Socket contract changes

`RoomView.event` is optional for backward compatibility and carries typed lifecycle, sequence, segment/playlist progress, event points, presentation and current semantic cue. Guests receive a sanitized subset. `event:action` accepts typed start/advance/skip-next/end with expected sequence and validates existing host capability. Ordinary Event host controls additionally check expected round key. Standalone room commands and joining/resuming stay compatible.

## Database migrations

Added additive `0003_events_experience_builder.sql`, `meta/0003_snapshot.json` and journal entry. Existing SQL/data were preserved. Development/test migrations, repeated migration, generated-schema drift check and compiled migration runner pass on actual PostgreSQL 18.4. No auto-sync, destructive reset or deployment hook was added. Compose/CI PostgreSQL 18.6 and Docker were not executed locally.

## Indexes/constraints

Four new tables: events, event_revisions, event_launch_snapshots and event_snapshot_assets. Active workspace/update/UUID supports lists; event/time supports launch history preparation; snapshot FK index supports asset lookup. Positive unique per-event revision numbers, same-event revision identities/current pointer, same-event launch revision FK, real creator/workspace/source FKs, archive status checks and image MIME/kind/byte-length bounds are enforced. Triggers reject ordinary revision/snapshot/asset updates/deletes. Aggregate integrity inspection reports zero orphan Events, zero orphan boards and zero bad launch-revision references.

## Audit events

Event create/update/archive/copy/launch writes append-only operational events in the corresponding content transaction. Cross-workspace copies also record fresh board-copy events. Metadata contains identifiers/revision/name, never full content, host notes or capability secrets. Completion/early end attempts a best-effort event.ended write with snapshot/reason; there is no durable outbox for a failing end write.

## Security controls

Preserved Better Auth sessions/revocation, exact unsafe Origin/Host checks, private APIs, safe request-ID errors, strict shared validation and workspace row-locked authorization. New create/copy limits are 20/minute/actor/IP, launch 8, guest images 180/minute/IP, alongside existing API/socket limits. Technical safeguards: 50 playlist items and 500 active workspace Events. No paid entitlement is invented. Snapshot URLs expose only intentionally published copied images while live; source imagery remains private. Engine redaction and capability authority stay intact. No server credentials/libraries enter browser bundles.

## Files added

- Shared/server: `shared/events.ts`, `server/events/{service,runtime}.ts`, `server/api/events.ts`, `server/db/event-schema.ts`.
- UI: `src/events/{EventList,EventNew,EventBuilder,PlaylistEditor,EventLive}.tsx`, `useEventDraft.ts`, `src/styles/events.css`.
- Migration SQL/metadata above.
- Tests: `tests/events.test.ts`, `event-socket.test.ts`, `integration/events.test.ts`, `browser/events.spec.ts`.
- Docs: `PHASE-3-AUDIT.md`, this report, `EVENTS.md`, `EVENT-RUNTIME.md`.

## Files removed

No useful source/assets/data were deleted. The obsolete HostEvents placeholder function was removed after routing to the real Event list. Portfolio surfaces/artwork, six Original engines, Studio tools, historical reports and legacy local payload remain preserved.

## Files materially changed

Database schema export/journal; shared room/capability contracts; API installer/readiness; room map/socket launch/progression adapter; narrow frozen-prompt engine extension; PartyProvider, host/player stage wrappers/controller keys; workspace routes; additive CSS; factual audience copy; README/architecture/database/deployment/workspaces/Brand/vision/roadmap. Browser fixtures honor signup Retry-After when the expanded suite reaches the existing limit; production limits were not weakened. Existing CI workflow timeout is 20 minutes and automatically includes new tests/migrations, with no deployment step.

## Dependencies added and justification

None. Existing PostgreSQL/Drizzle/Zod/React/Socket.IO/image tooling supplies the required boundaries. No framework, workflow library, audio dependency or object-storage service was added. Package/lockfiles are unchanged. Dependency audit reports zero vulnerabilities.

## Exact commands executed

Commands run from ruckus-app with Node 25.9 through `PATH="/opt/homebrew/bin:$PATH"` (CI remains Node 22):

```sh
npm run db:generate
npm run db:migrate
npm run db:test:prepare
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
node --import tsx --test tests/events.test.ts
TEST_ORIGIN=http://localhost:4312 node --import tsx --test tests/event-socket.test.ts
node scripts/verification-app.mjs --compiled
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/events.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4314 npx playwright test tests/browser/events.spec.ts
npm audit --audit-level=low
git diff --check
```

Also ran Prettier on changed/new supported files; a compiled migration runner with DATABASE_URL explicitly assigned TEST_DATABASE_URL in-process after local-test URL validation; aggregate-only PostgreSQL integrity inspection; and local screenshot rendering/visual review. No secrets, mail links or room capabilities were printed. Initial new test fixtures referenced the wrong image-store methods and a disconnected socket; corrected fixtures pass. Early browser selectors and a shrinking open-details locator were corrected. An earlier full browser attempt hit legitimate signup limits and was stopped after known failures; the fixture now waits for Retry-After instead of changing application limits.

## Exact test results

| Check                                                                              | Actual result                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                                | PASS, client/shared and server                                                             |
| `npm run lint`                                                                     | PASS, zero errors/warnings                                                                 |
| `npm test` without live origins                                                    | **27 passed, 4 intentional skips, 0 failed**, 0.50 seconds                                 |
| `TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test` | **31 passed, 0 skipped, 0 failed**, 123.35 seconds                                         |
| `npm run test:integration`                                                         | **12 passed, 0 skipped, 0 failed**, 2.43 seconds, real PostgreSQL                          |
| `PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e`                       | **17 passed, 0 failed**, 5.4 minutes, compiled application                                 |
| Focused new Event browser cases before full regressions                            | **2 passed**, 21.2 seconds                                                                 |
| Final Event browser rerun after CSS-only mobile logo correction                    | **2 passed, 0 failed**, 26.7 seconds; five-width/Axe checks repeated                       |
| `npm run build`                                                                    | PASS, Vite client and compiled TypeScript server                                           |
| Development/test, repeated and compiled migrations                                 | PASS; real PostgreSQL **18.4**                                                             |
| `npm run db:generate`                                                              | No schema drift                                                                            |
| Aggregate integrity                                                                | orphan_events=0, orphan_boards=0, bad_launch_revisions=0                                   |
| Axe WCAG 2 A/AA and 2.1 AA                                                         | Zero violations on the checked existing and new Event surfaces                             |
| Responsive layout                                                                  | No overflow at tested 320/390/768/1024/1440 widths                                         |
| Event preview boundary                                                             | No Socket.IO connection created                                                            |
| Client bundle scan                                                                 | No SMTP secrets, AUTH_SECRET, DATABASE_URL, Nodemailer, Drizzle ORM or pg protocol matches |
| Dependency audit                                                                   | Zero reported vulnerabilities                                                              |
| Formatting/diff                                                                    | Changed supported files checked; clean `git diff --check`                                  |

The deliberate initializer-failure unit test emits one sanitized reference-only diagnostic; it is an expected assertion path, not a failed test. Browser signup fixtures honor the real rate limit, so the full run includes a Retry-After wait. Docker/Compose, PostgreSQL 18.6, GitHub Actions, hosted SMTP/deployment and physical-phone checks were not executed. A final CSS-only mobile logo correction is verified separately below; the full 17-case command was executed, not inferred from targeted passes.

## All-six-Original Event verification

A single deterministic runtime test and a real HTTP/socket Event test both play Hotwire, Room Temperature, Sellout, Caption This, Odd One In and Scribble Shift, with a Studio segment inserted into the same lineup. They verify one room code/identity, answer redaction, creative anonymous submissions/votes, segment transitions, aggregate participation and final state. Existing standalone all-six/socket/autoplay cases remain and pass. No independent duplicate game implementations exist.

## Studio-board Event verification

Database tests pin board revision/full content and compare the immutable launch after later source edits. Live socket tests reconnect during the second (Studio) segment and confirm its original title. Browser acceptance builds Holiday Party 2027 as Room Temperature → Holiday Studio questions → Caption This, joins once, edits board/Brand after launch, reloads the guest during Studio and sees the original prompt, then reaches cumulative finale and returns to workspace Events.

## Bundle/performance observations

Client entry approximately 93.76 kB gzip versus Phase 2's 93.62 kB. Event Builder about 6.45 kB gzip, EventLive 6.51 kB, realtime 14.49 kB and question library 16.24 kB remain separate chunks. Event list/new/editor/preview are lazy; preview opens no socket. Private images load separately from summary/kit JSON. Lists are bounded summaries/keyset pages. Launch resolves only enabled sources under one workspace lock; bounded per-item source queries favor clear validation over speculative optimization. No answer/tick database writes or autosave list refetches exist. Snapshot retention/storage growth requires operational planning.

## Accessibility results

New browser checks use Axe WCAG 2 A/AA and 2.1 AA on Event list/builder/preview, host lobby/intermission/final and guest lobby/intermission/final. Widths 320, 390, 768, 1024 and 1440 are checked for list/builder/preview and live stages, alongside existing public/host/gameplay/workspace regressions. Native fields/details, explicit labels, field errors/status announcements, keyboard ordering, derived contrast and solid text panels are used. Desktop/mobile screenshots are reviewed; a mobile logo wrap was corrected in final CSS. Exact completed suite results are recorded above.

## Known limitations

Rooms, answers, cumulative scores and lifecycle state remain in memory; no restart recovery, persistent results/history UI, analytics, billing, player profiles/progression, distributed runtime or AudioEngine exists. Draft tab recovery is optional and cannot promise durability before acknowledgement. Live image URLs are bearer capabilities, expire with room availability and require deliberate artwork suitability. Snapshot rows/images remain retained; purge/cleanup tooling is absent. Explicit launches are not HTTP-idempotent. Commit/allocation and best-effort end-audit failures have documented operational limits. Cross-workspace copy blocks unavailable sources instead of silently retaining private links. No Event restore/history browser is provided.

## Security/operational gaps

Before public release, finish Phase 2 actual-domain SMTP/DNS/TLS/proxy/cookie/device checks, PostgreSQL network/TLS and backup restore, account deletion/retention, abuse/asset/storage monitoring, patch/secret rotation procedures and independent security review. Establish Event snapshot retention and end-audit reliability before volume use. Limits remain per process. No hosted deployment, real SMTP provider, Docker image, PostgreSQL 18.6, GitHub Actions, physical-phone/cellular or real-domain proxy validation was performed locally. No certification, guaranteed uptime or durable session claim is made.

## Recommended Phase 3.5

**Ruckus Audio & Game Feel:** a central AudioEngine around authoritative cue mappings/timestamps; licensed/original loops, transition stings, leaderboard/finale cues, countdown tension, button/phone feedback, fades/ducking, host volume, persistent preferences and browser autoplay handling. No Phase 3.5 implementation was begun. Preserve accessibility and avoid replaying cues on reconnect.

Both task-owned verification servers (4312/4314) were stopped after checks. Existing local PostgreSQL remains running with additive development/test migrations applied. Use `npm run dev` from ruckus-app to open development.
