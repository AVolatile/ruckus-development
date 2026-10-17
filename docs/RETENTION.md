# Retention and intentional removal

This is a first-release product/technical policy, not a legal guarantee or compliance certification. Owners should agree on participant expectations before collecting confidential or employee-related results. Guest display names are session-local content; there is no cross-session player identity.

| Data                                          | First-release policy                                                                                    | Removal mechanism                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Session run, standings and segment aggregates | Retained while workspace exists unless explicitly removed; no time-based history expiry                 | Owner/Admin confirmed individual hard deletion               |
| Analytics                                     | Computed from remaining committed history; no separate personal analytics store                         | Naturally changes when history is removed                    |
| Pending/processing queue payload              | Retain until successful or terminal processing; never age-prune active work                             | Worker/explicit resolution                                   |
| Completed queue                               | Payload removed at completion; row eligible after 7 days                                                | Bounded minute maintenance, up to 100 rows per category/pass |
| Failed queue                                  | Payload eligible for removal after 30 days; metadata row after 90 days from last failure/operator retry | Same bounded maintenance; monitor before expiry              |
| Receipt/hash/deletion marker                  | Minimal deduplication retained for workspace lifetime; no player detail                                 | Future reviewed workspace purge                              |
| Workspace audit                               | Existing immutable accountability history retained with workspace                                       | No ordinary deletion API; separate future purge policy       |
| Boards/Brand/Packs/Events and revisions       | Existing soft deletion/archive and immutable revision policy                                            | No new content purge in Phase 6                              |
| Brand and launch images                       | Historical bytes remain retained under existing safeguards                                              | Future reviewed asset/snapshot cleanup                       |
| Auth sessions/verification                    | Existing library expiry/revocation and limited token lifecycle                                          | Library flows; expiry is not an account-erasure product      |
| Development email capture                     | Private ignored test/dev files; not a production email store                                            | Operator may remove its own obsolete generated local files   |

Retention intervals are explicit product defaults, not paid entitlements. Pending work never silently expires. A failed payload compacted after thirty days cannot be manually retried from the queue. A retired job cannot reappear from a duplicate enqueue: its receipt remains. Operators must investigate failures promptly. Fixed-size receipts intentionally grow with actual runs rather than retaining participant copies forever.

## Individual session deletion

`DELETE /api/v1/workspaces/:workspaceId/sessions/:sessionId` requires current Owner/Admin membership and `{ "confirm": "delete" }`, the existing exact Host/Origin protections and a valid session. UI says “Type DELETE to confirm” and accepts any letter case with surrounding whitespace trimmed. It offers Cancel with focus return, disables duplicate submission and preserves confirmation/error state after failure. No delete action appears for Host/Viewer; APIs enforce independently. Missing/cross-workspace runs are non-enumerating.

The transaction locks workspace and receipt, records a deletion tombstone, removes any job and deletes the run (participants/segments cascade). One `session.history_deleted` audit event stores only target UUID and request correlation, not guest names, scores or source content. It commits with deletion. A late worker/retry cannot resurrect the recap. Source boards/Packs/Events and all other sessions remain untouched. Analytics immediately uses the remaining rows; an already-open browser needs a new request. An exported/downloaded CSV or offline screenshot cannot be remotely erased. No bulk deletion or retention scheduler for history is included.

## Workspace dependency map — archive is not deletion

No workspace hard-delete product is implemented. Existing archive changes access/selection and preserves everything. Ordinary SQL deletion is intentionally blocked; **do not disable triggers or assume history's CASCADE purges a workspace**.

| Parent/dependency                                     | Current behavior/blocker                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Workspace identity/personal membership                | Personal workspace deletion and identity changes are prohibited by triggers                      |
| Members/invitations                                   | Workspace and user no-action FKs; personal immutability/final-owner protections                  |
| Boards → board revisions/current pointer              | No-action workspace/creator FKs, same-board deferred pointer and immutable UPDATE/DELETE trigger |
| Brand Kits → revisions → image IDs                    | No-action workspace/creator FKs, immutable revisions; historical assets retained                 |
| Brand assets → launch copied assets                   | No-action workspace/creator/source-asset references; separate historical bytes                   |
| Events → revisions → launch snapshots → copied assets | No-action FKs, immutable revisions/snapshots/assets and same-entity pointers                     |
| Private Content Packs → revisions                     | No-action workspace/user FKs and immutable revision trigger; system Packs are separate           |
| Session runs → segments/participants                  | Workspace CASCADE exists, child CASCADE works; source IDs deliberately have no lifetime FK       |
| History receipts → outbox                             | Workspace CASCADE and receipt/job CASCADE, but other domains still block workspace deletion      |
| Workspace audit                                       | Workspace/actor no-action FKs and immutable UPDATE/DELETE trigger                                |

A future purge requires a reviewed domain-specific privileged operation: drain affected live rooms and queued work; validate actor/ownership and export expectations; explicitly retire/cancel queued outcomes; delete children in dependency order under deliberate trigger/policy changes; remove attribution/account references as agreed; keep a minimal separately retained purge accountability record outside the deleted workspace; remove the workspace only at the end. Test rollback and a full fixture graph before exposing that capability. There is no generic cascade or hidden operator purge command here.

## Account deletion boundary

Better Auth account deletion is not enabled/exposed. Revoking sessions/logging out does not delete content. Personal workspace ownership, shared final-owner transfer, creator/revision authors, invitation/membership references, asset provenance, launch attribution and immutable audit actors require an explicit design. History alone permits host attribution to become NULL without rewriting results; other domains may still prevent deleting the user. A future library-backed account erasure flow must transfer shared ownership or fail safely, settle personal workspace retention, redact/null attribution through reviewed constraints, revoke sessions and separately communicate exported-copy limits. No casual direct auth-table delete is safe.

No history auto-expiry, workspace retention setting, account erasure or contractual retention claim is added. Those gaps are classified in the [security review](PRODUCTION-SECURITY-REVIEW.md).
