# Phase 6 Final Acceptance

October 17, 2026 · `feat/phase-6-production-reliability` · local PostgreSQL 18.4, Node 22.23.3 and Chromium.

This is the narrow acceptance follow-up to [Phase 6 implementation](PHASE-6-REPORT.md). The existing uncommitted work was preserved. The only product change in this pass is confirmation normalization in `DeleteRecap.tsx`. Authorization, API semantics, audit/cascades, Analytics, queue/receipt policy and destructive styles are unchanged. Additional changes are acceptance tests, a test command and this documentation. No commit, merge, push, deployment, dependency installation, operational schema change, production seed or Phase 7 work occurred. Disposable operator databases were created/migrated/seeded solely as test fixtures and dropped afterward. The user's development server on 4310, PostgreSQL on 55432 and downloaded backup were preserved.

## Human-reported issue

The instruction said “Type DELETE to confirm,” but only exact uppercase enabled deletion. Lowercase `delete` incorrectly stayed disabled. One shared boolean now checks `confirmation.trim().toUpperCase() === "DELETE"` for both the button and form submission. The visible instruction remains unchanged. The request still sends `{ "confirm": "delete" }` to the same independently authorized Owner/Admin endpoint.

## Delete confirmation verification

| Accepted      | Rejected        |
| ------------- | --------------- |
| `DELETE`      | `delet`         |
| `delete`      | `delete recap`  |
| `Delete`      | `yes`           |
| `dElEtE`      | `confirm`       |
| `" DELETE "`  | empty string    |
| `"delete   "` | whitespace only |

The browser test moves through all twelve values, checking the button after every edit. Enter on each invalid value sends **zero deletion requests** and the recap remains readable. Cancel restores focus to Delete recap; reopening focuses the input. An injected 503 preserves the lowercase confirmation, displays the specific retry message and leaves the recap intact. After removing the fault, lowercase Enter deletes it, shows acknowledged success, removes History/Analytics contributions and preserves the source board. API confirmation/role checks remain covered by the PostgreSQL suite.

At **320, 390, 768 and 1440px**, disabled and enabled states were captured separately: **eight PNGs, eight Axe scans, zero WCAG 2 A/AA + 2.1 AA violations**, and zero tested document overflow. Existing disabled opacity is visibly distinct; enabled background remains destructive red `#AD3027`. Agent inspection reviewed all eight rendered captures, including focus rings, wrapping and Cancel placement. No styling was changed. Automated/agent findings do not constitute comprehensive accessibility certification or human visual approval.

The browser skill was read. Its required Node REPL tool was unavailable, so the repository's Playwright/Chromium setup supplied actual rendered evidence; no in-app browser connection is claimed.

## Graceful shutdown architecture

The existing SIGTERM/SIGINT path marks the service stopping, rejects new unsafe work/socket mutations, stops accepting HTTP and worker claims, clears cleanup/observation timers, ends active rooms and disposes their timers. Qualified terminal summaries enter the bounded durable handoff. Shutdown then waits for handoff, in-flight worker/observation and HTTP/socket work, closes Socket.IO/Vite/connections and both database pools, logs completion and exits **0**.

The normal deadline is **20 seconds**, configurable from 1–60 seconds. Expiry logs `shutdown.deadline` with `SHUTDOWN_TIMEOUT` and exits **1**. The forced case deliberately used 1,000ms. Provider termination grace must exceed the configured deadline. A pending committed job need not materialize before a graceful exit; a running materialization is allowed to settle until the deadline. Its live lease is never released prematurely.

SIGUSR2 is a separate one-way drain transition: readiness fails; liveness, existing audience joins/reconnect/play, reads and worker processing continue; new rooms and unsafe HTTP methods are rejected. Restart leaves drain.

**SIGKILL has no graceful callback guarantee. Active rooms remain memory-only.** Graceful ending can save a qualified early-ended result; it does not persist or restore the room. An unfinished first round is unqualified. Crash before durable enqueue can lose an unconfirmed summary. Only an already committed handoff has durable recap recovery. There is no transparent rolling room handoff or crash result invented after restart.

## Operator test matrix

`npm run test:acceptance` launches **compiled `dist-server/server/start.js` child processes**, real authenticated hosts, anonymous Socket.IO guests, task-owned ephemeral ports and a newly created disposable PostgreSQL database. It executes the same strengthened process cases as integration mode, which separately starts source processes. No application fault hook was added. Row locks, POSIX signals and a local TCP fault proxy inject failures externally.

