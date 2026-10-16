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

## Phase 4 — Content Platform & Packs

Delivered persistent system/private workspace packs, strict six-game schemas, parity-preserving defaults, discovery, structured authoring, immutable revisions and pinned standalone/Event content. Explicit validate/diff/seed tooling controls built-in releases. Topic compatibility and repaired audio remain intact. No billing or entitlements were added.

## Phase 4.5 — Host Experience & Visual Cohesion

Restores original-demo brand direction across authenticated host tools: shared working scale, lightweight shell, recoverable compact local import, content shelf/game accents, grouped editors and acknowledged feedback. See [visual audit](PHASE-4-5-VISUAL-AUDIT.md), [design system](HOST-DESIGN-SYSTEM.md) and [report](PHASE-4-5-REPORT.md). The first art-direction pass was rejected in human review; Phase 4.5B corrects page composition from the original Home/Games/Studio/Setup/Brand archetypes. Human approval is pending Anthony’s review. This is a presentation milestone; gameplay/audio and persistence semantics remain unchanged.

## Recommended Phase 5 — Persistent Session History & Analytics

Persist actual completed-session outcomes with clear workspace access and retention, then derive useful host reports. Avoid high-frequency gameplay database writes; keep the authoritative engine independent.

Before public account/collaboration release, complete actual SMTP/domain/DNS/TLS/proxy/cookie/device checks, backup restore, retention/account deletion, monitoring, dependency patch policy and independent security review. Local tests do not replace hosted validation.

## Later, based on real use

Session history/analytics, entitlements, billing/event passes, reviewed templates, SSO if warranted, player cosmetics/progression, marketplace, AI authoring and integrations. No finalized pricing or enterprise certification is implied. Redis/horizontal scaling need an explicit durable authoritative room-state design and capacity evidence.
