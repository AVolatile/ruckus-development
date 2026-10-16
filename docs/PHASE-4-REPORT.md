# Phase 4 — Content Platform & Packs

Implemented October 15, 2026 on `feat/phase-4-content-platform` in `AVolatile/ruckus-development`. Initial working tree was clean. No deployment, commit, remote change, dependency installation, production credential, original demo change, audio regeneration or database reset was performed. The existing development server on 4310 was preserved. The existing local PostgreSQL cluster was started for verification; development/test migrations and explicit seeds were applied.

## Executive summary

Ruckus now separates six reusable Original engines from persistent, versioned Content Packs. The Library provides authenticated discovery, private workspace authoring, structured six-game editing, immutable revisions, conflict/recovery UX, copying and portable JSON import/export. Standalone and Event launches validate ownership/game compatibility/readiness and copy exact revision content before runtime. Guests remain account-free. Existing mechanics, scoring, timers, controllers, reconnect and Phase 3.5 audio ownership remain authoritative.

## Pre-implementation content audit

The [audit](PHASE-4-AUDIT.md) inventories all banks and the engine/content boundary. Hotwire combines TRIVIA and the shared multiple-choice library; Room Temperature combines MAJORITY and shared polls. Sellout, Caption This, Odd One In and Scribble Shift use their existing scenario/scene/fact/drawing banks. Legacy `settings.pack` is a topic filter, not an identity for a first-class pack. Caption This needs existing numeric scene references. Exact ordering, topic fallback, wraparound and hidden-answer behavior were preserved.

## Game engine/content boundary

Game rules remain in `Room`. Selection resolves before room-code allocation. A narrow optional per-game frozen lineup extends the existing Event frozen-prompt input; the constructor defensively clones both forms. The runtime never queries mutable packs. The old selection function remains the canonical parity reference and direct-engine fixture fallback; network Original creation resolves persisted packs.

## Pack domain architecture

Stable pack identity owns metadata, workspace/system provenance and a current revision pointer. Immutable revisions contain a strict schema-versioned JSONB document, canonical hash, count and author. System visibility is built-in; workspace visibility is private. Personal spaces use the same model. No community publishing, entitlements or marketplace exists. [Platform reference](CONTENT-PLATFORM.md).

## Per-game schemas

Hotwire/Odd One In accept bounded choices, a valid answer index and optional explanation. Room Temperature accepts choices without an answer key. Sellout and Scribble Shift accept text prompts. Caption This accepts text and scene 0–14. Documents reject unknown fields, markup, malformed Unicode/control characters, duplicate item IDs, oversized strings/counts and unsupported schema versions. Ready validation rejects blank prompts/choices, duplicate choices, invalid indexes and empty banks. Drafts can retain incomplete material.

## Built-in migration strategy

Canonical source files remain unchanged. A server-only adapter produces six named defaults and a focused alternate, each with permanent UUID/slug. Explicit seed follows the additive migration, never application startup. Existing authored content is not silently rewritten or removed. The alternate Food for Thought uses the twelve existing food-tagged Hotwire questions; no mass-generated or scraped questions were added.

## Parity verification

The database-independent validator compares five rounds at 500 offsets for eight legacy topic/fallback cases per default: 120,000 prompt comparisons. It checks title, choices, answer, explanation, scene and topic. Counts and hashes are printed by `content:validate`; committed canonical banks remain the source of truth.

| Original         | Default pack              | Items |
| ---------------- | ------------------------- | ----- |
| Hotwire          | General Knowledge         | 169   |
| Room Temperature | Read the Room             | 32    |
| Sellout          | Big Ideas, Small Products | 12    |
| Caption This     | Office Oddities           | 15    |
| Odd One In       | Curious Facts             | 10    |
| Scribble Shift   | Drawing Outside the Lines | 12    |

Food for Thought adds twelve selected items, for seven packs / 262 seeded items including that deliberate alternate subset.

