# Phase 3.5 — Audio, Music & Game Feel

Implemented October 15, 2026 on `feat/phase-3-5-audio-game-feel` in `AVolatile/ruckus-development`. The initial tree was clean. No deployment, commit, remote change, production credential, schema migration or original portfolio/demo change was made. The existing development server on 4310 and PostgreSQL on 55432 were preserved; checks use the isolated compiled verification apps on 4312/4314 and the existing test database.

## Executive summary

Ruckus now has one lazy audio engine for standalone games and Events: host music/stings/countdown, quiet phone feedback, independent persistent music/effects controls, phase-aligned restoration, cue deduplication, fades, stacked ducking and safe autoplay/failure handling. All six Originals and scored/poll Studio share the same presentation boundary. Audio never owns game progression or scoring.

The included 27 original sample-free procedural assets are explicitly **pre-release references with `productionApproved: false`**. They ship provisionally in this artifact. Human audible/speaker/headphone approval was unavailable and is not implied by automated results.

## Pre-implementation audit

Reviewed Phase 0–3 reports, Room/Event timing and cue contracts, socket capability adapter, PartyProvider reconnect, HostRoom/PlayerRoom/controllers, routing/auth/settings, tests/CI, static delivery and preserved artwork. Standalone audio was a small muted sine-tone helper driven by React phase changes; Events skipped it. There were no music assets or shared preload/preferences system. [Audit](PHASE-3-5-AUDIT.md).

## Existing audio removed/preserved

Removed `src/lib/sound.ts` and HostRoom's phase/count-based oscillator calls and separate sound state/button. Replaced them with the centralized live provider and existing M shortcut. Historical archived portfolio material remains. No artwork, content pack, user board, Brand data or game implementation was removed. Existing room controls and visual signals remain; intro heading text now uses Ruckus cream to fix a contrast violation caught during audio UI testing.

## Audio architecture

`src/audio` separates orchestration/provider, gains, registry/scheduler, music, effects, preload, preferences, controls and profiles. A lightweight feedback publisher connects existing controller input/acknowledgement events without importing playback into PartyProvider. Settings load forms/preferences only; the engine/catalog load on live routes. [Detailed architecture](AUDIO-ARCHITECTURE.md).

## AudioContext and bus topology

One context per tab, created only on a trusted interaction. Per-source fade gains feed music volume → duck gain → master; host SFX and quiet phone UI have separate gains into master → protective compressor → output. User gain changes ramp 35 ms. Host music scale is 0.65, SFX 0.7, phone UI 0.24 before user volumes. No custom DSP or audio dependency was added. Compressor settings are protective, not a true-peak mastering claim.

## Semantic cue contract

`shared/audio.ts` defines `RoomView.audio`: stable room UUID, monotonic sequence, semantic names, server occurrence/phase timestamps, elapsed/remaining time, pause, stage and current/next approved profile identifiers. No filename/private answer enters the contract. Standalone phase adapters and Event parent metadata normalize to the same model. Event launch identity persists across segment engines. Existing Event cue compatibility remains. Creative voting no longer labels an already-closed collection as newly ANSWER_LOCKED at reveal.

## Cue registry

All 12 semantic cues are exhaustively mapped: LOBBY_ENTER, EVENT_START, EVENT_INTRO_ENTER, SEGMENT_INTRO_ENTER, QUESTION_OPEN, ANSWER_LOCKED, REVEAL_ENTER, GAME_RESULTS_ENTER, EVENT_LEADERBOARD_ENTER, INTERMISSION_ENTER, FINAL_RESULTS_ENTER and EVENT_END. Stateful beds reconcile separately. Late tolerances are 400–700 ms. Co-occurring meanings choose one accent by priority (reveal over lock, finale over leaderboard) to avoid a stack of stings.

## Game audio profiles

Six distinct Original beds plus neutral scored Studio. Poll/scoreless Studio uses the social Room Temperature bed with no tension or binary correctness signal. Hotwire/Odd/Studio have five/three-second warning/urgent thresholds; creative profiles three/two; Room Temperature disables tension. Unknown future profiles fall back to Studio. [Sonic design and complete cue/profile tables](SONIC-DESIGN.md).

## Authoritative timing strategy

Server phase elapsed excludes paused wall time. The client adds elapsed since receipt and starts a loop modulo its declared loop length. Cue age uses the snapshot's server clock, with further decode time checked before a one-shot. Countdown observes the existing remaining deadline, not an independent gameplay timer. This aligns presentation sensibly; it does not measure one-way transport latency or promise sample synchronization between devices.

## Reconnect/deduplication behavior

