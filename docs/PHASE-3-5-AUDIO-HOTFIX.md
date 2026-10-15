# Phase 3.5 — Music overlap hotfix

Branch: `fix/phase-3-5-audio-overlap`. Initial tree was clean. This fixes Phase 3.5 only; no Phase 4 work, deployment, dependency installation, database migration, asset regeneration or game-rule change is included.

## Report and audit

Human listening found what sounded like trivia music underneath a slower creative bed in a local build, with a laptop host and a second browser tab as the player. Phone feedback sounded correct. Caption This and Scribble Shift were the reported creative examples.

Reviewed the Phase 3.5 report, audio architecture/sonic design, every production AudioContext/source creation and music-start call, provider/routes, cue registry/scheduler, profiles, standalone adapter, Event parent metadata and PartyProvider acknowledgement synchronization. There is one live-route provider with one shared engine per tab, and one production music-start caller: AudioEngine → MusicController. No legacy oscillator, HTML audio player or independent trivia/default soundtrack path remains. Warmup only fetches bytes. The Event parent exposes one normalized audio state; the inner engine does not separately play music.

## Demonstrated root cause

`MusicController.play` started the new looping source and its gain ramp **before** retiring the old bed and assigning the new voice to `current`. If retirement automation/stop threw, AudioEngine caught the error, but the new source had escaped both current and retiring ownership. It could keep playing alongside the old bed and could survive `dispose()`. Previous tests manually invoked ended callbacks and counted tracked references, so they did not detect an untracked connected loop.

A regression test injected a retirement gain-automation failure into the unchanged implementation: after `dispose()`, **one started source remained connected** (`1 !== 0`). It now passes with zero leaked sources. A separate engine-level case verifies the error is surfaced, all affected nodes are disconnected and Retry produces exactly one correct creative bed.

A second confirmed lifecycle defect: entering `ended` stopped current music but did not invalidate a pending gameplay decode. That load could start a stale bed before deferred room release. Ending/backgrounding/disconnecting now explicitly invalidate pending requests. Older same-room snapshots are also rejected before they can restore an earlier profile.

A third confirmed defect was the all-assets-failed path: when both the requested creative bed and its neutral fallback failed, reconciliation returned while the previous trivia bed stayed current. It now fades the previous bed to silence. Preparation/allocation errors also dispose previous music before surfacing Retry. Dedicated tests prove both paths.

The failure injection demonstrates a real ownership defect; the precise native/browser event that triggered the original listening session was not captured. It is not presented as a recording or diagnosis of that device's internal exception. The repair enforces the invariant across ordinary, delayed and failed transitions, and native Chromium checks independently verify the resulting graph.

## Enforced invariant

For a live unmuted host with available music, steady state has **one current bed and zero retiring beds**. There is one authoritative MusicController per tab engine. Players have zero music beds.

- Every allocated voice belongs to an ownership set before playback can start.
- Preparation/start/retirement failures stop and disconnect affected nodes before the error reaches the existing retry status.
- At most one previous bed retires alongside the current bed. A rapid third transition disposes the oldest retirement rather than accumulating loops.
- Crossfade remains 360 ms. Native stop and a matching cleanup deadline use the existing 20 ms stop grace. Cleanup cancels its timer, disconnects source/gain and removes ownership/retiring references exactly once. The deadline is tied to the fade, not an added gameplay delay.
- Requested track, request ID and room generation guard async starts. End/release/background invalidate pending work; stale lower-sequence snapshots cannot undo a newer profile.
- Reconnect establishes the current profile baseline, with no entrance replay. Pause/resume keeps the same bed at its existing ducked/restored level.

Muted, unsupported or unavailable audio can correctly have zero beds. Gameplay never waits for audio. No channels were blindly muted, no creative music was disabled and no per-game exception was added.

## Files changed

- `src/audio/MusicController.ts`: complete voice ownership, exception-safe preparation/retirement, bounded crossfade cleanup and counts.
- `src/audio/AudioEngine.ts`: stale snapshot/request invalidation, safe stop error handling, music diagnostics.
- `src/audio/{types.ts,AudioControls.tsx}`: non-sensitive engine/generation/request IDs, requested/current track and separate current/retiring counts as DOM data attributes. No visible debug panel.
- `tests/audio-engine.test.ts`: expanded from seven to twenty-two cases.
- `tests/browser/audio-support.ts`: shared room seeding plus a test-only native Web Audio probe, extracted from the existing audio spec.
- `tests/browser/audio-overlap.spec.ts`: standalone creative and mixed Event source-count checks.
- `tests/browser/audio.spec.ts`: imports the shared seed helper; its existing scenarios are preserved.
- This document, audio architecture and an additive link in the original Phase 3.5 report.

Audio assets/profiles, phone SFX, authoritative timing, scoring, Event progression, auth, Brand data and server implementation are unchanged. The user's existing server on 4310 and PostgreSQL on 55432 are preserved; verification uses task-owned isolated ports.

## Tests added

Deterministic tests cover Hotwire → Caption This/Sellout/Scribble Shift/Room Temperature; Caption This/Scribble Shift → Hotwire; repeated identical profiles; A → B → C with B's decode or fallback finishing last; stale snapshots; room end/release while decoding; creative reconnect baseline; pause/resume; rapid transitions; missed ended delivery; failed retirement cleanup and engine retry. They check native fake-source start/stop/disconnect records as well as current/retiring counts. Timer advancement proves retirement clears at the documented deadline without manually delivering ended.

