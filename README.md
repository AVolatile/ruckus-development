# Ruckus Development

Turn any shared screen into something the room can play with. Ruckus combines six live multiplayer Originals with Studio for custom trivia, True / False, and polls. Players join from phones; the host runs the shared stage.

This is the active startup-development repository, `AVolatile/ruckus-development`. The original portfolio/demo repository remains separate. Phase 0 separates the public website, host tools, and account-free player experience while preserving Ruckus’s visual identity and working game systems.

## Run locally

Use Node **22+** (minimum supported: 20.19), then:

```sh
npm ci
npm run dev
```

Open `http://localhost:4310`. The combined development server serves the client and Socket.IO. Use the printed phone URL for LAN testing. Environment options are documented in [.env.example](.env.example) and [deployment notes](docs/DEPLOYMENT.md). No database or credentials are required.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Run browser tests against a running server on port 4310:

```sh
npx playwright install chromium
npm run test:e2e
```

Enable the existing live socket and bot integration tests with:

```sh
TEST_ORIGIN=http://localhost:4310 AUTOPLAY_ORIGIN=http://localhost:4310 npm test
```

Without these variables, three integration tests intentionally skip. Autoplay takes roughly two minutes. Browser screenshots go to ignored `test-results/phase-0/`, leaving the historical portfolio images untouched.

## Product surfaces

| Surface              | Routes                                                                                                                       | Current behavior                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Public marketing     | `/`, `/product`, `/teams`, `/events`, `/pricing`, `/resources`                                                               | Product explanation and host entry; no live-session provider or question banks.                                |
| Account entry        | `/login`, `/signup`                                                                                                          | Honest coming-soon screens; no credential collection or simulated authentication. Continue to open host tools. |
| Host application     | `/app`, `/app/host`, `/app/originals`, `/app/originals/:slug`, `/app/studio`, `/app/library`, `/app/events`, `/app/settings` | Dedicated AppShell, real local boards and templates, six Originals, host setup, Studio, and live launches.     |
| Future host sections | `/app/analytics`, `/app/workspace`                                                                                           | Clearly marked future features with working next actions. No invented data.                                    |
| Guest/player         | `/join`, `/room/:code/play`                                                                                                  | Room code/QR, display name, avatar, controller, and reconnect. No account required.                            |
| Live host stage      | `/room/:code/host`                                                                                                           | Existing full-screen stage and controls; no marketing or dashboard chrome.                                     |

Studio editor and preview routes are `/app/studio/boards/new`, `/app/studio/boards/:id`, and `/app/studio/boards/:id/preview`. `/app/studio/boards` is also available. Old `/studio/*`, `/games/*`, and `/host` URLs redirect without losing parameters, queries, or fragments. See the complete [route map and boundaries](docs/ARCHITECTURE.md).

## Working today

- **Originals:** Hotwire, Room Temperature, Sellout, Caption This, Odd One In, Scribble Shift.
- **Live rooms:** 2–30 players, shared-screen presentation, phone controllers, QR joining, authoritative scoring, leaderboards, pause/resume, bots, rematches, moderation, and reconnect.
- **Studio:** browser-local autosave, custom boards, validation, question libraries, 11 production starter templates, reordering, duplication, deletion, JSON/CSV import, export, two-screen previews, and live launch.
- **Host home:** real recent boards from this browser, Originals, and editable starter copies. Empty or unreadable libraries receive honest feedback.

Local storage still uses `ruckus-studio-v1`; existing boards are not migrated, cleared, or rewritten by the routing refactor. Export a backup before clearing browser data or switching devices. Live rooms remain in memory: reconnect works while the server and room are available, not across a server restart.

## Preserved and archived

Brand, campaign, recruiter case-study, and portfolio Editorial presentations are preserved in [`src/archive`](src/archive/README.md) and excluded from production routing. Campaign/identity artwork, generators, historical reports, and portfolio exports remain in source. The fictional Paper Moon employer template is archived outside the production starter list; previously saved user copies remain usable.

No organization Brand Kit editor or storage model existed in this checkout. Reusable branding primitives, board cover styles, avatars, and artwork are preserved for future workspace/event branding. Planned capabilities are never presented as customer adoption or implemented enterprise features.

## Next milestone

**Authentication + PostgreSQL + CloudBoardRepository vertical slice.** Phase 0 provides a host-only route guard insertion point, lazy host/player session boundary, and a preserved local repository. Authentication, cloud sync, organization membership, billing, subscriptions, and player progression are not implemented. Host tools remain intentionally open access.

- [Architecture and compatibility redirects](docs/ARCHITECTURE.md)
- [Phase 0 audit and classification](docs/PHASE-0-AUDIT.md)
- [Phase 0 change and validation report](docs/PHASE-0-REPORT.md)
- [Product vision](docs/PRODUCT-VISION.md)
- [Roadmap](docs/ROADMAP.md)
- [Netlify frontend + realtime deployment](docs/NETLIFY-PRODUCTION.md)