The first snapshot/new room/reconnect epoch establishes a baseline, consumes its sequence and restores only the current bed. A bounded 24-room sessionStorage cursor survives remounts with in-memory fallback. UUID identity avoids human-code reuse collisions. Party synchronization becomes ready only after identity/resume acknowledgement, preventing an early broadcast replay. Duplicate snapshots do not replay stings or restart loops. Background return also baselines the current sequence.

## Autoplay handling

Start, Enable sound and other trusted live interactions create/resume the context. Click listeners run after React control handlers; repeated gestures leave a running context alone. Locked/suspended/error states expose an actionable Enable/Retry button. There is no policy bypass or requirement to enable sound before playing. W3C/Chrome primary references are linked in the architecture document.

## Music controller

One current looping source and at most two retiring voices. The controller uses catalog loop points and phase offsets, skips identical tracks, stops/disconnects retiring sources, and disposes everything on disconnect/release. Host role is mandatory for music. Muted/disabled music leaves effects independently available.

## SFX controller

Host transition/countdown and private phone UI use separate bounded source pools, six each. Ended sources/gains disconnect. Phone selection is local; confirmation/vote/drawing submission follows successful existing acknowledgements. Per-kind 120 ms throttling and a 70 ms confirmation separation limit clutter. Correct/incorrect sounds require submitted scored trivia and server-permitted revealed correct data; no answers are derived from audio metadata.

## Crossfade implementation

Per-source linear gain ramps crossfade tracks over 360 ms, then stop old playback. Mute/end use short fades. Late async loads are generation/request checked before starting, preventing a superseded phase from resurrecting old music. The same-track guard avoids duplicate loop sources.

## Ducking implementation

Independent releasable requests stack by strongest attenuation, with 80 ms ramps. Start 0.4, reveal 0.22, leaderboard 0.3 and finale 0.25 multiply the selected music gain. Each request expires after its effect plus 120 ms. Pause contributes 0.16; releasing a sting cannot restore over a still-active pause. Cleanup cancels timers and releases all requests without modifying user volume.

## Countdown/tension implementation

A 100 ms observer emits at most one short pulse per remaining second/phase. It rechecks current phase/remaining time after decode. Pause, background, disconnect, muted/disabled SFX and stale asynchronous work suppress ticks. Creative warning is shorter; polls/social modes have none. No player countdown is mirrored around the room.

## Host controls

Compact live bar with master mute, expandable independent music/effects enable and styled volume sliders; existing M shortcut; actionable Enable/Retry. Account settings use the same account/browser preference key. Numeric volume text, native labeled fields and visible focus are preserved. The UI states that the host soundtrack belongs to this tab.

## Player controls

One small sound toggle and actionable unlock control. Phones play restrained local feedback, never background tracks or room stings. Device preference survives refresh; muted players can select, submit, reconnect and finish normally. No player account/membership is required.

## Preference storage

Version 1 localStorage, validated booleans/clamped volumes. Hosts use authenticated account scope via a non-authoritative tab hint, with capability/device fallback. Players have a separate device key. Defaults: enabled, music 65%, effects 85%. Invalid/blocked/full storage degrades to in-memory controls. No audio preference/token grants access; no cloud preference schema was invented. Same-tab controls share preference events. Other open tabs retain independent live settings; saved defaults apply on their next load, with no global output/device election.

## Asset loading/preloading

Same-origin content-hashed static files, strict catalog path/MIME/size checks, redirect rejection, immutable production caching. Two warm workers prioritize current stage, current profile/next transition and next profile. Phones warm three tiny UI effects. Compressed LRU 16 entries; decoded LRU eight; concurrent work deduplicates, and abort/epoch guards prevent stale decode cache resurrection. No soundtrack requests on public/account/Studio/Event editor/preview routes. Failed IDs back off 30 seconds and warn once with safe asset IDs.

## Audio asset provenance

`audio/assets.json` records every purpose, origin/author, creation date, generator, rights description, classification/approval, master/file hashes, codecs, bytes, levels, duration and loop bounds. `audio/ASSET-PROVENANCE.md` explains ownership/regeneration and provisional status. There are 13 beds and 14 effects, encoded in two formats. No downloaded recordings/samples/compositions or external generative music service was used.

## Procedural generation if used

Python/NumPy deterministic synthesis at 48 kHz stereo, committed seed/version/date and original sequenced plucks/bass/pads/synthetic percussion. Circular note tails support loop boundaries; effects have edge ramps. DC is removed, approximate RMS targets are music 0.105/effects 0.12, peak ceiling 0.72 before encoding. ffmpeg 8.1 uses Opus 64 kbps and MP3 96 kbps with output bitexact flags. Full regeneration produced identical manifest/content hashes with the same encoder. Lossless PCM masters regenerate into ignored `.local/audio-masters`.

