# Reliability boundaries

Ruckus keeps one authoritative in-memory runtime per live room. PostgreSQL is never queried by timers, answers, votes, reactions or reconnects. Rooms are lost on process failure; this release does not add distributed room state or a public availability SLA.

## Completion handoff

A qualified terminal snapshot is validated against the Phase 5 schema (2 MB serialized limit, 50 played segments, 300 participant details). The detached bounded handoff queue has four enqueue operations and 128 waiting summaries. It retries after 250/1,000/3,000 ms. Gameplay publishes/acknowledges the finale immediately. Until the enqueue transaction commits, a process crash or prolonged database outage **can still lose that summary**. Saving is never proof of durability.

The enqueue transaction locks workspace → receipt, compares a canonical JSON hash and inserts one `session_history_outbox` record. `pending` means durable handoff committed, not a readable recap. The host sees Saving your recap and can Check recap. Missing-but-pending recaps offer an explicit retry. `saved` only follows committed materialization. Capacity, capture and handoff failures remain truthful; no success is fabricated.

A minimal `session_history_receipts` identity/hash record survives queue compaction. It prevents conflicting reuse, deletion resurrection and a new attempt cycle after terminal-job retirement. Undefined optional JSON properties are excluded from hashing, matching JSONB transport. No full content, player names or capability belongs in a receipt.

## Worker and recovery

The database owns queued work. The in-process worker claims one item at a time with `FOR UPDATE SKIP LOCKED`, bounded concurrency (default two, maximum four), a random claim UUID and a 60-second lease. Default polling is one second. It does not load a backlog into memory. An expired claim becomes eligible automatically, including after SIGKILL; startup starts polling without synchronously draining old work before serving traffic.

Each claim increments the persisted attempt count, including abandoned leases. Up to eight attempts use 1/2/4/8/16/32/60-second capped backoff plus 0–249 ms jitter. Invalid schema/hash is terminal immediately. Database outages during claim are logged; outages during failure acknowledgement leave the lease recoverable. No infinite retry loop exists. Exhausted work remains inspectable, and operators can explicitly retry an intact failed payload.

Materialization locks workspace → receipt → fenced job. Run, segments, participants, completion accountability event and queue completion commit in **one transaction**. Payload bytes are removed at that commit. A lost commit acknowledgement can be retried; immutable UUID/hash verification prevents duplicate recaps/audit. Tests also exercise a previously committed result with an unacknowledged queue entry. A stale claim cannot complete a replacement lease. A single-flight bounded terminal-state observation also reconciles local host feedback when a different process commits the job. Deletion takes the same lock order and retires the receipt before removing the run/job.

References: PostgreSQL [locking/skip locked](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE), [transaction and query deadlines](https://www.postgresql.org/docs/18/runtime-config-client.html). These mechanisms protect database work, not the availability of the host process or its disk/database service.

## Drain and shutdown

`SIGUSR2` enters one-way drain; `DRAIN_MODE=true` starts drained. Readiness becomes false immediately. New Original/Studio/Event rooms and unsafe HTTP methods (including account actions) receive a safe retry response. Existing room joins, reconnects and gameplay continue. Authenticated read APIs and the worker continue; the auth library may refresh a session during a read. Restart is required to leave drain. There is no unauthenticated control endpoint.

SIGTERM/SIGINT are idempotent: mark stopping/not-ready; reject further socket mutations/new joins and HTTP writes; stop accepting HTTP and new worker claims; end active rooms using existing qualified early-end rules; dispose timers; await bounded enqueue work and in-flight materializations; close Socket.IO/HTTP/Vite; close pools; exit. Pending durable jobs need not finish before exit. In-flight HTTP requests may finish within the deadline. A claim already in flight is allowed to settle; its lease is never released while its transaction still runs.

Default shutdown deadline: 20 seconds, configurable 1–60 seconds. Expiry logs SHUTDOWN_TIMEOUT and exits nonzero; remaining committed jobs recover by lease, but pre-enqueue summaries can be lost. Provider stop grace must exceed the configured deadline. Docker starts Node directly so it receives signals. No shutdown can fabricate an unobserved abrupt-crash outcome.

## Dependency and resource bounds

Application pool: ten connections, five-second connection acquisition, thirty-second idle connection expiry, five-second statements, three-second lock acquisition, ten-second idle-in-transaction and fifteen-second total transactions. PostgreSQL 18 is the supported target. Migrations use a separate invocation with 120-second statement/transaction/idle limits and ten-second lock timeout; review unusually expensive releases separately. [Pool behavior](https://node-postgres.com/apis/pool) informs sizing across application instances.

A separate single-connection readiness pool uses one-second acquisition, 750 ms statements and 250 ms lock waits. Probes are single-flight and cached one second. `/healthz` has no dependency fanout. `/readyz` checks migration compatibility, required history columns and six explicit default Packs; draining is independently not-ready. Legacy `/health`, `/api/health`, `/ready` remain aliases. Public responses contain no counts, package versions, schema names or topology. Application startup never migrates.

The room map caps at 500; each room caps at 30 concurrent players. Room and Event engine/bot timers are disposed, retired socket identities/channels are removed, and state dispatch requires exact current instance plus current capability. Completion notifications match run UUID, never room code. RateLimiter maps now cap at 10,000 buckets as well as expiry. Request bodies/uploads retain existing bounds. These are safeguards, not tested production capacity or entitlements.

A database outage prevents new authenticated launches/cloud work; existing room play stays available. Recap enqueue can recover if the database returns within its bounded handoff retries; only committed jobs have restart recovery. Email has bounded network timeouts but no durable delivery outbox. See the [runbook](PRODUCTION-RUNBOOK.md), [retention policy](RETENTION.md) and [operational security review](PRODUCTION-SECURITY-REVIEW.md).
