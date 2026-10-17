# Phase 6 reliability audit

Audit date: October 16, 2026. Branch `feat/phase-6-production-reliability`, clean baseline `accaeaf`, identical to main; Phase 5 merge verified. Local test PostgreSQL 18.4 has eight migrations. Development service 4310 and database 55432 are preserved. Full baseline unit/integration/build/browser/live commands were started before implementation; their completed results belong in the report.

Inspected Phase 5 report, History/Analytics/architecture/database/vision/roadmap/Event runtime guides; finalizer, writer, auth/environment, HTTP/errors, pool/migrator/journal, workspace policy/audit, source FKs/triggers, Room/Event timers and cleanup, socket adapter/broadcast, verification scripts, CI, Docker, Render and historical Netlify guide.

## Guarantees and gaps

- Runtime authority, scoring and timers are in memory. Closed-round counters create one bounded validated final summary. No database writes on answers, votes, ticks or reconnects.
- Phase 5 transactions atomically commit immutable results and one accountability event; UUID/hash protects duplicate commits. Same-code replacement dispatch already checks current Room identity and capabilities.
- Four writes plus 128 queued summaries and three retries are process-local. Any pre-commit crash loses work. Startup has no recovery. Three-second forced shutdown can interrupt writes; repeated signals repeat teardown. HTTP close callback is coupled to socket closure. This is production-critical.
- Pool: ten connections, five-second acquisition/connect limit, thirty-second idle timeout; only history sets statement/lock limits. General queries/idle transactions lack server deadlines. Ordinary outages are caught by API boundaries, but logs omit diagnosis.
- Readiness probes selected columns and six default packs; no migration hashes/version or drain state. Liveness exposes room counts. No controlled maintenance drain. New writes may run against a partial schema.
- Exact Host/Origin, Secure host-only production cookies, revocation, body bounds, strict schemas, scoped permissions, uploads and CSV escaping are established. Production env checks are scattered; NODE_ENV typos and test/development DB crossover need rejection. SMTP has no durable delivery outbox.
- Workspace archive retains all content. Hard deletion is absent: personal identity/membership and final-owner triggers, immutable revisions/snapshots/audit and no-action FKs prevent a safe ordinary purge. Account deletion is disabled/not exposed; ownership and audit attribution require a reviewed erasure design.
- History supports SQL DELETE cascade but no authorized API/confirmation. Retention is unspecified. A late durable retry must never resurrect an explicitly deleted recap.
- Logs mix safe generic text and small JSON objects; no shared allowlist/taxonomy/counters. Do not log Error objects, URLs, request bodies or player text.
- Room phase and bot timers are cleared on dispose; Event replaces/disposes its inner engine. Maps cap rooms at 500, guests at 30. RateLimiter maps are time-swept but have no cardinality bound. Vite and signal resources need deliberate teardown. No production memory profile exists.

## Implementation decisions

Purpose-built PostgreSQL outbox with validated payload/hash, bounded leases/attempts and atomic history-plus-completion commits. A minimal permanent workspace-scoped receipt records hash/deletion without player detail; completed payloads are compacted immediately and completed queue rows pruned after seven days. Failed payloads retained thirty days then compacted, failure metadata remains inspectable. Pending work never expires. No generic jobs or distributed room state.

A short asynchronous durable enqueue is distinct from committed recap materialization. Gameplay publishes immediately; before enqueue commits a crash/outage can still lose the summary. Never claim durable success before that commit. Graceful shutdown prioritizes enqueue and leaves acknowledged jobs recoverable. Add Owner/Admin confirmed individual hard deletion, transactional audit and receipt tombstone.

Use additive migrations only, explicit migration commands, journal hash verification and bounded probe pool. Add process drain, bounded shutdown, safe structured logs and aggregate snapshots in logs/CLI; no public metrics/admin endpoint. Room durability remains deferred with a single-node maintenance runbook. Hosted TLS/SMTP/backups and independent security review remain external release gates.