## Licensing status

Original project-generated signals with no third-party samples/content licenses. Tool licenses are not presented as soundtrack-content licenses. No unrelated project assets are relicensed and no broad legal/commercial clearance certification is claimed. The machine manifest explicitly says `pre-release-reference`, `ships: true`, `productionApproved: false`. Replace/approve with documented commissioned ownership or a license covering bundled commercial SaaS/game distribution after rights review.

## Accessibility behavior

All essential timers, pause, submission, reveal, standings and actions remain visual. No audio-only answer clue or progression. Independent mute/volumes, labeled keyboard-operable controls, numeric values and focus styling. Tested Axe targets WCAG 2 A/AA and 2.1 AA. Audio adds no visual motion requirement; existing reduced-motion rules remain. The Hotwire intro heading contrast issue was corrected using existing cream rather than altering the game palette.

## Error/fallback behavior

Primary decode/network failure tries MP3; failed profile music tries neutral Studio, then silence. Unsupported contexts expose a quiet retry status. No audio load is awaited by gameplay or input completion. Aborted/stale work is ignored; failed IDs have bounded safe logging/backoff. Hidden/disconnected routes stop sources/ticks; route release clears buffers/timers. Context remains reusable for the tab. No user audio URL/upload/configuration is accepted.

## Files added

- `shared/audio.ts`.
- `src/audio/{AudioEngine,AudioProvider,AudioBus,AudioContext,AudioControls,AudioPreferences,useAudioPreferences,AudioPreloader,MusicController,SfxController,CueRegistry,CueScheduler,gameAudioProfiles,feedback,types,assetCatalog}` with `.ts`/`.tsx` extensions.
- `src/styles/audio.css`.
- `scripts/generate-audio.py`, `scripts/validate-audio.mjs`.
- `audio/assets.json`, `audio/ASSET-PROVENANCE.md`, 54 hashed Opus/MP3 files in `public/audio`.
- `tests/{audio,audio-engine,audio-socket}.test.ts`, `tests/browser/audio.spec.ts`.
- `docs/{PHASE-3-5-AUDIT,PHASE-3-5-REPORT,AUDIO-ARCHITECTURE,SONIC-DESIGN}.md`.

## Files removed

`src/lib/sound.ts` only: the centralized engine replaces its oscillator behavior. No useful data/artwork/history was removed.

## Files materially changed

Room and EventRuntime add presentation metadata; server static delivery adds immutable audio caching; shared RoomView gains optional audio. PartyProvider exposes synchronization epoch and publishes local/acknowledged feedback. Live routes mount AudioProvider; HostRoom uses its mute instead of local tone state; HostAuth remembers preference scope; AccountSettings adds preference controls; Resources sound copy is factual. Styles import audio and correct intro heading contrast. Event socket/browser tests add audio assertions; socket fixture refreshes the host snapshot before guarding a command after automatic Studio reveal. Browser fixtures share bounded Retry-After handling with the second-account isolation test, retaining real auth limits. The audio browser suite also checks that an open second tab retains its own settings while reload reads the saved defaults. npm scripts and existing CI add audio validation. README, Architecture, EventRuntime, ProductVision and Roadmap reflect delivery. No scoring/controller/Brand/auth authorization rule changed.

## Dependencies added and justification

No npm runtime/development dependency or lockfile change. Browser Web Audio APIs supply playback. Optional regeneration uses existing local Python/NumPy and ffmpeg; optional full decoded analysis uses ffmpeg. Builds/runtime/CI manifest validation do not require those tools. Local Node was 25.9.0; CI remains Node 22.

## Exact commands run