Browser tests instrument native `AudioContext.createBufferSource`, loop/start/end/disconnect and context ownership, independently of engine diagnostics. Each steady checkpoint must have one connected playing host loop, zero retiring sources and one context. Direct Caption This, Sellout and Scribble Shift exercise pause and refresh. The mixed Event is **Hotwire → Caption This → Odd One In → Scribble Shift**, with checks at every gameplay/voting/results/leaderboard/intermission/finale transition and refresh during both creative games. Later targeted development checks add a real player tab in the same browser context, successful controller submissions and assertions that the player has zero native music loops.

## Exact verification

| Check                                           | Actual result                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Original ownership regression before repair     | FAIL as expected: one started source survived dispose                                                                       |
| Final audio-engine cases                        | **22 passed, 0 failed**, 0.92 seconds                                                                                       |
| Earlier complete live suites                    | **56 passed** then **58 passed**, no skips/failures, approximately 123 seconds each, before the last two failure-path cases |
| Database integration                            | **12 passed, 0 failed**, 2.37 seconds, real local PostgreSQL 18.4                                                           |
| Initial compiled native ownership browser cases | **4 passed**, 48.0 seconds                                                                                                  |
| Local Vite/StrictMode host + player-tab cases   | **4 passed**, 48.1 seconds, before the final all-assets-failed cleanup refinement                                           |
| Typecheck / lint / client+server build          | PASS                                                                                                                        |
| Audio validation                                | PASS: 27 assets, 54 files, 4,750,034 bytes; unchanged                                                                       |
| Dependency audit                                | Zero vulnerabilities                                                                                                        |

Final verification after the last cleanup refinement:

| Check                                           | Actual result                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` without live origins                 | **55 passed, 5 intentional skips, 0 failed**, 1.13 seconds                                                                                                    |
| Full live unit/socket/autoplay suite            | **60 passed, 0 skipped, 0 failed**, 123.51 seconds                                                                                                            |
| Complete compiled browser suite                 | **26 passed, 0 failed**, 6.8 minutes; preceded the last all-assets-failed/allocation-error cleanup refinement and added same-context player assertions        |
| Final compiled audio browser suite              | **9 passed, 0 failed**, 1.4 minutes, including the final two-tab creative cases and existing controls/fallback tests                                          |
| Final local Vite/StrictMode audio browser suite | **4 passed, 0 failed**, 54.0 seconds; host and player tabs share one browser context, players submit text/drawings with feedback enabled and zero music loops |
| Final build/typecheck/lint                      | PASS                                                                                                                                                          |
| Changed-file Prettier / whitespace diff         | PASS                                                                                                                                                          |
| Browser bundle scan                             | No server database/email/secret configuration found; lazy audio chunk 11.29 kB gzip, entry 93.87 kB gzip                                                      |

The full 26-case run and focused final runs are distinguished deliberately: no second full 26-case run after the last failure-only cleanup changes is claimed. The final 60-case run includes both new failure tests; all affected audio browser cases were repeated against the final compiled client.

Commands run from `ruckus-app` with `/opt/homebrew/bin` first in PATH:

```sh
node --import tsx --test --test-name-pattern='failed retirement' tests/audio-engine.test.ts
node --import tsx --test tests/audio-engine.test.ts
npm test
npm run typecheck
npm run lint
npm run build
npm run audio:validate
npm audit --audit-level=low
npm run test:integration
VERIFY_PORT=4312 node scripts/verification-app.mjs --compiled
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
VERIFY_PORT=4316 node scripts/verification-app.mjs
TEST_ORIGIN=http://localhost:4314 AUTOPLAY_ORIGIN=http://localhost:4314 npm test
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/audio-overlap.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4316 npx playwright test tests/browser/audio-overlap.spec.ts --output=test-results/audio-hotfix-dev
PLAYWRIGHT_BASE_URL=http://localhost:4316 npx playwright test tests/browser/audio-overlap.spec.ts --output=test-results/audio-hotfix-dev-final
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/audio.spec.ts tests/browser/audio-overlap.spec.ts --output=test-results/audio-hotfix-compiled-final
npx prettier --write <changed TypeScript/docs>
npx prettier --check <changed TypeScript/docs>
git diff --check
```

The first selected retirement test intentionally failed before the repair. Initial full live verification preceded additional race and failure-path unit cases; both final expanded counts and targeted follow-ups are distinguished in the results.

## Manual listening and remaining limits

The user's audible regression is real manual-QA evidence. **No new human audible listening was performed by the agent.** Chromium graph/source checks do not certify subjective overlap perception, composition, loudness or physical-device output. Safari/Firefox, physical speakers/headphones and the original browser's exception trace were not verified. The original procedural reference pack remains unapproved for public sonic release.

Reload an existing live stage before re-listening so any already-orphaned pre-hotfix AudioContext is destroyed. Then check standalone Caption This/Sellout/Scribble Shift and Hotwire ↔ Caption This transitions with the player tab's normal feedback enabled. No soundtrack was replaced or muted to conceal the problem. Separate host tabs still independently produce sound by design; this fix guarantees ownership within each live tab, not cross-device audio election.

Task-owned servers on 4312/4314/4316 were stopped after verification. The original development server (4310) and PostgreSQL (55432) remain running. Changes remain uncommitted on the requested hotfix branch.
