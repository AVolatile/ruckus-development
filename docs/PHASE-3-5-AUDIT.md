# Phase 3.5 audit — Audio, Music & Game Feel

Initial branch: `feat/phase-3-5-audio-game-feel`; working tree clean. An existing development server on 4310 and PostgreSQL on 55432 will be preserved. Isolated verification uses other ports. No database schema, auth, Brand or game-rule changes are needed.

The only production audio is `src/lib/sound.ts`: a module-local AudioContext producing sine notes for join/reveal/winner/tick. HostRoom chooses these from React phase/player-count changes, starts muted, and does not persist volume or distinguish music/effects. Event stages explicitly skip it. There is no music, decoding/preloading, phone feedback, fade/duck or replay cursor. Archived portfolio copy documents this historical behavior and will remain archived.

Phase 3 EventRuntime exposes cue names, timestamps and sequence but standalone Room lacks equivalent metadata. Event creative voting currently labels ANSWER_LOCKED again at reveal; this will be corrected in semantic metadata only. Timers, scoring, joining and Event transitions stay unchanged. Normalized presentation metadata will add stable room identity, phase elapsed/remaining timing, profile/stage and next-profile hints, never filenames/private answers.

A single lazy live-route AudioProvider will own one per-tab engine. Shared host soundtrack and quiet phone UI feedback use separate policies, the same bus architecture and versioned local preferences. App account preferences have no cloud settings domain; host audio is therefore scoped to the last authenticated account in this tab, with a device fallback for capability-only hosting. Phones use device-local preferences. Audio storage never grants authorization.

Stateful opportunities: lobby, intro bed, question/voting, reveal/results, leaderboard, intermission and finale. One-shots: event/segment start, answer collection lock, reveal, leaderboard entrance, finale accent and end. Reconnect/refresh establishes a baseline, restoring only the appropriate loop at an authoritative phase offset. A room-scoped bounded cursor survives React remounts. Countdown reads existing deadlines and stops while paused/disconnected/hidden; no gameplay timer is added.

The host owns all room music/stings. Phones get throttled choice feedback and server-acknowledged submit/vote/drawing confirmation; optional correctness requires existing revealed correct-answer data. Music remains nonessential. Explicit gestures unlock/resume the browser context; unsupported or failed audio leaves gameplay usable.

No existing soundtrack assets exist. Deterministic NumPy synthesis and local ffmpeg can create original sample-free reference material with hashed Opus/MP3 assets, lossless regeneration, provenance and automated level/seam checks. It will be labeled a pre-release reference pack pending human listening; no commissioned-quality, physical-device or audible approval will be inferred from headless tests.

Inspection: Phase 3 report/Events/runtime docs; shared room/Event contracts; Room timers/phase/reveal/submit/bots; EventRuntime; PartyProvider/reconnect; HostRoom/PlayerRoom/EventLive/controllers; host auth/account/AppShell; route lazy boundaries; existing tests/CI/Playwright; static asset delivery. Web Audio implementation follows W3C node/automation lifecycle and Chrome's documented gesture/autoplay policy, linked in AUDIO-ARCHITECTURE.md.