Commands ran from `ruckus-app`, with `/opt/homebrew/bin` first in PATH for Node/ffmpeg. Principal commands (targeted browser passes were repeated while fixing findings):

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run build:client
node scripts/verification-app.mjs --compiled
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
TEST_ORIGIN=http://localhost:4312 node --import tsx --test tests/event-socket.test.ts
TEST_ORIGIN=http://localhost:4314 AUTOPLAY_ORIGIN=http://localhost:4314 npm test
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/audio.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:4312 npx playwright test tests/browser/audio.spec.ts tests/browser/events.spec.ts
PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e -- --output=test-results/phase-3-5-final
PLAYWRIGHT_BASE_URL=http://localhost:4314 npx playwright test tests/browser/audio.spec.ts --output=test-results/phase-3-5-audio-final
/usr/local/bin/python3 scripts/generate-audio.py
node scripts/validate-audio.mjs --decode
npm run audio:validate
npm audit --audit-level=low
npx prettier --write <changed/new supported files>
npx prettier --check <changed/new supported files>
git diff --check
```

A local Python hash-comparison wrapper ran the full generator twice to verify deterministic output. Safe aggregate scripts measured catalog/file bytes and built chunk gzip sizes. No production service, real credential, SMTP send, install/force-peer change or deployment command ran. Earlier browser attempts caught gesture/control rerender interference, reset error status, and pre-existing intro contrast. A first full live run found the cross-socket Studio auto-reveal test race; the test now reads current host state before deciding to close. Overlapping live/browser runs also reached real signup abuse limits; final socket verification uses a separate process on 4314, while browser second-account signup now shares the existing bounded Retry-After policy. Those failures were investigated rather than hidden.

## Exact automated test results

| Command/check                                                                      | Actual result                                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                                | PASS, client/shared and server                                                                                      |
| `npm run lint`                                                                     | PASS, no warnings/errors                                                                                            |
| `npm test` without live origins                                                    | **40 passed, 5 intentional skips, 0 failed**, 1.04 seconds                                                          |
| `TEST_ORIGIN=http://localhost:4314 AUTOPLAY_ORIGIN=http://localhost:4314 npm test` | **45 passed, 0 skipped, 0 failed**, 123.31 seconds                                                                  |
| `npm run test:integration`                                                         | **12 passed, 0 skipped, 0 failed**, 2.70 seconds, real local PostgreSQL 18.4                                        |
| `npm run build`                                                                    | PASS, client and server                                                                                             |
| Complete pre-final browser run                                                     | **21 passed, 0 failed**, 7.8 minutes; before the added storage-failure case/final mixer polish                      |
| Final browser verification                                                         | Result recorded after the complete run                                                                              |
| Final targeted audio browser run after tab isolation                               | **5 passed, 0 failed**, 32.2 seconds, final compiled app; includes independent tabs and reload defaults             |
| `npm run audio:validate`                                                           | PASS, 27 assets, 54 files, 4,750,034 total bytes                                                                    |
| `node scripts/validate-audio.mjs --decode`                                         | PASS, all 54 files decoded; bounded duration/peak/DC and zero clipped decoded samples                               |
| Full generator regeneration                                                        | PASS, all manifest values and every encoded hash unchanged with ffmpeg 8.1                                          |
| Actual compiled asset HTTP response                                                | 200, audio/ogg, nosniff, public max-age=31536000 immutable                                                          |
| Axe / responsive checks                                                            | Zero WCAG 2 A/AA and 2.1 AA violations on checked surfaces; no overflow at the tested audio/previous product widths |
| Client bundle scan                                                                 | No database/email/server-auth secret configuration or libraries in browser JS                                       |
| Prettier / `git diff --check`                                                      | PASS on all 52 supported changed/new files; clean whitespace diff                                                   |
| `npm audit --audit-level=low`                                                      | Zero reported vulnerabilities                                                                                       |

New deterministic coverage includes all 12 cues/profiles, lateness/baselines/room-scoped cursors, pause timing, preferences, all standalone/Studio metadata, asset provenance/hashes, fake node topology, source reuse/retirement, stacked ducking, independent gains, phone role, failure/fallback, countdown suppression and stale async cleanup. Real socket coverage adds standalone semantic timing and extends the seven-segment Event flow through all six Originals plus Studio. Existing authentication/cloud/workspace/Brand/Event persistence, all engines/bots/scoring/capability reconnect and import/preview suites remain exercised. Browser source counts/state are instrumentation assertions, never audible quality claims. The full 22-case run preceded the final storage-listener adjustment; all five affected audio cases were then rerun against the final compiled app. This is not a claim of a second full 22-case command after that adjustment.

## Manual audible QA performed

**Not performed.** No human audible playback, speaker/headphone assessment, physical phone, Safari/iOS silent-switch or room-speaker check was available. Headless Chromium successfully decoded/started real buffers and checked logical sources/timing; this does not establish perceived loudness, musical quality, loop-click absence, fatigue, speech interference, leaderboard impact or finale impact. Original assets remain unapproved references for precisely this reason. Desktop and 390px live mixer screenshots were visually reviewed; this is separate from audible QA.

## Browser/device coverage

Automated Chromium desktop plus phone-sized contexts and existing mobile layouts. Audio mixer overflow checks at 320, 390, 768, 1024 and 1440 pixels; prior phone/host/layout/keyboard checks remain. Real host/guest contexts test gesture unlock, independent controls, volume persistence, quiet phone preference, countdown, refresh baseline, missing assets and unavailable Web Audio. The branded three-game Event checks distinct Original/Studio profiles, guest continuity, intermission refresh restoration and finale. No Firefox, Safari/WebKit, physical device, Bluetooth/HDMI speaker path or hosted HTTPS run is claimed.

