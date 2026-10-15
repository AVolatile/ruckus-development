# Ruckus Development

Turn any shared screen into something the room can play with. Ruckus combines six multiplayer Originals with Studio for custom trivia, True / False and polls. Hosts have real accounts and private cloud boards; players join from phones without accounts.

This is `AVolatile/ruckus-development`, the startup codebase. The original portfolio/demo repository is separate. Phase 1 adds Better Auth, PostgreSQL, owner-scoped cloud persistence, immutable board revisions and safe import of existing local boards, using the established Ruckus interface.

## Run locally

Use Node **22+** (minimum 20.19) and Docker Compose:

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

`setup:local` generates local-only secrets in ignored `.env` and refuses to overwrite an existing file. Open `http://localhost:4310`; signup creates a real host account. PostgreSQL is required. Migrations run explicitly, never as startup auto-sync. See [.env.example](.env.example), [database setup](docs/DATABASE.md) and [authentication](docs/AUTHENTICATION.md).

Without Docker, `npm run db:local` starts an optional real PostgreSQL development binary on loopback; leave it running in another terminal, then migrate/start the app. This fallback is for development only. Compose and CI pin PostgreSQL 18.6.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

The compiled Node application serves pages, authentication/API and Socket.IO under **one public origin**. Production requires `DATABASE_URL`, a random `AUTH_SECRET` and an HTTPS `APP_ORIGIN`. Never put secrets in `VITE_` values. The old unrelated Netlify/Render cookie topology is not supported; see [deployment](docs/DEPLOYMENT.md). No deployment is part of this phase.

## Tests

```sh
npm run db:test:prepare
npm run test:integration
npx playwright install chromium
# In another terminal: isolated test database/app on port 4312
node scripts/verification-app.mjs
# Or, after npm run build:
node scripts/verification-app.mjs --compiled
# Then:
PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e
TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test
```

Integration tests require explicit `TEST_DATABASE_URL` in ignored `.env.test`, restricted to a local/CI `ruckus_test` database. `db:test:prepare` creates that separate database from the local development cluster and migrates it; it never resets development boards. CI can supply its test URL directly. Without live test origins, three socket/autoplay tests intentionally skip. Autoplay takes roughly two minutes. Browser fixtures create real test accounts, not simulated sessions. Screenshots live under ignored `test-results/`.

## Product surfaces

| Surface              | Routes                                                                                                   | Behavior                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public               | `/`, `/product`, `/teams`, `/events`, `/pricing`, `/resources`                                           | Public product content; no realtime provider or question banks.                                                                                             |
| Account entry        | `/login`, `/signup`                                                                                      | Real email/password, session restoration and safe app return paths.                                                                                         |
| Host application     | `/app`, `/app/host`, `/app/originals/*`, `/app/studio/*`, `/app/library`, `/app/events`, `/app/settings` | Requires a valid server session. Cloud boards, templates, Originals and host tools.                                                                         |
| Future host sections | `/app/analytics`, `/app/workspace`                                                                       | Protected, clearly marked future capability.                                                                                                                |
| Guest player         | `/join`, `/room/:code/play`                                                                              | QR/room code, nickname, avatar and reconnect; no account.                                                                                                   |
| Live host stage      | `/room/:code/host`                                                                                       | Existing room capability token; no dashboard chrome. New room creation requires a host account, while live controls/reconnect retain room-scoped authority. |

Studio uses `/app/studio/boards/new`, `/app/studio/boards/:id` and `/app/studio/boards/:id/preview`. Legacy `/studio/*`, `/games/*` and `/host` redirects preserve suffixes, queries and fragments. See [architecture](docs/ARCHITECTURE.md).

## Working today

- **Six Originals:** Hotwire, Room Temperature, Sellout, Caption This, Odd One In, Scribble Shift.
- **Rooms:** 2–30 players, QR joining, phone controllers, scoring, leaderboards, moderation, bots, pause/resume and rematches.
- **Studio:** cloud drafts/autosave, 11 production starters, question libraries, validation, reordering, duplication/deletion, JSON/CSV import/export, previews and live launch.
- **Cloud integrity:** private ownership, immutable revisions, optimistic concurrency, visible save/error/conflict states and no-op save detection. Account settings show real identity and sign out revokes the server session.
- **Local import:** explicitly copy boards from `ruckus-studio-v1` into the signed-in account. Originals stay untouched; successful imports are idempotent and invalid entries are reported separately. A raw local backup export is available even if an entry cannot be imported.

PostgreSQL persists accounts and boards across browser/device changes. Active rooms still live in memory and cannot survive a server restart. The local repository remains for legacy recovery/import; authenticated Studio has one authoritative cloud copy. Unsaved cloud edits have a separate tab-local, account-scoped recovery cache, never a second authoritative library.

## Current boundaries

Email verification and password recovery are not configured; they are required before a public account launch. Organizations, memberships, Brand Kits, billing, subscriptions, persistent room recovery and saved analytics are not implemented. No social sign-in buttons or fake controls are shown.

Portfolio presentations remain [archived](src/archive/README.md); useful branding assets and existing local data are preserved. Phase 0 reports describe the earlier local-only product, not current authentication behavior.

Next milestone: **Organizations + memberships + shared workspace ownership + the first real Brand Kit model**, after addressing the [pre-public-launch gaps](docs/AUTHENTICATION.md).

- [Phase 1 implementation and validation report](docs/PHASE-1-REPORT.md)
- [Phase 1 audit](docs/PHASE-1-AUDIT.md)
- [Architecture/API/revisions](docs/ARCHITECTURE.md)
- [Database and migrations](docs/DATABASE.md)
- [Authentication and security](docs/AUTHENTICATION.md)
- [Product vision](docs/PRODUCT-VISION.md)
- [Roadmap](docs/ROADMAP.md)
