# Production runbook

No service was deployed by Phase 6. This is a release procedure to rehearse with the actual provider. A local test result is not permission to deploy, a backup service or a public SLA. See [release gates](PRODUCTION-SECURITY-REVIEW.md).

## Configuration and startup

Use Node 22+, PostgreSQL 18 and one always-on application instance serving pages/auth/API/Socket.IO on one exact public HTTPS origin. Required: NODE_ENV=production, DATABASE_URL, a stable high-entropy AUTH_SECRET (32+ characters), APP_ORIGIN, SMTP_HOST, EMAIL_FROM and EMAIL_TRANSPORT=smtp. Pair optional SMTP_USER/SMTP_PASSWORD. SMTP_PORT defaults 587 with required STARTTLS; SMTP_SECURE=true uses implicit TLS. PUBLIC_APP_URL should equal APP_ORIGIN. Never put secrets in VITE variables or command output. Production rejects unrelated origins, development/test database names, sample/repeated secrets and unsupported proxy policy.

TRUST_PROXY is absent by default; `loopback` is the only reviewed option. Your proxy must overwrite/append actual forwarding correctly and preserve public Host/Origin. Native socket upgrades use the same explicit loopback boundary. A proxy on a different network requires a reviewed code/policy change, not TRUST_PROXY=true. Test real cookies, forwarding, QR URLs, polling/WebSocket upgrade and phones before a pilot.

Optional bounded settings: HISTORY_WORKER_CONCURRENCY=2 (1–4), HISTORY_POLL_MS=1000 (100–30000), SHUTDOWN_TIMEOUT_MS=20000 (1000–60000), DRAIN_MODE=false. The worker shares ten application connections; the probe has one additional connection. Capacity planning counts **eleven per application process**, plus release/CLI/backup connections. Upload/body/room/player caps remain existing reviewed constants. Test startup requires matching explicit DATABASE_URL/TEST_DATABASE_URL with a local/CI `ruckus_test` name; it refuses an implicit development database.

Build with `npm ci` then `npm run build`. Release migration is explicit:

```sh
npm run db:migrate:production
node dist-server/server/start.js
```

Development source command: `npm run db:migrate`; server startup never syncs/migrates. The safe startup entrypoint emits sanitized configuration failure and exits nonzero. Docker starts Node directly rather than leaving npm as PID 1. Provider signal grace must exceed SHUTDOWN_TIMEOUT_MS.

## Migration release and rollback

1. Back up/verify the destination and identify active sessions. Review the additive SQL, journal and snapshots. Never rename/edit applied migrations or rewrite their ledger hashes.
2. Apply migration explicitly using the compiled artifact containing its `migrations` directory. One session advisory lock serializes release invocations; another migrator fails promptly. Statement/transaction deadlines are 120 seconds, lock acquisition ten seconds. A failed transaction rolls back; investigate before rerunning. Long index/table operations need a separate reviewed release plan.
3. Confirm `/readyz` returns 200 and the explicit default Packs exist. A fresh install additionally runs reviewed `content:diff:production` / `content:seed:production` commands; migration does not invent content or analytics. Do not seed over edited defaults without review.
4. The application verifies required journal timestamps/hashes, rejects gaps/duplicates, checks required history columns and default content. Too-old/incompatible schema leaves liveness up, readiness false and new launches/unsafe writes rejected. Future additional migrations are tolerated only under the release discipline of additive compatibility; destructive future changes require a new compatibility policy.
5. Prefer a forward fix. If rolling back code, keep the additive schema and queue; do not drop unprocessed work or run down-migrations. Older Phase 5 code can use the additive schema, but its own handoffs lack Phase 6 guarantees and it cannot drain the new queue. Restore Phase 6 processing deliberately. Never restart into a live game expecting recovery.

The local Phase 2 ledger had one pre-final-commit hash. A disposable install comparison found all 611 Phase 5 catalog objects identical. The only exception accepts that exact known hash **and** exact catalog fingerprint (excluding the new queue tables); fresh installs use normal hashes. Unknown drift still fails. No historical file/ledger was changed. Additional public-schema functions/extensions on that legacy installation can invalidate the attestation; investigate and produce reviewed evidence rather than bypassing the check. This exception is documented evidence, not a generic hash-ignore setting.

For a stuck migration, inspect `pg_stat_activity` and `pg_locks` through restricted DBA tooling (PIDs, waits and transaction age; avoid SQL/parameter dumps). Coordinate the blocking operator/transaction. Do not automatically terminate arbitrary user sessions, disable immutability triggers or delete journal rows. Retry the explicit command only after the blocker is understood.

## Health, drain and shutdown

`GET /healthz` is dependency-free liveness; `GET /readyz` additionally requires schema/default content/database durability settings and non-draining state. `/health`, `/api/health`, `/ready` remain aliases. No public metric counts/versions/topology. Readiness caches at most one second and uses a separate bounded probe pool. Configure provider process recycling against liveness, and use readiness separately for deployment/traffic decisions; database outage alone should not erase live rooms through a restart loop. Render's single health path is left as liveness for that reason.