The final compiled matrix passed **16/16 cases**, zero skips/failures, **32.40 seconds**. It captured **29 compiled process lifetimes**: **24 clean exits (0), one deliberately forced deadline exit (1), and four deliberate SIGKILL terminations (signal SIGKILL, null Node exit code; shell equivalent 137)**. The table separates operator scenarios that share a test case. PASS means the observed exit/failure matched the stated expectation.

| Scenario                           | Setup                                                                                                       | Signal/failure injected                                                                                    | Expected                                                                                       | Observed                                                                                                                                               | Exit status                              | Recovery                                                                                | Result |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| A: idle SIGTERM                    | Ready compiled service; every health/readiness alias probed                                                 | SIGTERM                                                                                                    | Complete shutdown; release DB/listener                                                         | Completion event, zero connections for unique application_name, HTTP unavailable afterward                                                             | 0                                        | Fresh process starts normally                                                           | PASS   |
| B: idle SIGINT                     | Separate ready compiled service                                                                             | SIGINT                                                                                                     | Same deliberate lifecycle                                                                      | Same connection/listener/completion checks                                                                                                             | 0                                        | No work to recover                                                                      | PASS   |
| C: active qualified room           | Authenticated host, two anonymous guests, both submit; first of two rounds closes                           | SIGTERM before finale                                                                                      | Qualified early-ended recap; no live-room restoration                                          | One `ended_early` run with exactly one closed round; disposed process/listener/pool; old capability cannot resume after restart                        | 0                                        | One recap/job completion/audit after restart                                            | PASS   |
| D: pending durable recap           | Real Room Temperature completion; worker poll held at 30s; pending JSON committed and no recap yet          | SIGKILL then same-port restart                                                                             | Recover one exact outcome                                                                      | Exact live names/scores/sequential ranks, frozen run and segment provenance, one run/audit, completed job                                              | SIGKILL, then 0                          | Startup worker materializes once                                                        | PASS   |
| E1: materialization in progress    | Pending job; operator holds workspace lock; new worker claims it                                            | SIGTERM; release lock after 150ms, within lock/deadline limits                                             | Shutdown waits rather than closing pool under work                                             | Process still alive while blocked; release lets transaction commit and shutdown complete; zero remaining app connections                               | 0                                        | Job completed once                                                                      | PASS   |
| E2: forced deadline                | Separate pending job claimed while workspace lock held                                                      | SIGTERM with 1,000ms deadline; retain lock beyond deadline                                                 | Controlled nonzero timeout; preserve recoverable lease                                         | `SHUTDOWN_TIMEOUT`; no premature lease release                                                                                                         | 1, then 0                                | Release lock, advance only fixture locked_at by 61s, restart: one completed recap/audit | PASS   |
| F: active cloud/API request        | Authenticated board POST blocks on workspace row                                                            | SIGTERM; release lock after 100ms                                                                          | Request settles before pool close                                                              | HTTP **201**, followed by `shutdown.completed`; no uncaught driver failure                                                                             | 0                                        | Board transaction committed                                                             | PASS   |
| G: drain                           | Existing active room with guests                                                                            | SIGUSR2, then SIGTERM                                                                                      | Ready503/health200; reject new work; existing capabilities and worker continue                 | New room/auth write rejected; host resume, new anonymous join and player resume accepted; game finishes and job completes during drain                 | 0                                        | Durable recap available                                                                 | PASS   |
| H: DB outage + shutdown            | One committed pending run plus a second unclosed active round through a local fault proxy                   | Disconnect/reject DB TCP, then SIGTERM                                                                     | Health stays up, ready drops; live engine usable; clean shutdown without new qualified summary | Aliases health200/ready503; eligible guests submit real answers during the outage; host state/pause/unpause work; unsafe write503; no uncaught failure | 0, then 0                                | Restore proxy/restart: earlier committed job completes once                             | PASS   |
| DB outage during completion        | Real game through proxy                                                                                     | Drop DB before finale, restore within bounded retry                                                        | Finale acknowledgement remains fast; safe cloud failure; eventual handoff                      | Final acknowledgement under 1s, sanitized DB error, ready returns                                                                                      | 0                                        | Handoff and materialization finish after recovery                                       | PASS   |
| Startup DB refusal                 | Compiled process with loopback refused DB endpoint                                                          | Connection refusal                                                                                         | Process alive, cloud unavailable                                                               | Health200, ready503, unsafe API503 with request ID, no credential leak                                                                                 | 0                                        | No fabricated recap                                                                     | PASS   |
| Real worker retry                  | Durable job; hold workspace lock beyond 3s DB lock timeout                                                  | Actual PostgreSQL lock timeout                                                                             | Safe retry category, then success                                                              | `DB_TIMEOUT`, attempt1/result retry; release yields attempt ≥2 and one completion                                                                      | 0                                        | Existing job reused                                                                     | PASS   |
| Commit before host acknowledgement | Finish/enqueue; stop originating process execution before another worker commits                            | SIGSTOP origin; replacement worker commits; SIGKILL origin before observer acknowledgement                 | Lost host feedback cannot duplicate DB outcome                                                 | Run/audit/job complete once; restart sees same committed result                                                                                        | SIGKILL, surviving/restarted processes 0 | Recap remains exactly once                                                              | PASS   |
| Lease takeover + repeated END      | Issue END twice after final; first claimed worker blocked on workspace                                      | SIGKILL claimant; fixture lease aged 61s; second worker claims                                             | Fenced takeover; no duplicate terminal result                                                  | New worker commits once; old captured claim returns false                                                                                              | SIGKILL, then 0                          | One authoritative outcome                                                               | PASS   |
| Deleted recap + delayed state      | Materialized takeover run; authenticated DELETE                                                             | Replay original enqueue and captured old claim; restart again                                              | Tombstone wins; no resurrection                                                                | DELETE204; enqueue `retired`; old materialize false; run/children/job remain absent; one deletion audit with requestId only                            | 0                                        | Deleted receipt retained; no restored result                                            | PASS   |
| Crash before handoff               | Finish real game while workspace lock blocks enqueue                                                        | SIGKILL while app query demonstrably waiting for lock                                                      | Unconfirmed summary may be lost; no graceful completion claim                                  | Finale was immediate; after restart no receipt/job/run exists; no shutdown completion event                                                            | SIGKILL, then 0                          | **No recap recovered, intentionally demonstrating the loss boundary**                   | PASS   |
| Schema mismatch / recovery         | Fresh migrated disposable DB; corrupt only latest fixture migration hash                                    | Start incompatible; attempt migrator; then explicitly restore fixture hash and seed approved fixture Packs | Liveness only; no startup auto-migration; recover after operator repair                        | Health aliases200, ready aliases503, unsafe503; incompatible hash unchanged by startup; migration refused; explicit repair gives ready200              | 0; deliberate incompatible migrator 1    | Recovered readiness without app schema synchronization                                  | PASS   |
| Creative/privacy                   | Real Caption This inputs containing generated private canary text, real signed host cookie and capabilities | Normal SIGTERM before first round closes                                                                   | No raw submissions/credentials in logs; no invented history                                    | Generated canaries and actual secret/cookie/capability strings absent; controlled exit and zero connections                                            | 0                                        | Unclosed first round intentionally has no recap                                         | PASS   |

