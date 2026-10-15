# Host authentication

## Choice and boundaries

Better Auth 1.7.8 is configured through its supported [Express integration](https://better-auth.com/docs/integrations/express), [PostgreSQL Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and generated schema. `server/auth/create-auth.ts` is the provider configuration factory; `config.ts` owns runtime database wiring. No password hashing, signed-cookie protocol or JWT implementation is hand-written. The browser uses the documented email/password endpoints with same-origin fetch; server libraries never enter the browser bundle.

Host signup/login/logout are real. No external SaaS or email-provider secret is needed for core email/password. Email is trimmed/lowercased consistently and constrained unique/normalized in PostgreSQL. New passwords require 12–128 characters; password managers/passphrases are supported without character-class rules. Login failures are generic; signup failure UI suggests signing in or choosing another email. No social provider is advertised.

`/api/v1/me` returns only current host ID/email/name after database session verification. HostAuth resolves that session before rendering `/app`, restores it on refresh/focus, avoids stale refresh responses, and signals logout between tabs. API 401s remove protected content; optional draft recovery remains scoped to that account. Same-origin app-only `returnTo` paths are normalized and validated; external/protocol-relative/backslash/traversal destinations cannot redirect users away.

AppRoute protects every `/app` descendant. This is a UX boundary: API authorization always runs independently on the server. `/join` and active player routes never require host login or host chrome. Creating a new room checks the host session once at the socket adapter. Existing host/player tokens retain room-scoped control/reconnect, including when a host account session later expires. Logout revokes the account session but does not erase local Studio boards or room capability state. Rooms remain volatile in-memory state, not database entities.

## Sessions and cookies

[Database-backed sessions](https://better-auth.com/docs/concepts/session-management) expire after seven days and refresh after one day of use. Logout revokes the database row. Cookie caching is disabled so revoked sessions are checked against the database. Primary auth tokens are never written to localStorage or sessionStorage.

Production uses an exact `__Host-ruckus.session_token` name, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and no Domain. Better Auth automatically prepends `__Secure-` when its automatic prefix switch is enabled, even for custom names, so the configuration disables that automatic prefix and explicitly sets secure attributes on all production cookies. This preserves the actual host-only prefix rather than producing a misleading double prefix. Local HTTP uses an unprefixed, HttpOnly/Lax cookie. Both production attributes and session restoration are integration tested. Cookie configuration follows the library's [custom cookie support](https://better-auth.com/docs/concepts/cookies).

## HTTP and abuse controls

Cookie-authenticated API/auth traffic uses the configured same origin. API Host must match APP_ORIGIN. Unsafe requests require its exact Origin and reject cross-site fetch metadata; no wildcard credentialed CORS exists. Better Auth's own origin/CSRF checks remain enabled. Post-auth API responses are no-store, have correlation IDs and consistent safe errors. Socket origin allowlists and room-token checks remain intact.

The existing per-process RateLimiter now also limits signup (8/minute/IP), sign-in (20/minute/IP), other auth requests (120/minute/IP/path) and API operations (300/minute/IP). These controls are local to the supported single process; there is no Redis or distributed abuse service. Untrusted forwarded headers are ignored. `TRUST_PROXY=loopback` is the only supported explicit proxy option; broader deployments require a reviewed proxy policy.

Auth requests have a streamed 16 KB limit, normalized credential input bounds, and the library's validators. Board JSON has a 320 KB request limit and strict envelope/shared schema validation. Malformed/oversized requests return safe errors. No passwords, tokens, DB URLs, board documents or credential payloads enter routine logs. Auth library logging is disabled; unexpected API failures log only a correlation ID.

Startup requires DATABASE_URL and a random AUTH_SECRET of at least 32 characters. Production additionally requires a public HTTPS APP_ORIGIN and rejects legacy REALTIME_ONLY split hosting. There is no weak secret fallback. `.env.example` contains names/explanations only; setup-generated `.env`, `.env.test` and `.local/` are ignored. Keep secrets stable between restarts and use an intentional rotation/revocation procedure.

## Before public account launch

Email ownership verification, outbound transactional email and secure password recovery are **not configured**. They must be implemented through Better Auth with a real email provider and tested before inviting public users. There is no fake verification/reset UI or temporary recovery bypass. Duplicate signup can still reveal availability through success/failure without email verification; do not claim enumeration-resistant registration.

Also complete production TLS/proxy/cookie validation on the actual domain, database/network hardening, backups/restores, retention and account-deletion policy, dependency patching, abuse monitoring and an application security review. There are no compliance/certification claims. Host account deletion and data-retention automation are not shipped; ordinary board deletion retains immutable revisions. The optional embedded development database is not a production distribution. Physical phones/cellular and live hosting are not verified by local browser tests.
