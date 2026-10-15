# Workspaces and collaboration

Every account has one personal workspace, created atomically by a PostgreSQL user-insert trigger. It has one permanent owner membership. Its kind, creator and membership identity cannot be transferred, archived or independently deleted. Existing accounts and all old boards are backfilled transactionally; creator provenance replaces direct owner authorization. Organization names need not be unique. All IDs are server-generated UUIDs.

Organizations require verified email to create, invite or accept invitations. Personal usage remains available before verification. A user may create 20 active organizations; this is a technical abuse safeguard, not a pricing tier. Membership/workspace lists are bounded; membership listing uses joined names/emails. Workspace navigation is `/app/w/:workspaceId/...`; old `/app/*` paths deterministically open the personal workspace and retain suffix/query/hash. No browser preference proves membership.

| Capability                                     | Owner | Admin | Host | Viewer                            |
| ---------------------------------------------- | ----- | ----- | ---- | --------------------------------- |
| Read workspace, members, boards and Brand Kits | Yes   | Yes   | Yes  | Yes                               |
| Create/edit/delete/duplicate/launch boards     | Yes   | Yes   | Yes  | No                                |
| Copy a readable board to a writable workspace  | Yes   | Yes   | Yes  | Yes, when target permits creation |
| Rename organization                            | Yes   | Yes   | No   | No                                |
| Invite/manage non-owner members and Brand Kits | Yes   | Yes   | No   | No                                |
| Grant/change/remove ownership                  | Yes   | No    | No   | No                                |
| Archive organization                           | Yes   | No    | No   | No                                |
| Read workspace activity                        | Yes   | Yes   | No   | No                                |

The shared capability definitions are consumed by one server authorization service and by presentation controls. Every API operation independently checks the server session and current membership. A URL/role/target ID from the browser is input, never authority. Nonmembers and missing workspaces receive the same unavailable response. Board, Brand and image queries also constrain resource workspace IDs.

Membership mutations lock the workspace row before checking role/owner count. Deferred database constraints prevent ownerless workspaces, including direct ordinary SQL writes. Personal membership cannot change. Admins cannot promote themselves or others to owner, remove an owner or demote one. The final owner must assign another owner before leaving. Archiving hides the organization and blocks normal resource access while preserving its content/history/members. There is no permanent purge or self-service restore.

Invitations use 32 random bytes, SHA-256 hashes in storage, seven-day expiry, verified matching normalized email and locked transactional acceptance. Raw secrets exist only during email issuance/delivery, never in invitation rows or logs. Pending invitations can be revoked; expired pending entries are retired before re-inviting. Already-members receive a clear response and must change roles through Members. Pending invites are capped at 50; there is no bulk invite. SMTP is awaited before the invitation transaction commits. This avoids claiming a failed delivery was sent, but a rare commit failure after SMTP acceptance can produce an unusable email; revoke/reissue safely. A durable delivery outbox is future work.

Local import defaults to personal space and exposes an explicit writable destination. Retry keys are unique per workspace, so copying the same local source intentionally to two workspaces is supported. Source `ruckus-studio-v1` bytes are never rewritten. The optional account/workspace mapping is a UI hint; server keys remain authoritative. Deleted imports stay retired. Cross-workspace copy checks source read and destination create, creates a fresh ID/revision 1, and leaves source history intact.

Board saves preserve Phase 1 optimistic concurrency, immutable authorship, no-op hashes, serialized debounced saves and draft recovery. API compatibility `/api/v1/boards*` delegates only to the authenticated personal workspace. New clients use `/api/v1/workspaces/:workspaceId/boards*`. Cloud launches send a workspace/board reference; the adapter checks `boards.launch` and loads current content before passing its snapshot to the existing engine. Legacy raw custom-board payloads remain supported for authenticated hosts/imported content; exporting and copying readable content is allowed. Guest joining and room capabilities remain independent of membership.

Sensitive workspace/member/Brand/create-copy-delete actions append audit records in their transactions. Audit rows reject ordinary update/delete. Metadata omits tokens and full board documents. Owner/Admin activity uses bounded keyset pagination; this is an operational history, with no compliance certification claim.
