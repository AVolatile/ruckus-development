# Phase 2 preflight audit

The working tree was clean on `feat/phase-2-workspaces-brand-kits`. Reviewed Phase 1 documentation, auth/schema/migrations, API/origin/rate limits, board transactions, repository/provider, guarded routing, shell/settings/import, launch adapter, tests/CI and existing visual primitives before implementation.

Boards currently authorize directly by owner user. A same-board deferred revision FK, immutable history trigger, row lock/base revision and canonical hash already protect saves. Preserve these; migrate ownership to workspaces and retain creator provenance. The old API will delegate to personal workspaces. Existing JSON and local storage remain untouched.

Use a central capability policy with owner/admin/host/viewer. Hosts may delete and launch boards; viewers may read and copy into a writable destination. Admins cannot grant or alter ownership. Serialize membership and archive changes on the workspace row. Personal workspace creation belongs in a database trigger so every auth creation path is covered.

Use supported Better Auth verification/reset hooks, revocation after reset, provider-neutral SMTP and explicit development files. Production must reject development transports. Brand assets use a PostgreSQL store behind an interface, authenticated delivery, bounded raster decode/re-encode with Sharp. Brand revisions follow board discipline. Brand previews are static samples, never rooms; dashboard styling stays Ruckus.

Workspace URLs will be explicit `/app/w/:workspaceId/...`. Compatibility routes delegate to personal space. Settings must avoid connecting sockets; retain lazy live continuity for actual host/game transitions. No Events domain or deployment is included.
