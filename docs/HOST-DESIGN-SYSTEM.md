# Ruckus host design system

Working primitives support the [original demo](https://ruckus-icebreaker-game.netlify.app/) art direction. They do not prescribe one page composition. The original repository, `AVolatile/icebreaker-game-project` at `2b077ff7b6f962cbe4be0eae4672da2506f4369f`, is the visual constitution. Phase 4.5's first art-direction pass was rejected in human review; Phase 4.5B corrects composition while preserving useful interaction fixes. **Human art-direction approval is pending Anthony's review.**

## ART DIRECTION CORRECTION / PHASE 4.5B

Choose the page's job, then its original archetype, before choosing components. The complete mapping is in [the visual audit](PHASE-4-5-VISUAL-AUDIT.md). `host-compositions.css` holds the route-specific editorial compositions; the shared design-system stylesheet retains control geometry, recovery, feedback and working-scale defaults. Neither stylesheet supersedes original source or rendered human review.

Library adapts Home's mixed emphasis: a dominant blue Originals invitation with the actual six game icons, orange material feature, green Studio band and paper ordered Event destination. Yellow is a small emphasis within the lead, not a repeated module fill. Packs inherit each actual parent game's icon, color and orbit, with authored title/flavor beneath and quiet provenance/counts. Events adapt Setup's numbered journey: paper starter compositions contain actual ordered game strips and the builder connects colored segment headers. Studio retains its native split invitation, tilted answers, authored covers and efficient workbench. Brand adapts the original identity specimens: saved display name/logo × Ruckus, actual palette and experience preview. Account and workspace controls remain restrained.

The silhouettes should differ even before reading the labels: editorial discovery, game collection, material covers, creative workbench, ordered show and identity specimens. A logo swap must not explain the composition. These are agent review criteria, not automatic proof of successful art direction.

On phones, Library's six-icon ensemble becomes a compact game strip; Packs keeps search/game visible with secondary filters disclosed; Event introduction steps become a short horizontal index and starter sequences remain vertical. At wider tablet widths, starter copy and sequence sit alongside each other. Utility fields remain upright and readable. No field rotation, fake illustration, popularity, pricing, gradient or dashboard framework is introduced.

## Scope and composition

`src/styles/host-design-system.css` is the final shared host layer, scoped under `.host-app`. It reconciles the inherited marketing/Studio/workspace styles through shared tokens and surface families. Public marketing, guest controllers and live stages are outside this scope. Content shelf/editor details remain in lazy `src/content/content.css`. No UI framework, icon package, animation library or runtime layout dependency is added.

Use `PageHeader` for restrained working-page hierarchy: eyebrow, one h1, concise support, optional actions and metadata. Account/workspace, creation forms and Pack editing can use it. Library, Originals, Studio, the Pack shelf/detail, Event list and Brand choose their own compositions. Editors retain specialized toolbars. Avoid adding marketing-scale heroes above working forms.

## Brand and type

| Token/tier                    | Value/use                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Paper / ink                   | `#F9F7ED` / `#191A24`                                                                                |
| Primary blue / feature yellow | `#2548F4` / `#F6ED51`                                                                                |
| Supporting palette            | Pink `#FFA9D2`, green `#C0EE7B`, orange `#FF7448`, sky `#A9D9F6`; color follows the page/content job |
| Display                       | `--host-display`: 40–64px; Home, Studio, Original/setup brand moments                                |
| Working page                  | `--host-page-title`: 34–56px; line-height 1.04                                                       |
| Section                       | `--host-section-title`: 26–36px; line-height 1.08                                                    |
| Card                          | `--host-card-title`: 22–28px; line-height 1.12                                                       |
| Body / support                | 15px / 14px; 1.6 body line-height                                                                    |
| Label                         | 13–14px, bold, explicit accessible name                                                              |
| Metadata / utility            | 12–13px; never the primary title                                                                     |
| Eyebrow                       | Existing compact letter-spaced brand label                                                           |

Use `clamp()` tokens, readable line lengths and deliberate wrapping. Normal titles wrap at spaces; `overflow-wrap: break-word` is a fallback for unusually long unbroken authored text. Pack titles no longer inherit a marketing h2 scale or `anywhere` fragmentation. Keep all title words available; no truncation conceals a pack's identity.

## Rhythm and geometry

Spacing steps are 4, 8, 12, 16, 24, 32 and 48px. Working sections use 32px vertical padding, 24px on phones. Gutters scale from 20px to 80px with a 1440px working container; Studio's three-column editing workbench can use 1600px. Grid gaps are 20px. Card padding is normally 20–24px.

Use `--host-border` (1.5px ink), `--host-radius` (10px), and `--host-control-radius` (8px). Keep geometry simple. Hard shadows belong to short hover/press feedback, not every idle utility box. Do not add a dashboard sidebar.

## Shell and navigation

The top header is about 80px on desktop and 68–72px in compact layouts. Originals, Studio, Library, Packs and Events have direct top navigation. Active routes have a blue label and visible underline, with `aria-current`. Workspace settings tabs also expose their active state.

The workspace strip uses paper with a fine divider. Account is a compact settings link; the full email stays on the account page. Mobile keeps the labelled Menu disclosure. Workspace choices are ordinary links so existing draft-navigation guards remain effective; Escape closes the workspace list and returns focus to its trigger.

Local import is a compact row, collapsed by default. Its labelled disclosure opens destination selection, raw backup export, explicit import, safe retry and per-entry results. “Not now” stores an account-scoped tab preference. Settings retains review access after dismissal. This preference never imports, changes or deletes local boards. A new tab can offer the reminder again. Unreadable libraries receive the same recoverable backup path.

## Card families

- **Originals:** retain all six accent colors, orbital artwork, expressive icons and numbered footer. Titles retain 28–32px collection scale and a 130px graphic area, rather than being reduced to generic utility-card sizing.
- **Studio:** keep authored cover colors, cover icons, question metadata and separate play/edit tools. Starter cards retain their established treatment.
- **Packs:** game-colored covers contain parent name, existing icon and orbit. Pack title/flavor lead the paper body; provenance and counts stay secondary, with a directional footer. No popularity, pricing or marketplace chrome.
- **Events:** paper starters pair real ordered, colored game strips with the occasion. No repeated yellow starter field. Connected builder segments retain native customization disclosures and visible reorder/duplicate/remove.
- **Library:** mixed editorial destinations establish a primary journey and explain the relationships among Originals, Packs, Studio and Events. New-board creation remains smaller than discovery.
- **Brand:** saved identity specimens, labelled real palette swatches and actual experience previews replace theme-form dominance. Workspace/account cards share the geometry without pretending to be games.

Use auto-fill grids to keep a single saved item at card width rather than stretching across an entire shelf. Cards keep their full content and expand for longer copy.

This applies to saved collections, not every route. Library uses a deliberate asymmetric composition; Event starters use copy/sequence pairings; Brand pairs saved identities and a preview. Do not normalize those into equal launcher tiles.

## Buttons and controls

Blue primary; ink outline secondary; transparent/text utility; existing red destructive; compact/icon variants retain their accessible names. Standard minimum height is 44px, with 12–18px internal spacing, responsive text wrapping and original arrows. Hover lifts 2–3px with a short ink shadow; press settles down. Focus remains clearly visible.

Text controls use 44px minimum height, ink outlines and 8px corners. Selects reserve 38px at the trailing edge for a 16px chevron placed 12px from the border. Their actual computed padding is browser-tested. Checkboxes, radios, color wells and audio sliders keep their specialized geometry. Two/three-column fields collapse to one column where useful. Do not use clipping to fix overflowing labels.

Pack metadata uses a numbered section and a divider rather than a large enclosing fieldset box. Search and game are the primary shelf filters; Category, Season, Difficulty and Source live in a labelled native “More filters” disclosure. URL-selected secondary filters open that disclosure automatically. Every existing filter and URL behavior remains available.

## Acknowledged feedback

`StatusBadge` is presentation only. Existing draft coordinators and API promises remain authoritative.

| State    | Treatment and source                                            |
| -------- | --------------------------------------------------------------- |
| Unsaved  | Amber, words; local edits differ from the acknowledged revision |
| Saving…  | Pale blue; request is pending                                   |
| Saved    | Green check; coordinator confirms all current edits             |
| Ready    | Green check; explicit validated readiness                       |
| Draft    | Quiet amber; persisted draft availability                       |
| Error    | Warm red, exclamation and specific recovery copy                |
| Conflict | Warm red, exclamation; preserve edits and offer export/latest   |

Badges use `role="status"`, polite live announcement and atomic text. A small 180ms check transition follows the acknowledged saved state; no timer invents success. `ActionNotice` receives a route-state message only after successful create/import/copy/archive requests. It is compact and dismissible, and does not replace resource validation or persistence. Existing detailed errors remain visible separately.

## Motion and accessibility

Motion duration is 160ms, with no delayed route interaction. The entire host scope disables transitions and animations under `prefers-reduced-motion: reduce`. Words and marks communicate state alongside color. Preserve semantic headings, form labels, keyboard operation, native disclosures and the existing skip link. Check WCAG 2 A/AA and 2.1 AA with Axe, then visually inspect: automated contrast/layout checks do not establish complete accessibility.

## Verification workflow

Run the isolated verification app before capture:

```sh
VERIFY_PORT=4312 node scripts/verification-app.mjs
node --import tsx scripts/host-visual-qa.mjs original
node --import tsx scripts/host-visual-qa.mjs final
```

For Phase 4.5B, use `VISUAL_QA_PASS=4.5b` with the existing harness. `current` preserves the unchanged first pass; `original` captures the actual hosted Home/Games/Studio/Setup/Brand; `final` writes the corrected matrix and first viewports. Optional `VISUAL_QA_ROUTES` and `VISUAL_QA_WIDTHS` support iterative checkpoints. After the matrix, run `node scripts/host-art-direction-qa.mjs states`, then `compare`. The latter generates desktop/phone original/current/corrected contact sheets and first-viewport comparisons under ignored `.local/visual-qa/phase-4-5b`. Do not publish session state, QA manifests or email verification links.

The local-only harness creates a real QA account with file-captured verification and representative persisted records on first use. It stores screenshots and fixture IDs under ignored `.local/visual-qa/phase-4-5`. Browser session state stays outside the development source root in an origin/repository-scoped private temporary directory (directory 0700, file 0600); never publish session or verification files. Use it against the task-owned local test server only. Delete the ignored QA manifest to provision a fresh fixture after changing origin or rebuilding the verification server with a new auth secret.

The final capture uses 320, 390, 768, 1024, 1280, 1440 and 1728px. It uses client navigation and a one-minute viewport cadence to respect real request limits. Inspect full images and focused viewport/detail images; a successful capture is evidence to review, not automatic design approval. Run `tests/browser/host-experience.spec.ts` for route clarity, migration recovery, full-word titles, select padding, acknowledged saves, error/conflict states and reduced motion.