To prepare maintenance, signal the actual Node PID with SIGUSR2 (or start DRAIN_MODE=true). Readiness immediately fails. New rooms/HTTP mutations pause; existing joins, reconnect and gameplay continue, read APIs/worker continue. Watch restricted `operations.snapshot` and wait for **all** active rooms/Events to end. There is no rolling multi-instance room authority; a Redis socket adapter would not restore it. Do not blindly route existing socket sessions to a replacement instance.

Send SIGTERM once ready to stop. The process stops listener/claims, ends any remaining rooms under existing early-end rules, disposes timers and prioritizes durable enqueue/in-flight work before closing sockets/pools. Repeated SIGTERM/SIGINT is harmless. Pending committed jobs recover after restart; expired processing leases recover after sixty seconds. A default twenty-second deadline exits nonzero with SHUTDOWN_TIMEOUT. Pre-enqueue work/active rooms remain vulnerable. Hosts must be told about scheduled interruption if rooms cannot finish within maintenance constraints.

## Queue diagnosis and recovery

```sh
npm run ops:history:production -- inspect
npm run ops:history:production -- retry SESSION_UUID
npm run ops:history:production -- prune
```

Replace SESSION_UUID with one inspected failed ID. Commands require protected server credentials and are not available to ordinary users. Inspect returns aggregate counts/oldest ages and at most fifty failed IDs/categories; never inspect/export payloads casually. Retry works only for failed jobs whose payload still exists, validates again and restarts a bounded eight-attempt cycle. Payload/hash mismatch requires diagnosis, not editing immutable results. Deleted/retired receipts cannot be bypassed by enqueue/retry. Prune processes at most 100 rows per retention category; the worker also runs bounded maintenance each minute. Pending/processing rows are never age-deleted.

During a DB outage, leave the healthy live process running. Cloud writes/new launches fail safely; existing play continues. Readiness becomes false. Restore database/network/TLS access, observe readiness recovery, pending age and completion logs. If a connection drops during a failure acknowledgement, the claim lease remains recoverable. Once enqueue committed, process restart cannot silently forget the job; before commit the bounded memory handoff can still be lost. Materialization, result audit and completion share a transaction, so lost acknowledgements are duplicate-safe. A background terminal-only query reconciles host feedback even if another process completes the job; it never joins the live timing loop.

Terminal failed jobs require operator response. Payload expires after thirty days; minimal failed rows after ninety. Completed payload is removed immediately; queue row after seven days. Minimal identity/hash receipts remain for workspace lifetime. See [retention](RETENTION.md) before any manual deletion. Do not issue a raw DELETE of history and then wonder why a queued retry recreated it; use the authorized confirmed API so its receipt is retired atomically.

## Backups and recovery expectations

Use managed encrypted PostgreSQL backups with protected access. Before a pilot, choose and record an explicit retention period (minimum suggested pilot starting point: daily backups retained seven days), enable PITR if offered, and **restore to a separate isolated destination before first use**. Verify accounts, memberships, source revisions, images, history, queue, receipt tombstones and migration compatibility, then destroy only the disposable restoration. Repeat at agreed intervals and before risky schema/retention changes. Local `pg_dump`/`pg_restore` tools were unavailable; no logical dump/restore or managed recovery result is claimed.

Database `fsync` must stay on. Readiness rejects fsync=off; enqueue/materialization explicitly use synchronous_commit=on. Provider storage/WAL and replica durability remain provider responsibilities. Application acknowledgements cannot compensate for unsafe database settings or lost storage. Do not turn durability settings off to improve the capacity numbers.

RPO for a process-only restart after committed handoff is no lost committed jobs while PostgreSQL remains durable/available; this is not a promise about database/storage failure. Persistent-data RPO/RTO depend on actual backup/PITR and restoration tests. Active rooms and pre-enqueue summaries have no crash recovery; RTO requires a new hosted session. No numerical contractual SLA is asserted. Deleted data can remain in protected backups until their retention expires; restored databases must preserve/reapply deletion receipts and agreed erasure records before serving users.

## Operating limits and first-pilot gate

One node, memory-only rooms, no transparent failover, no public metrics/admin endpoint, no guaranteed enqueue during prolonged DB outage, no durable email outbox, no self-service workspace/account purge and no broad capacity certification. Secure logs and operator access, alert on failed/aging jobs/pool saturation, patch dependencies and rehearse secrets rotation. Actual SMTP/DNS/TLS/proxy/device and protected DB backup/restore evidence are P0 pilot gates. Human visual/audio approval remains separate and pending. [Security classification](PRODUCTION-SECURITY-REVIEW.md) is the release decision record, not an unconditional production-ready label.