## Audio payload sizes

27 logical assets / 54 physical files: **4,750,034 bytes** combined; **2,047,766 bytes** Opus primaries; **2,702,268 bytes** MP3 fallbacks. Runtime normally fetches only primary files; fallback downloads occur on failure, not as eager duplicate downloads.

A cold host lobby with Hotwire first warms **440,449 bytes** (lobby, intro, start/segment accents, Hotwire). With Studio next it is **583,717 bytes**. A conservative two-profile upper bound is below 663 kB in primary files. The same Hotwire set totals 597,412 bytes in MP3; unsupported-primary browsers may fetch both warmed primary bytes and requested fallbacks. Phone's three initial UI effects total **7,156 bytes**. Figures are catalog transfer bytes excluding HTTP headers; current/next warmup is intentional, not a complete catalog download.

| Incremental gameplay bed            | Opus bytes |
| ----------------------------------- | ---------: |
| Hotwire                             |    126,152 |
| Room Temperature / scoreless Studio |    161,920 |
| Sellout                             |    148,816 |
| Caption This                        |    174,232 |
| Odd One In                          |    155,181 |
| Scribble Shift                      |    139,371 |
| Scored Studio                       |    143,268 |

Shared stage beds are 137–166 kB each and fetched when relevant. The validator enforces a 6 MB complete dual-format pack budget. Decoded LRU bounds eight buffers (roughly 60 MB at maximum loop length/48 kHz stereo float), plus actively playing/briefly retiring buffers and bounded compressed cache; this is a bound estimate, not a physical memory-profile measurement.

## JS bundle impact

Final client entry is approximately **93.87 kB gzip** versus Phase 3 **93.76 kB** (+0.11 kB). The lazy AudioProvider/engine/catalog chunk is **11.00 kB gzip**; shared AudioControls **1.43 kB**; PartyProvider **14.65 kB** versus **14.49 kB**; global CSS **25.55 kB** versus **25.05 kB**. HostRoom is **5.52 kB gzip** after removing legacy tones. Audio bytes stay static and are not base64/inlined in JS. Engine/catalog/provider remain a lazy live chunk; preference controls are separately shared with settings. Public/editor network assertions verify no soundtrack requests. Server auth/database/email libraries remain server-only.

## Known limitations

Human audible/device approval remains pending. Reference music is algorithmic and intentionally small; subjective production polish is not claimed. Opus/MP3 fallback is implemented but real Safari codec/output behavior is unverified. No sample-perfect cross-device synchronization, network-latency measurement, cloud audio preferences or host-device election. Separate stage tabs can produce duplicate physical output; each has local controls. Browser cache/storage can be blocked; unpersisted settings reset on reload. Rooms still live in memory. No custom uploads/Brand soundtrack, microphone/voice, analytics/billing/profiles, distributed state or live deployment was added. CI/Docker/PostgreSQL 18.6 were not executed here; real local PostgreSQL 18.4 was used for persistence regression.

## Production asset recommendations

Before public release, conduct the full audible scenario matrix in SONIC-DESIGN.md: standalone Hotwire, creative voting, scored/poll Studio, three-game branded Event, late join/reconnect, pause/background, muted host/player, both volume extremes, speaker/headphone and physical iOS/Android. Evaluate loop seams, relative levels, fatigue, speech clarity and accent impact. Commission/clear an original final pack or document suitable commercial bundling terms, record listeners/devices/findings, and only then mark assets approved. Preserve cue/profile IDs to avoid gameplay refactoring.

## Recommended Phase 4

**Content Platform & Packs:** formalize reusable engines separately from content packs; curate scalable topic/seasonal packs; prepare metadata, versioning, discovery and future unlock/entitlement hooks without implementing billing. Audio profiles remain approved presentation metadata, not arbitrary external URLs or customer uploads. No Phase 4 implementation began.

Task-owned verification servers on 4312/4314 were stopped after checks. The pre-existing development server on 4310 and PostgreSQL on 55432 remain running. Changes are left uncommitted for review.

## Subsequent Phase 3.5 overlap hotfix

Manual listening found overlapping beds during creative games in a local host/player-tab setup. The [hotfix report](PHASE-3-5-AUDIO-HOTFIX.md) records the demonstrated source-ownership defect, tighter retirement and stale-request invariants, independent native source instrumentation and new verification. This remains Phase 3.5; Phase 4 has not started. Original audible approval remains pending.
