# Ruckus development roadmap

## Phase 0 — Product surfaces

Delivered public marketing, host AppShell, stable guest/live routes, compatibility redirects and archived portfolio surfaces without redesigning Ruckus.

## Phase 1 — Accounts and cloud content

Delivered Better Auth sessions, PostgreSQL, private cloud boards, immutable revisions, concurrency protection, trustworthy saves and explicit local import. Rooms stay in memory; players stay account-free.

## Phase 2 — Secure collaboration and Brand Kits

Delivered email verification/recovery and provider-neutral email transport; personal/shared workspaces; Owner/Admin/Host/Viewer policy; expiring email-bound invitations; safe Phase 1 migration; shared Studio boards, workspace import and cross-workspace copy; append-only activity; versioned Brand Kits, private validated image storage and accessible static experience previews. The dashboard retains Ruckus branding. No live Brand publishing or Events domain is implemented.

## Recommended Phase 3 — Events & Experience Builder

Persistent workspace events, multi-game playlists, event-specific immutable Brand revision/asset snapshots, event launch orchestration, reusable event templates and preparation for session history. Define guest-safe snapshot delivery deliberately rather than publishing private workspace assets. Preserve existing host/player capabilities and the authoritative engine.

Before public account/collaboration release, complete actual SMTP/domain/DNS/TLS/proxy/cookie/device checks, backup restore, retention/account deletion, monitoring, dependency patch policy and independent security review. Local tests do not replace hosted validation.

## Later, based on real use

Session history/analytics, entitlements, billing/event passes, reviewed templates, SSO if warranted, player cosmetics/progression, marketplace, AI authoring and integrations. No finalized pricing or enterprise certification is implied. Redis/horizontal scaling need an explicit durable authoritative room-state design and capacity evidence.