## Seed/release workflow

`content:validate` runs without a database. `content:diff` reports slug, action, game, old/new revision numbers, count and hash without mutation. `content:seed` uses a transaction/advisory lock, creates missing identities, retains no-op revisions and refuses a divergent system seed marker/hash. A real isolated release test appends a revision, proves old history unchanged, rejects divergence and restores canonical content through another immutable revision. Workspace content is never seeded over. The compiled production CLI is included in the Docker artifact; `content:diff:production` / `content:seed:production` need no development dependencies.

## Workspace pack authoring

Create a named draft for a fixed game; edit descriptions/category/season/difficulty/tags, prompts, choices and answer keys; use existing scenes; reorder with keyboard-accessible Up/Down, duplicate/delete items, inspect readiness issues, preview and archive. Empty draft creation is revision 1; subsequent acknowledged edits append revisions. The editor uses domain-aware fields rather than raw JSON or Studio board semantics. Seasons organize discovery without time-based locks or scarcity.

## Pack revisioning/concurrency

Pack and Event editors share `useRevisionDraft`, extracted from the existing Event coordinator. It serializes 750ms saves, preserves edits made in flight, flushes internal links, warns on unload, pauses errors/conflicts and offers retry/export/explicit latest replacement. Optional tab recovery keys include account/workspace/resource/ID. The original Event cache namespace is preserved. Base-revision conflicts retain local edits; canonical no-ops retain revision identity. No real-time merge is claimed.

## Content browser/search

Authenticated catalog summaries use bounded SQL filters for game/category/season/difficulty/source/status and escaped case-insensitive name/description/tags search. Deterministic updated-time/UUID keyset pages contain at most fifty summaries, without question documents or answer keys. A detail request loads the authorized document on demand; host preview renders at most five items and opens no room/socket. Private sources are never promoted into system visibility.

## Library integration

Library distinguishes Originals (rules), Content Packs (material) and Studio boards (custom board format). Original details link to compatible packs while retaining direct/default setup and demos. Pack details provide play, create-new-Event, editable copy, export and authorized edit/archive actions. Workspace selection and navigation remain existing protected surfaces.

## Standalone launch integration

Setup includes one compatible ready-pack chooser per selected game, and retains a clearly named legacy topic filter. `room:create` accepts optional workspace/selections references. Missing selections resolve permanent defaults; legacy clients and demos still launch safely. Current membership and launch/read capabilities are checked before copying playable prompts. A single random offset preserves the old cross-game selection relationship. Players receive only current redacted state.

## Event integration

Original playlist items optionally reference `contentPackId`; segment options load compatible ready choices. Pack detail can start a new Event with its selection. Preview shows selected pack name/revision. Launch checks all enabled sources, and invalid/draft/archived/unreadable/incompatible packs block launch. Cross-workspace copies create independent private-pack dependencies once per source while retaining built-in references. Studio and Brand behavior remains in place.

## Launch snapshot behavior

New Event snapshots contain pack ID, exact revision ID/number, schema version, name, game and copied prompts. Standalone rooms retain equivalent private frozen references/content. Later edits/archival cannot change active content. There are no pack lookups per question, no exposed full catalog in socket payloads, and no new runtime persistence/history claims.

## Legacy Event compatibility

Missing pack IDs resolve the game’s seeded default with the existing topic selection/fallback. Earlier saved definitions remain editable/launchable. No historical Event revision or launch snapshot is rewritten. A transactional Phase 3 fixture upgrades through the new migration and compares historical Event/revision/snapshot rows exactly.

## Pack copy/import/export

Copy requires readable source and writable explicit destination, creates a new UUID/revision 1, resets ownership and records safe server-only provenance. Future source edits never propagate. Strict JSON exports contain format/schema/document only; import validates rather than merging arbitrary fields and creates a fresh private pack. UI bounds files to 320 KB; the existing server JSON bound also applies. CSV is intentionally not implemented.