Lease-clock advancement is an explicit test-only SQL update in the disposable database; tests do not wait a physical minute or modify the production lease algorithm. SIGSTOP prevents the origin's host-feedback observer from acknowledging another process's committed recap. Recap creation and outbox completion are atomic; this does **not** claim an artificial crash window between those two writes. A separate PostgreSQL integration case retains the existing ambiguous acknowledgement/idempotent retry coverage.

## Exactly-once verification

Repeated terminal END, durable enqueue/restart, worker takeover and lost host acknowledgement produce one authoritative run and one relevant completion audit. The pending-restart case compares actual terminal standings and frozen source objects, rather than counting rows alone. Competing/stale claims are fenced by their claim UUID. Process-level old-claim replay returns false after replacement and after deletion.

Confirmed deletion removes run, participants, segments and job. The retained receipt has deleted_at, duplicate enqueue returns retired, and another restart cannot bring the data back. The deletion audit contains only its category and request correlation in metadata. The PostgreSQL role/cascade/Analytics tests and browser journey independently verify the same product result. No exactly-once claim is made for external email, uncommitted summaries or live room restoration.

## Health/readiness

| State                       | `/healthz`, `/health`, `/api/health` | `/readyz`, `/ready`           | Unsafe new work                               |
| --------------------------- | ------------------------------------ | ----------------------------- | --------------------------------------------- |
| Healthy                     | 200, exactly `{ "status": "ok" }`    | 200                           | Permitted subject to ordinary auth/validation |
| Drain                       | Same dependency-free 200 body        | 503                           | Rejected                                      |
| DB unavailable              | Same 200 body                        | 503                           | Rejected safely                               |
| Schema mismatch             | Same 200 body                        | 503                           | Rejected; no automatic migration              |
| DB/fixture schema recovered | Same 200 body                        | 200 after probe cache expires | Ordinary policy resumes unless drained        |

