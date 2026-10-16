# Phase 4 pre-implementation audit

Initial branch: `feat/phase-4-content-platform`; working tree clean. No deployment or remote changes are authorized by this phase.

Original content currently lives in `server/content.ts`, augmented by `shared/content/library.ts`. Hotwire and Room Temperature concatenate both sources before topic filtering; Odd One In uses answer-bearing multiple choice; Caption This uses the fifteen existing numeric scene references. Selection filters by legacy `settings.pack`, falls back to the whole bank, and wraps by round plus a random offset. These details must remain identical after migration.

`Room` already accepts frozen prompts for Event segments. Standalone creation needs the equivalent per-game frozen input. Neither runtime should query packs during play. Existing engine answer redaction, timing, scoring, bots and the repaired audio ownership remain authoritative.

Events currently freeze inline banks at launch without persistent pack identities. Add optional pack references to definitions and pack identity/revision metadata to new snapshots; do not rewrite historical revisions. Legacy definitions must resolve seeded defaults using the original topic behavior. Cross-workspace Event copies must own any private pack dependencies.

Workspace locking, central capabilities, immutable JSONB revisions, deferred current-pointer constraints, authenticated API protection and the serialized Event draft coordinator are suitable foundations. Reuse them. Content remains separate from Studio boards and Brand Kits. Public and guest routes must never fetch catalog documents. Explicit validation/diff/seed commands replace neither migration review nor application startup.

Scope: six parity-preserving default packs, a small curated alternate Hotwire pack, private pack editing/discovery, copying/import/export, and standalone/Event launch integration. No dependencies, game rules, audio assets, billing, marketplace or distributed runtime are needed.

## Source inventory and preserved boundary

| Game             | Canonical inputs                 | Default count | Preserved contract                                        |
| ---------------- | -------------------------------- | ------------- | --------------------------------------------------------- |
| Hotwire          | TRIVIA + library multiple-choice | 169           | Choices, index, explanation, topic; speed scoring         |
| Room Temperature | MAJORITY + library polls         | 32            | Choices, topic; majority scoring, no answer key           |
| Sellout          | PITCHES                          | 12            | Text scenario; anonymous pitching/voting                  |
| Caption This     | SCENE_TITLES                     | 15            | Numeric existing scene plus context; captions/voting      |
| Odd One In       | BLUFFS                           | 10            | Existing multiple-choice truth selection and explanations |
| Scribble Shift   | DOODLES                          | 12            | Drawing prompt; existing drawing/voting controller        |

All six are content-driven at their prompt boundary; Caption This additionally requires its existing scene renderer. Duplicate inline library-to-question mappings are retained only in the canonical seed/parity adapter, not copied into new game engines. Rounds, pace, late joins, authoritative scoring and progression remain game settings. Name/category/season/difficulty/tags and item data belong to packs. Audio profiles remain game/stage driven and do not inspect pack metadata. Studio questions, Brand assets and Event launch assets retain their existing separate schemas.