## Content provenance

`ruckus_original`, `workspace_authored` and `copied` distinguish sources. Server-only source UUIDs support copy provenance; returned records and portable exports omit those private references. [Provenance](CONTENT-PROVENANCE.md) identifies canonical files, item counts and unchanged scene artwork. No downloaded/licensed third-party assets, new factual trivia or customer/employer data was introduced.

## Content quality validation

Validation covers all six shapes, choice distinctness/indexes, strings, safe text, counts, identifiers, schema versions and launch readiness. All existing default output remains identical. The alternate is a focused subset of existing authored content. Parity is not external fact-checking certification; inherited facts have not all been independently researched. No large source rewrite, fabricated popularity or filler seasonal collection was added.

## Security controls

Central `content.read/create/update/archive` capabilities grant Owner/Admin full management, Host create/edit/use and Viewer read. Source/destination checks and workspace locks protect copy/mutations and role changes. System packs cannot be edited through workspace APIs. Existing session/Origin/no-store/error/request-ID controls remain. Pack mutations additionally enforce ninety requests/minute per actor/IP; ordinary API limits remain. Unknown private IDs are unavailable without revealing another workspace. No player catalog access, executable fields, remote images or arbitrary audio URLs exist.

## Database migrations

Added generated `0004_adorable_eternity.sql`, snapshot metadata and journal entry. It creates only content tables/indexes/constraints/triggers; existing migrations remain unchanged. Development and isolated test upgrades, repeated migrations, compiled migration runner and schema-drift generation were exercised. Actual PostgreSQL was 18.4. Compose/CI PostgreSQL 18.6 and Docker image execution were not available here.

## Indexes/constraints

Real workspace/user FKs, system slug uniqueness, owner/visibility consistency, valid game/status, archive consistency, positive unique per-pack revision number, same-pack deferred current pointer, bounded revision counts/schema/document shape and ordinary immutable revision trigger. Workspace/update/UUID, owner/game/status, game/category and season indexes match discovery access paths. Search is bounded SQL without a new search service or speculative full-text infrastructure. Final isolated aggregate inspection found zero orphan workspace packs and zero incorrect current-revision pointers.

## API changes

Added authenticated system `/api/v1/content-packs` list/detail/copy and scoped `/api/v1/workspaces/:workspaceId/content-packs` list/create/detail/save/archive/copy/import. Strict query/cursor/write/export parsing and safe error envelopes apply. Readiness additionally checks content schema and six seeded ready defaults; liveness remains independent. [Complete contract](CONTENT-PLATFORM.md).

## Audit events

`content_pack.created`, `.updated`, `.archived` and `.copied` share action transactions. Metadata contains IDs/name/revision references, never full prompt banks/answers or secrets. Existing activity presentation turns these names into readable text. Event-copy dependency creation also emits pack copy events atomically.

## Files added

`shared/content-packs.ts`; `server/db/content-schema.ts`; `server/content-packs/{built-ins,hash,seed,service,cli}.ts`; `server/api/content-packs.ts`; `scripts/content.ts`; migration/metadata above; `src/content/{PackPages,PackEditor,PackItems,PackChooser}.tsx`, `portable.ts`, `content.css`; `src/lib/useRevisionDraft.ts`; `tests/{content-packs,content-pack-socket}.test.ts`, `tests/integration/content-packs.test.ts`, `tests/browser/content-packs.spec.ts`; this report, audit, platform/pack/provenance guides.

## Files removed

None. Canonical content, local boards/storage format, useful source, artwork, historical reports and the original audio repair are preserved.

## Files materially changed

Central capabilities/types/Event contracts; schema exports; product API/readiness; narrow Room/socket frozen launch boundary; Event resolve/copy/preview; shared draft wrapper; setup/PartyProvider optional launch reference; Library/Original details/routes; explicit test preparation; package scripts and existing CI; the existing UI signup browser check’s rate-limit retry; README/architecture/database/Events/vision/roadmap. No auth implementation, scoring algorithm or audio source/controller implementation was changed.

