# Ruckus sonic design — reference v1

The shared screen should pace the room without competing with conversation. Phones give restrained private confirmation. Sound reinforces information already visible; a muted host or player can complete every flow. The current original procedural pack is a **shipping pre-release reference**, not a human-approved commissioned soundtrack.

## Common vocabulary

Rounded plucks, warm bass, sparse sustained harmony and synthetic percussion share a small musical vocabulary. Lobby/intermission leave conversational space. Intro adds anticipation, reveal uses a short accent over a quieter bed, leaderboard moves forward, and finale has a distinct resolving accent and loop. There are no voices, real recordings, downloaded samples, recognizable songs or imitated product signatures.

| Profile               | Character in the generator                           | Tension policy                   |
| --------------------- | ---------------------------------------------------- | -------------------------------- |
| Hotwire               | Faster patterned plucks and clipped rhythmic pulse   | Final 5 seconds; urgent 3        |
| Room Temperature      | Slower social groove and more space                  | Off                              |
| Sellout               | Confident syncopation with a restrained low pulse    | Final 3; urgent 2                |
| Caption This          | Playful sparse phrase and relaxed groove             | Final 3; urgent 2                |
| Odd One In            | Offbeat pattern with contrasting upper notes         | Final 5; urgent 3                |
| Scribble Shift        | Light moving phrase and sparse percussion            | Final 3; urgent 2                |
| Scored Studio         | Neutral reusable bed compatible with authored topics | Final 5; urgent 3                |
| Poll/scoreless Studio | Reuses Room Temperature                              | Off; no binary correctness sound |

The generator parameters, tempo/note patterns and seeds are the reproducible specification; this table describes intent rather than verified subjective quality. Phase/stage meanings choose assets centrally. No profile depends on customer branding, prompt wording or content-pack filenames.

## Cue map

| Semantic cue            | Bed/accent                                                |
| ----------------------- | --------------------------------------------------------- |
| LOBBY_ENTER             | Lobby bed                                                 |
| EVENT_START             | Event-start accent; intro bed by stage                    |
| EVENT_INTRO_ENTER       | Intro bed                                                 |
| SEGMENT_INTRO_ENTER     | Segment accent; intro bed                                 |
| QUESTION_OPEN           | Current profile bed                                       |
| ANSWER_LOCKED           | Short collection-close accent; voting retains profile bed |
| REVEAL_ENTER            | Reveal accent, results bed, strong music duck             |
| GAME_RESULTS_ENTER      | Results bed or Event leaderboard stage                    |
| EVENT_LEADERBOARD_ENTER | Leaderboard entrance accent and bed                       |
| INTERMISSION_ENTER      | Conversational intermission bed                           |
| FINAL_RESULTS_ENTER     | Finale accent and resolving bed                           |
| EVENT_END               | End accent and music fade                                 |

When meanings co-occur, one accent wins by registry priority rather than stacking multiple stings: reveal beats lock, finale beats leaderboard, event start beats segment intro. Stateful music still reconciles. Refresh/reconnect restore only the current bed. Countdown ticks are short bounded signals, not a separate unsynchronized musical clock or endlessly accelerating alarm. Phones use quiet selection, acknowledged confirmation/vote and eligible revealed correctness signals; they never mirror room stings or music.

## Level and loop rules

All masters are 48 kHz stereo with DC removed. Music RMS is approximately 0.105, effects 0.12, waveform peak capped at 0.72 before lossy encoding. This is engineering normalization, not LUFS/true-peak mastering or an audible quality verdict. Conservative buses, smooth gain ramps, stacked ducking and protective compression reduce collisions. Loops wrap generated notes across boundaries and declare exact loop start/end; short effects ramp at their edges. The source catalog has 13 beds and 14 effects, with Opus and MP3 encodings.

Automated validation checks hashes, provenance, file/orphan inventory, declared loop bounds, size, duration and decoded peak/DC/clipping. It cannot certify musical taste, speech intelligibility, fatigue, seamless perceptual looping or device loudness. No audible manual playback approval was possible here. Before public release, listen through a complete branded three-game Event on laptop speakers, headphones, a room speaker and actual iOS/Android devices; inspect loops, repeated countdowns, pause/resume, refresh, background return, stings and independent mute behavior. Record device/browser, listener, date, levels and findings in the report before changing `productionApproved`.

Replace reference files through the static catalog/generator workflow while keeping semantic cue/profile IDs stable. Prefer commissioned original music with written ownership and SaaS redistribution terms, or a library license explicitly covering bundled commercial web-game use. Review actual terms before importing anything. Custom Brand audio and user uploads remain out of scope. [Asset provenance and regeneration](../audio/ASSET-PROVENANCE.md) · [Engineering architecture](AUDIO-ARCHITECTURE.md).