Readiness is single-flight with a one-second cache and its separate short-timeout pool. Drain is deliberately one-way. These probes do not expose room counts, schema details, secrets or versions. No hosted load balancer/proxy behavior was inferred from local HTTP.

## Log/privacy review

The final operator run captured stdout/stderr for all **29 compiled process lifetimes**, then scanned the actual generated authentication secret, database URL/password (encoded and decoded), signed cookies, capability values, guest-name canaries and real creative-submission canaries before writing any artifact. Additional checks reject PostgreSQL URLs, auth/bearer-cookie patterns, verification/reset token URLs, raw SQL query patterns, uncaught exceptions and stack traces. **No matches.** Private mail bodies/verification links were not emitted; no real mail provider was used. This checks observed outputs and known canaries, not every possible future provider/library log.

Agent review inspected representative emitted records for startup, readiness success/failure/recovery, drain, handoff, materialization, retry, API/DB loss, SIGTERM/SIGINT and forced deadline. Relevant categories included `DB_UNAVAILABLE`, `MIGRATION_REQUIRED`, `DB_TIMEOUT`, `ROOM_UNAVAILABLE` and `SHUTDOWN_TIMEOUT`. IDs and attempt/duration/result fields are useful without raw caller bodies. Signal-specific shutdown checks are associated with their separate child exits; shutdown log lines themselves use the shared category. Deletion accountability was inspected in the real `session.history_deleted` audit record; no new duplicate stdout deletion logger was introduced.

Sanitized local evidence is ignored under `.local/visual-qa/phase-6-acceptance/`: `process-logs.json`, `deletion-audit.json`, fresh `capacity.json` and eight deletion PNGs. `index.html` links these review artifacts. The prior implementation capacity measurement was preserved separately before running the unchanged harness again. Child secrets/session cookies remain only in test memory and are not written into that directory. The operator run's structured event review counted **29 process.started, 33 readiness.changed, 10 history.handoff, 10 history.materialized, 24 shutdown.completed, one shutdown.deadline and one actual materialization retry**. Four deliberately killed processes have no graceful completion event.

## Regression results

These are fresh commands for this follow-up, not copied implementation counts. All product code was built before compiled operator/browser execution.

| Final command/check                                          | Actual result                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                          | PASS, client/shared and server                                                                                                                                                                               |
| `npm run lint`                                               | PASS                                                                                                                                                                                                         |
| `npm test` without live origins                              | **81 passed, six intentional skips, zero failed**, 3.83s                                                                                                                                                     |
| Full live unit/socket/autoplay against isolated 4316         | **87 passed, zero skipped/failed**, 123.79s                                                                                                                                                                  |
| `npm run test:integration`                                   | **48 passed, zero skipped/failed**, 44.78s; includes all 16 source process cases and eight other Phase 6 DB cases                                                                                            |
| `node --import tsx --test tests/reliability.test.ts`         | **Eight passed, zero skipped/failed**, 2.34s; dedicated configuration, bounds, logging, disposal and handoff cases                                                                                           |
| `npm run test:acceptance`                                    | **16 passed, zero skipped/failed**, 32.40s; compiled children and privacy scan                                                                                                                               |
| `npm run build`                                              | PASS, client + server                                                                                                                                                                                        |
| Explicit `npm run build:server`                              | PASS                                                                                                                                                                                                         |
| `npm run audio:validate`                                     | PASS: **27 assets, 54 files, 4,750,034 bytes**, unchanged                                                                                                                                                    |
| `npm audit --audit-level=low`                                | **Zero vulnerabilities**, no install                                                                                                                                                                         |
| `PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e` | **40 compiled browser cases passed, zero failed**, 10.0 minutes                                                                                                                                              |
| Focused compiled deletion/pending/final journey run          | **Three passed, zero failed**, 12.0s; preceded the added disabled-state Axe checks, which the final full suite includes                                                                                      |
| `npm run test:capacity`                                      | PASS: 100 idle rooms, ten active Originals, five active Events, 450 guest entries; two workers completed 40/40 jobs in 959.78ms; no pool waiters; local synthetic observation, not a hosted capacity promise |
| Final normal journey after fault/regression suites           | **One passed, zero failed**, 5.3s, isolated compiled server on 4316                                                                                                                                          |
| Deletion responsive/accessibility                            | Four widths × two states; eight captures, eight Axe scans, zero tested violations/overflow                                                                                                                   |
| Changed-file Prettier / whitespace                           | PASS                                                                                                                                                                                                         |

