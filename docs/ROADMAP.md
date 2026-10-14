# Ruckus development roadmap

## Phase 0 — Production product shell separation

Public product explanation, dedicated host AppShell, real local dashboard, Studio/Originals within `/app`, stable guest and live routes, compatibility redirects, honest account entry, and isolated portfolio presentation. No new authentication, persistence service, or commercial plans.

## Next — Authentication + PostgreSQL + CloudBoardRepository

Ship one vertical slice: a host creates a real account, signs in, saves a board to their private library, opens it on another device, and launches the same account-free multiplayer flow.

- Integrate a real host authentication provider and server-side sessions. Replace account-entry copy; protect AppRoute. Keep guest joining independent.
- Model users, boards, ownership and board revisions in PostgreSQL. Enforce ownership in the API, not browser route guards alone.
- Introduce an asynchronous CloudBoardRepository and UI loading/error behavior. Keep local export and an explicit, recoverable local-to-cloud migration path.
- Launch immutable validated board snapshots into the existing authoritative engine.
- Add minimal product analytics for host activation and repeat use, without inventing history or employee performance reporting.
- Validate account recovery, authorization boundaries, private board access, migration, and guest reconnect before expanding scope.

## Later, when product use supports the investment

Shared organization workspaces and memberships; shared libraries; reusable workspace/event Brand Kits; saved session history and reporting; entitlements and commercial packaging; billing and event passes. Free players, paid hosts, premium workplaces remains the direction, not finalized pricing.

Player profiles, progression, cosmetics, content marketplaces, AI authoring and external integrations follow proven demand. Redis, persistent room recovery, and horizontal scaling require demonstrated capacity needs and an explicit authoritative shared-state design. None belong in this shell refactor.
