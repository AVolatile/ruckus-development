# Ruckus development roadmap

## Phase 0 — Product surfaces

Delivered public marketing, host AppShell, stable guest/live routes, compatibility redirects and archived portfolio surfaces without redesigning Ruckus.

## Phase 1 — Accounts and cloud content

Delivered Better Auth sessions, PostgreSQL, private cloud boards, immutable revisions, concurrency protection, trustworthy saves and explicit local import. Rooms stay in memory; players stay account-free.

## Phase 2 — Secure collaboration and Brand Kits

Delivered email verification/recovery and provider-neutral email transport; personal/shared workspaces; Owner/Admin/Host/Viewer policy; expiring email-bound invitations; safe Phase 1 migration; shared Studio boards, workspace import and cross-workspace copy; append-only activity; versioned Brand Kits, private validated image storage and accessible static experience previews. The dashboard retains Ruckus branding. Events builds on this foundation.

## Phase 3 — Events & Experience Builder

Delivered persisted workspace events/revisions, mixed Original/Studio playlists, readiness/preview, six editable starters, immutable Event/board/Original/Brand/image launch snapshots, guest-safe copied imagery, one-room audience continuity, host progression, intermissions and cumulative placement points. Existing standalone engines/capabilities remain. Launch records prepare future history; live state remains in memory.

## Phase 3.5 — Ruckus Audio & Game Feel

Delivered a central lazy AudioEngine, normalized standalone/Event cues, all Original/Studio profiles, host phase-aligned music/stings, countdown, crossfades/ducking, quiet phone feedback, gesture unlock and independent persistent controls. Refresh/reconnect baseline prevents stale stings. The original generated pack is a shipping pre-release reference; human listening/device approval remains outstanding. See [report](PHASE-3-5-REPORT.md) and [sonic design](SONIC-DESIGN.md).

## Recommended Phase 4 — Content Platform & Packs

Formalize game engines separately from content packs. Add curated topic/seasonal packs, metadata, versioning and discovery, with future unlock/entitlement hooks and stable approved audio profile IDs. No billing implementation is included in this milestone.

Before public account/collaboration release, complete actual SMTP/domain/DNS/TLS/proxy/cookie/device checks, backup restore, retention/account deletion, monitoring, dependency patch policy and independent security review. Local tests do not replace hosted validation.

## Later, based on real use

Session history/analytics, entitlements, billing/event passes, reviewed templates, SSO if warranted, player cosmetics/progression, marketplace, AI authoring and integrations. No finalized pricing or enterprise certification is implied. Redis/horizontal scaling need an explicit durable authoritative room-state design and capacity evidence.