The final normal journey signs out the generated fixture account, **logs in through the actual form**, launches/plays Room Temperature through real authenticated Socket.IO with two anonymous controllers, waits for committed feedback, opens History and the recap, reads real SQL Analytics (one occasion), deletes using lowercase Enter, sees success plus empty History/Analytics, and confirms SQL Analytics returns zero sessions. No recap/usage data is invented. Login, History, recap, Analytics and deletion are driven through the browser; gameplay in this case is driven by the existing real-socket helper. Other complete-suite cases retain ordinary host setup/launch and phone controls.

Initial added acceptance fixtures incorrectly assumed that a preterminal room already exposed a history ID, that unpause was a separate action, that DELETE returned 200, and that the SQL sequence column used its TypeScript name. An added outage attempt also correctly rejected a late arrival from answering the current round; the final fixture submits through already eligible guests after DB loss. Those assumptions were corrected to the existing public/DB contracts; no implementation was changed to satisfy them. An existing broad status locator was scoped to the deletion success notice because loading and success can coexist. Initial failed runs are not reported as passing. The final complete compiled operator and PostgreSQL results above include the exact-provenance assertions, real creative canaries and both graceful and forced paths.

Reproduction (from `ruckus-app`, Node 22 on PATH):

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run build:server
npm run test:acceptance
npm run test:capacity
npm run audio:validate
npm audit --audit-level=low
VERIFY_PORT=4314 node scripts/verification-app.mjs --compiled
# In a second terminal:
PLAYWRIGHT_BASE_URL=http://localhost:4314 npm run test:e2e
# A separate 4316 verification app was used for the full live suite:
TEST_ORIGIN=http://localhost:4316 AUTOPLAY_ORIGIN=http://localhost:4316 npm test
```

`test:acceptance` requires the compiled artifact and existing explicit local `.env.test`; the test helper creates its own disposable database. No production URL is accepted. Keep browser and live suites on separate verification ports to avoid shared process request limits.

## Remaining limitations

Active rooms remain memory-only. Crash can terminate active play, there is no transparent rolling room recovery, and pre-durable-enqueue crash can lose an unconfirmed summary. Graceful shutdown is bounded, not an unconditional guarantee under an unlimited dependency stall or forced provider kill. Only committed jobs recover; attempts are bounded and terminal failures require operator attention. Real provider storage durability/backup policy is outside these local observations.

Local PostgreSQL 18.4 and Chromium only. No Docker/PostgreSQL 18.6, CI execution, hosted SMTP/proxy/TLS, physical phone/network testing or new human audio listening. This narrow review preserves prior visual/audio approval boundaries. Existing retention defaults, incomplete account/workspace erasure, process-local limits and lack of a durable mail outbox remain. Hosted backup restore was not performed.

## External pilot gates

Local acceptance is separate from external-pilot approval. Still required:

- Hosted SMTP delivery and domain SPF/DKIM/DMARC verification.
- Actual TLS/proxy/cookie/origin behavior on the intended domain.
- Protected managed PostgreSQL, least privilege, network/TLS and storage policy.
- **Observed backup restoration**, with outcomes and recovery objectives recorded.
- Physical-device and real network/phone testing.
- Operator rehearsal on the intended production topology, including logs, drain, retry and termination grace.
- Reviewed data-removal/retention expectations and participant/export implications.

See [security gates](PRODUCTION-SECURITY-REVIEW.md), [runbook](PRODUCTION-RUNBOOK.md), [reliability boundaries](RELIABILITY.md) and [retention](RETENTION.md).

## Final conclusion

1. **Local technical acceptance:** **Yes, for the tested local artifact and the explicit durability/recovery limits above**.
2. **Automated/agent visual acceptance:** the narrow deletion change passes the stated responsive, focus, styling, Axe and rendered inspection checks; this does not approve every product surface.
3. **Human visual approval:** still required from Anthony; prior Phase 4.5B/5 and audio approval remain pending.
4. **External pilot approved from local evidence alone:** **No.** The external gates above were not performed.

Task-owned verification servers on 4314/4316 stopped cleanly after checks. The original 4310 development server and PostgreSQL on 55432 remain running. Final read-only test inspection reports PostgreSQL **18.4**, **nine applied migrations**, **zero failed outbox jobs** and **zero remaining disposable reliability databases**. Changes remain uncommitted on the requested branch; no deployment occurred.
