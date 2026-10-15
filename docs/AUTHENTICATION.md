# Host authentication

## Choice and boundaries

Better Auth 1.7.8 is configured through its supported [Express integration](https://better-auth.com/docs/integrations/express), [PostgreSQL Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and generated schema. `server/auth/create-auth.ts` is the provider configuration factory; `config.ts` owns runtime database wiring. No password hashing, signed-cookie protocol or JWT implementation is hand-written. The browser uses the documented email/password endpoints with same-origin fetch; server libraries never enter the browser bundle.

Host signup/login/logout are real. No external SaaS or email-provider secret is needed for core email/password. Email is trimmed/lowercased consistently and constrained unique/normalized in PostgreSQL. New passwords require 12–128 characters; password managers/passphrases are supported without character-class rules. Login failures are generic; signup failure UI suggests signing in or choosing another email. No social provider is advertised.

`/api/v1/me` returns current host ID/email/name/emailVerified after database session verification. HostAuth resolves that session before rendering `/app`, restores it on refresh/focus, avoids stale refresh responses, and signals logout between tabs. API 401s remove protected content; optional draft recovery remains scoped to that account. Same-origin app-only `returnTo` paths are normalized and validated; external/protocol-relative/backslash/traversal destinations cannot redirect users away.

AppRoute protects every `/app` descendant. This is a UX boundary: API authorization always runs independently on the server. `/join` and active player routes never require host login or host chrome. Creating a new room checks the host session once at the socket adapter. Existing host/player tokens retain room-scoped control/reconnect, including when a host account session later expires. Logout revokes the account session but does not erase local Studio boards or room capability state. Rooms remain volatile in-memory state, not database entities.

## Sessions and cookies

[Database-backed sessions](https://better-auth.com/docs/concepts/session-management) expire after seven days and refresh after one day of use. Logout revokes the database row. Cookie caching is disabled so revoked sessions are checked against the database. Primary auth tokens are never written to localStorage or sessionStorage.

Production uses an exact `__Host-ruckus.session_token` name, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` and no Domain. Better Auth automatically prepends `__Secure-` when its automatic prefix switch is enabled, even for custom names, so the configuration disables that automatic prefix and explicitly sets secure attributes on all production cookies. This preserves the actual host-only prefix rather than producing a misleading double prefix. Local HTTP uses an unprefixed, HttpOnly/Lax cookie. Both production attributes and session restoration are integration tested. Cookie configuration follows the library's [custom cookie support](https://better-auth.com/docs/concepts/cookies).

## HTTP and abuse controls

Cookie-authenticated API/auth traffic uses the configured same origin. API Host must match APP_ORIGIN. Unsafe requests require its exact Origin and reject cross-site fetch metadata; no wildcard credentialed CORS exists. Better Auth's own origin/CSRF checks remain enabled. Post-auth API responses are no-store, have correlation IDs and consistent safe errors. Socket origin allowlists and room-token checks remain intact.

The existing per-process RateLimiter now also limits signup (8/minute/IP), sign-in (20/minute/IP), other auth requests (120/minute/IP/category) and API operations (300/minute/IP). These controls are local to the supported single process; there is no Redis or distributed abuse service. Untrusted forwarded headers are ignored. `TRUST_PROXY=loopback` is the only supported explicit proxy option; broader deployments require a reviewed proxy policy.

Auth requests have a streamed 16 KB limit, normalized credential input bounds, and the library's validators. Board JSON has a 320 KB request limit and strict envelope/shared schema validation. Malformed/oversized requests return safe errors. No passwords, tokens, DB URLs, board documents or credential payloads enter routine logs. Auth library logging is disabled; unexpected API failures log only a correlation ID.

Startup requires DATABASE_URL and a random AUTH_SECRET of at least 32 characters. Production additionally requires a public HTTPS APP_ORIGIN and rejects legacy REALTIME_ONLY split hosting. There is no weak secret fallback. `.env.example` contains names/explanations only; setup-generated `.env`, `.env.test` and `.local/` are ignored. Keep secrets stable between restarts and use an intentional rotation/revocation procedure.

## Operational release requirements

Verification, recovery and email transport are implemented below. Hosted delivery and deployment controls still require production validation.

Also complete production TLS/proxy/cookie validation on the actual domain, database/network hardening, backups/restores, retention and account-deletion policy, dependency patching, abuse monitoring and an application security review. There are no compliance/certification claims. Host account deletion and data-retention automation are not shipped; ordinary board deletion retains immutable revisions. The optional embedded development database is not a production distribution. Physical phones/cellular and live hosting are not verified by local browser tests.

## Verification, recovery and email

Verification, SMTP transport and password recovery are now implemented. Signup issues a branded verification email. `/verify-email` explicitly confirms through Better Auth. Tokens expire in one hour. Better Auth signs/validates the token and updates the user; a before-hook atomically consumes a SHA-256 delivery marker in the library's verification table to make replay fail. No custom signature/password crypto exists. A failed verification after consuming its marker requires a fresh resend. Verification does not create a new login session; personal workspaces are usable before verification. Organization creation, sending invitations and acceptance query verified identity on the server.

`/forgot-password` calls the supported generic request-password-reset endpoint. `/reset-password` chooses a new 12–128-character password using the library's expiring single-use 30-minute reset flow. Successful reset revokes all sessions. Both existent and absent addresses receive the library's same response. No temporary password, credential logging or account-token browser storage is introduced. Resend/reset requests have a separate five-per-minute/IP limit; invitations/acceptance and workspace creation have bounded per-IP and actor limits.

EmailTransport is a narrow provider-neutral send interface. SMTP requires EMAIL_FROM/SMTP_HOST and optional paired SMTP_USER/SMTP_PASSWORD; SMTP_PORT defaults to 587 and SMTP_SECURE can enable implicit TLS. Production requires TLS and rejects file/memory transports. Development defaults to files under ignored `.local/mail` (directory 0700, files 0600), never console URLs; tests inject memory capture. The isolated browser helper explicitly captures files. Open those local files privately to follow development emails. They contain sensitive development links and must never be committed, served or shared. A real SMTP provider can be configured without changing domain code.

Links always use validated APP_ORIGIN. Password/verification/invitation secrets are absent from application logs, audit metadata and localStorage. Global no-referrer policy avoids leaking token-bearing page URLs. Existing exact Origin/Host, HttpOnly/Secure/Lax production cookies, no-store private APIs and room capability boundaries remain. Unexpected library errors are mapped through its supported error hook to prevent fallback raw-error logging.

Production delivery, real-domain DNS/sender authentication (SPF/DKIM/DMARC), TLS/proxy/device checks, backup restore, retention/account deletion, monitoring, patch policy and independent security review remain operational release work. No provider credentials or actual hosted mail were used during implementation. Duplicate registration availability is not claimed to be enumeration-resistant. No certification claim is made.