## Dependencies added and justification

None. Existing Zod, Drizzle/PostgreSQL, React and Playwright are sufficient. No package install or lockfile churn occurred. npm audit reports zero vulnerabilities.

## Exact commands executed

Commands ran from `ruckus-app` with `/opt/homebrew/bin` first in PATH (actual Node 22.23.3). Task-owned compiled servers used 4312/4314/4316; the final isolated pair used 4314 for live tests and 4316 for browsers.

```sh
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:test:prepare
npm run content:validate
npm run content:diff
npm run content:seed
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run audio:validate
npm audit --audit-level=low
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
VERIFY_PORT=4316 node scripts/verification-app.mjs --compiled
TEST_ORIGIN=http://localhost:4314 node --import tsx --test tests/content-pack-socket.test.ts
TEST_ORIGIN=http://localhost:4314 AUTOPLAY_ORIGIN=http://localhost:4314 npm test
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/content-packs.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:4316 npm run test:e2e
npx prettier --write <changed supported source/docs>
npx prettier --check <changed supported source/docs>
git diff --check
```

Also ran the compiled migration runner and compiled content CLI (`diff`, `seed`, `seed`) with DATABASE_URL set in-process to the explicit isolated TEST_DATABASE_URL, plus safe aggregate version/integrity queries. No production target was contacted.

## Exact automated test results

| Check                                                            | Actual result                                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit suite without live origins, after Unicode guards            | **60 passed, 6 intentional skips, 0 failed**, 1.30 seconds                                                  |
| Complete live unit/socket/autoplay suite                         | **66 passed, 0 skipped, 0 failed**, 123.45 seconds                                                          |
| Complete real PostgreSQL integration suite, after Unicode guards | **18 passed, 0 skipped, 0 failed**, 4.09 seconds                                                            |
| Complete compiled Chromium suite                                 | **29 passed, 0 failed**, 7.1 minutes                                                                        |
| Final compiled pack browser cases after Unicode/long-word guards | **3 passed, 0 failed**, 23.0 seconds                                                                        |
| Final compiled alternate-pack socket case                        | **1 passed, 0 failed**, 1.02 seconds                                                                        |
| Typecheck / lint / final client+server build                     | PASS                                                                                                        |
| Built-in parity / explicit diff / repeat seeds                   | PASS; seven packs, exact defaults, no-op seeds unchanged                                                    |
| Compiled migration + production content CLI                      | PASS against isolated test database, including two repeat seeds                                             |
| Migration upgrade fixture / schema generation                    | PASS; historical rows unchanged; no schema drift                                                            |
| Axe WCAG 2 A/AA and 2.1 AA                                       | Zero violations on tested catalog/new-pack/editor/detail/setup surfaces                                     |
| Responsive layouts                                               | No overflow at 320, 390, 768, 1024 and 1440px on new tested surfaces, including a long unbroken description |
| Audio validation                                                 | PASS; 27 assets / 54 files / 4,750,034 bytes, unchanged                                                     |
| Dependency audit                                                 | Zero vulnerabilities                                                                                        |
| Browser bundle scan                                              | No database/email/server-auth secret configuration found                                                    |
| Changed-file Prettier / whitespace diff                          | PASS                                                                                                        |

The complete 66-case live and 29-case browser passes preceded only the final malformed item-ID rejection, Unicode-safe copy-name truncation and long-word wrapping refinements. After those changes, the full unit/integration suites and every affected pack browser case plus the selected-pack socket case were repeated against the final delivery build. No second complete 66/29-case run after these narrow refinements is claimed.

