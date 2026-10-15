# Ruckus Development

Turn any shared screen into something the room can play with. Six multiplayer Originals meet Studio for custom trivia, True / False and polls. Hosts have personal and shared workspaces; players join from phones without accounts.

This is `AVolatile/ruckus-development`, the startup repository, separate from the original portfolio/demo. Phase 3.5 adds authoritative host music/cues, quiet phone feedback and persistent independent audio controls to branded multi-game Events, while preserving Ruckus’s identity and gameplay.

## Run locally

Use Node **22+** (minimum 20.19) and Docker Compose:

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://localhost:4310`. Setup creates ignored local secrets without overwriting configuration. Without Docker, leave `npm run db:local` running in another terminal; it uses real PostgreSQL 18.4, while Compose/CI pin 18.6. Migrations are explicit, never startup auto-sync.

Development verification/reset/invitation emails are private JSON files in ignored `.local/mail`. Open the link from the appropriate file; tokens are never printed. Production requires SMTP and rejects file/memory transports. See [.env.example](.env.example), [authentication/email](docs/AUTHENTICATION.md) and [database setup](docs/DATABASE.md).

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

The compiled Node service serves pages/auth/API/Socket.IO under one public origin. Production needs DATABASE_URL, AUTH_SECRET, an HTTPS APP_ORIGIN, SMTP_HOST and EMAIL_FROM, plus SMTP credentials where required. Never use VITE_ secrets. See [deployment](docs/DEPLOYMENT.md). No deployment is included.

## Product surfaces

| Surface              | Routes                                                                                        | Behavior                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Public               | `/`, `/product`, `/teams`, `/events`, `/pricing`, `/resources`                                | Public product content; no realtime connections or question banks                            |
| Accounts             | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`                   | Real sessions, verification and secure recovery                                              |
| Workspace app        | `/app/w/:workspaceId`, `/host`, `/originals/*`, `/studio/*`, `/library` beneath it            | Validated membership, role-aware board library, existing Studio and Originals                |
| Workspace management | `/app/w/:workspaceId/workspace`, `/members`, `/brand`, `/brand/:id`, `/activity`, `/settings` | General settings, membership/invites, real Brand Kits, bounded activity and account controls |
| Events               | `/app/w/:workspaceId/events`, `/events/new`, `/events/:id`, `/events/:id/preview`             | Saved lineups, immutable launches, branded stages and one-join multi-game flow               |
| Create/accept        | `/app/workspaces/new`, `/app/invitations/:token`                                              | Verified-email organization creation and matching-email invitation acceptance                |
| Compatibility        | `/app/*`, old `/studio/*`, `/games/*`, `/host`                                                | Deterministic personal-workspace redirect; suffix/query/hash preserved                       |
| Guests/live          | `/join`, `/room/:code/play`, `/room/:code/host`                                               | Account-free players, existing room capabilities and host stage                              |

Every account has one personal workspace. Existing Phase 1 boards migrate there without changing identities, revisions, content, timestamps or deletion state. Shared workspaces have Owner/Admin/Host/Viewer permissions enforced on the server. Local imports default to personal space with an explicit writable target; originals in `ruckus-studio-v1` remain untouched. Cross-workspace copy starts a new board and revision history.

Brand Kits persist names, colors, private uploaded logo/background and footer with immutable revisions/conflict protection. Owners/Admins manage; Hosts/Viewers read. Preview lobby, join/QR, leaderboard and results using labeled sample data. Branding does not reskin the app; Events pin the selected kit and copied imagery at launch. [Roles and invitations](docs/WORKSPACES.md) · [Brand Kits and assets](docs/BRAND-KITS.md).

Studio retains templates, question libraries, JSON/CSV import/export, serialized autosave, revision conflicts, unsaved recovery, previews and live launch. Six Originals, QR, phone controllers, scoring, moderation, bots, pause/rematch and reconnect remain. Rooms are still in memory and do not survive server restarts. Cloud acknowledgement is authoritative; optional tab recovery cannot guarantee durability of unconfirmed edits.

## Verification

```sh
npm run db:test:prepare
npm run test:integration
npx playwright install chromium
# In another terminal after npm run build:
node scripts/verification-app.mjs --compiled
# Then:
PLAYWRIGHT_BASE_URL=http://localhost:4312 npm run test:e2e
TEST_ORIGIN=http://localhost:4312 AUTOPLAY_ORIGIN=http://localhost:4312 npm test
```

Tests require an explicit isolated local/CI ruckus_test database; development data is never reset. Browser fixtures use real accounts and captured transactional email. Without live origins, five socket/autoplay tests intentionally skip. Screenshots and local mail remain ignored. CI extends the existing quality workflow and does not deploy.

## Boundaries and next milestone

No billing, subscriptions, analytics, account deletion, player accounts/progression, SSO or distributed room state is implemented. [Portfolio presentations](src/archive/README.md), original artwork and historical reports remain preserved. Before public release, verify actual-domain SMTP/TLS/proxy/cookies/devices, backups/restores, retention/account deletion, abuse monitoring and independent security review.

Phase 3 delivers **Events & Experience Builder**: persisted workspace lineups of Originals and Studio boards, six editable starters, immutable launch snapshots and guest-safe copied imagery, one room code through every game, host-led intermissions and a cumulative finale. Open `/app/w/:workspaceId/events`. [Events](docs/EVENTS.md) · [Runtime and scoring](docs/EVENT-RUNTIME.md) · [Phase 3 report](docs/PHASE-3-REPORT.md).

Phase 3.5 delivers **Audio & Game Feel**: one lazy Web Audio engine, all six game profiles plus Studio/polls, phase-aligned music, fades/ducking/countdown, reconnect-safe cues and separate host/phone controls. Start/Enable sound unlocks playback; M mutes the host. Account settings and the live mixer preserve music/effects preferences in this browser. Phones never mirror the soundtrack. Public/editor/preview pages fetch no soundtrack assets.

The 27 original procedural assets are a **pre-release reference pack** pending human audible approval. No sampled/downloaded music was added. Validate with `npm run audio:validate`; optional regeneration uses Python/NumPy and ffmpeg. [Audio architecture](docs/AUDIO-ARCHITECTURE.md) · [Sonic design](docs/SONIC-DESIGN.md) · [Provenance](audio/ASSET-PROVENANCE.md) · [Phase 3.5 report](docs/PHASE-3-5-REPORT.md).

Next: **Phase 4 — Content Platform & Packs**, separating reusable engines from curated/versioned topic and seasonal content, discovery and future entitlement hooks. Billing remains out of scope.

- [Phase 2 report](docs/PHASE-2-REPORT.md) and [audit](docs/PHASE-2-AUDIT.md)
- [Architecture/API](docs/ARCHITECTURE.md)
- [Database/migrations](docs/DATABASE.md)
- [Authentication/security](docs/AUTHENTICATION.md)
- [Workspaces](docs/WORKSPACES.md) and [Brand Kits](docs/BRAND-KITS.md)
- [Product vision](docs/PRODUCT-VISION.md) and [roadmap](docs/ROADMAP.md)
- [Historical Phase 1 report](docs/PHASE-1-REPORT.md)
