# Ruckus development roadmap

## Phase 0 — Product surface separation

Delivered public marketing, a host AppShell, stable guest/live routes, compatibility redirects and archived portfolio surfaces without redesigning Ruckus.

## Phase 1 — Real host accounts and cloud content

Delivered Better Auth email/password sessions, PostgreSQL migrations, server-enforced private board ownership, CloudBoardRepository, immutable revisions/optimistic concurrency, trustworthy cloud saves, explicit idempotent local import and real account-to-cloud-board-to-live-room tests. Rooms remain in memory and players remain account-free.

Before a public account launch, complete transactional email, verification and secure password recovery, actual HTTPS/proxy/device verification, backup/restore and retention/account deletion policies, production abuse controls and an independent security review. See AUTHENTICATION.md and the Phase 1 report for current gaps and actual verification.

## Recommended Phase 2 — Organization foundation

Organizations, memberships, shared workspace ownership and the first real Ruckus Brand Kit model. Build on server-enforced access and versioned boards; preserve private user content and account-free players. Do not couple branding to auth-provider internals. No Phase 2 models or UI are implemented in Phase 1.

## Later, based on real use

Shared template workflows, saved session history/analytics, entitlement-based packaging, billing and event passes. Free players, paid hosts, premium workplaces remains a direction, not finalized pricing. Player progression, cosmetics, marketplace, AI authoring and external integrations follow demonstrated demand.

Redis, durable room recovery and horizontal scaling require an explicit shared authoritative state design and capacity evidence; they are not implied by adding PostgreSQL for host content.