Earlier iteration failures included native-select/textarea test locators, a new socket assertion incorrectly reading an acknowledgement instead of the existing state broadcast, UI signup hitting the real eight-per-minute abuse limit, an interrupted host/browser run, and a rebuilt client invalidating open lazy-loaded assets. These were corrected without weakening production limits. The UI signup test now waits the real Retry-After and retries its visible form. Final browser runs use fixed assets throughout.

## All-six Original parity results

All six default banks pass 120,000 field-level prompt comparisons, including legacy topic filtering/fallback/wraparound. Existing live socket/autoplay and mixed Event suites exercise all six engines; the selected-pack socket test additionally verifies a real alternate Hotwire launch, compatibility rejection, unauthenticated creation rejection, reconnect and hidden answer-key behavior. Scoring/audio profile selection remain game-driven.

## Event pack verification

Real PostgreSQL checks pin a private Hotwire revision alongside legacy/default Room Temperature, edit the source afterward and inspect the unchanged persisted snapshot. Cross-workspace Event copy owns its private dependency. Archived sources block later launches. Browser acceptance joins an unauthenticated guest, launches the selected private pack, creates a two-pack Event, edits after launch and plays the original frozen question. Existing seven-segment Event socket tests retain audience/scoring/reconnect coverage.

## Browser results

The complete compiled run passed 29/29; final focused pack verification passed 3/3 after the last guards. New coverage exercises Library discovery, filtering, structured creation/reorder, ready saves/revisions, preview/export/copy/import, real standalone and Event guest launches, in-flight edits, conflict export/latest and tab recovery. Existing account, Studio, workspace, Event, responsive and native audio ownership cases remain included. Screenshots are ignored under `test-results/phase-4`.

## Accessibility results

New catalog/new-pack/editor/detail/setup pages use labels, live save/error statuses, keyboard reordering, focus styles and textual validation. Browser checks run Axe WCAG 2 A/AA and 2.1 AA plus overflow assertions at 320, 390, 768, 1024 and 1440px. Desktop/phone screenshots support visual review. This does not imply exhaustive assistive-technology certification.

## Performance/bundle impact

Client entry is approximately 94.15 kB gzip versus the hotfix’s 93.87 kB. Audio remains 11.29 kB gzip and the question library remains 16.24 kB gzip in separate lazy chunks. Pack routes, pack schema, chooser/editor primitives and the shared draft coordinator stay split; catalog lists fetch summaries, not item JSON. Compatible choices are paginated and fetched only on host surfaces. Event pack resolution batches distinct IDs; runtime reads no database per question. No server DB/auth/email configuration belongs in client assets.

## Known limitations

Rooms remain in memory. Optional tab recovery cannot guarantee durability before acknowledgement. Pack revision history is preserved without a history browser/rollback UI. No cross-editor merge, bulk authoring, CSV import, AI generation, public community packs, scheduling locks, marketplace, billing or entitlements were added. Only the existing Caption This scenes are supported. Default banks are preserved rather than comprehensively externally fact-checked. Technical safeguards are 500 items / 100 active private packs / 320 KB HTTP bodies / fifty-result pages; limits are not pricing plans. Historical rows remain retained; broad retention tooling is still future work.

No hosted deployment, physical phone/cellular, Safari/Firefox, real TLS/proxy/SMTP, Docker image, CI execution or PostgreSQL 18.6 verification is claimed. Existing public-release operational/security gaps remain. No new human audible listening was performed, and the procedural reference audio remains unapproved for public sonic release. Phase 3.5 native graph regression checks do not certify subjective sound quality.

## Recommended Phase 5

**Persistent Session History & Analytics:** store actual completed outcomes with workspace access/retention policy, then build useful host reports. Keep scoring/gameplay authoritative in the existing engine and avoid high-frequency gameplay database writes. No Phase 5 implementation is included.

Task-owned verification servers were stopped after checks. The original development server on 4310 and local PostgreSQL remain available, with development/test content migrations and explicit seeds applied. Changes remain uncommitted on the requested feature branch. Open Library → Content Packs for local review.
