# Ruckus product vision

Ruckus makes a shared screen something a room can play with. Phones are controllers; the host creates the occasion. Fun multiplayer is the primary value. Turning custom content into multiplayer is the second value.

## Ruckus Originals

Six authored mechanics offer instant starts: speed trivia, majority opinions, creative pitches, caption writing, fact spotting and drawing. They establish the brand’s voice and bring different kinds of people into the game. Hosts do not need to become content creators to have a good session.

## Ruckus Studio

Studio turns an author’s questions into the same shared-screen experience. Personal and shared cloud libraries, starter boards, question bank, editor, previews and live launch form one practical loop. Multiple choice, True / False and polls cover a useful first release without turning Ruckus into a learning-management system. Templates are invitations to personalize, not simulations of real employer training.

## Why both exist

Originals earn the first visit; custom boards create reasons to return. A team can play something in five minutes, then make something specific to its own occasion. The consistent lobby, phone controls and presenter tools prevent a second product from emerging inside the first.

## Target users

Office hosts and managers who want a meeting warmup or Friday break; teams making company trivia or onboarding mixers; event hosts preparing offsites or conferences; remote teams using an existing video call to share the stage. The target activity is a short social session with voluntary participation.

## Current boundaries

Personal and organization workspaces own PostgreSQL-backed boards with immutable revisions; existing local boards can be explicitly copied into a writable workspace and still transfer via files. Sessions support 2–30 players on one in-memory realtime server. Reconnect survives a refresh or short interruption, not a server restart. Summary CSV contains display names, scores and aggregate question counts. Host accounts, verification/recovery, role-based organization collaboration and Brand Kit authoring/preview are implemented. Persisted mixed-game Events and frozen live event branding are implemented. Workspace session history and lightweight usage reporting are implemented; guaranteed uptime and restart recovery are not.

## Organization foundation and future capabilities

Workspaces, member roles, shared ownership, secure invitations, operational activity and versioned Brand Kits are implemented. Future capabilities include reviewed content workflows; SSO if pilots establish a need; explicit retention controls; extended audit export; persistent room recovery; observability and capacity-tested horizontal scale. Security/privacy/legal review precedes employee-data or confidential-content pilots.

The async `BoardRepository` keeps Studio independent of persistence. The versioned API authenticates private board CRUD and enforces server-derived ownership. PostgreSQL stores boards as validated JSONB revisions; live gameplay consumes an isolated validated snapshot. Future domains should extend these workspace authorization/service boundaries without normalizing every question prematurely.

Scaling needs a shared authoritative room-state model, locks/versioned transitions, durable recovery and a scheduler strategy. The Socket.IO Redis adapter coordinates event delivery but does not persist this Room class. Add Redis/shared state and load balancing only alongside demonstrated capacity needs. Avoid deploying multiple independent instances with separate room maps.

## Business direction

Validate repeat hosting and authoring usefulness before billing. Potential paid value: saved cloud libraries, branded events, shared organization workspaces and managed reliable hosting. Preserve accessible phone controls, fast joining, original illustration and candid feature boundaries. Measure pilot hosting friction and participation, not employee proficiency.

## Startup development surfaces — Phase 3

The public website explains Ruckus; authenticated `/app/w/:workspaceId` lets hosts use it; `/join` lets players enter immediately without accounts. Studio and all six Originals live within the host application. Real host accounts, private cloud saving, immutable revisions and local-to-cloud import exist. Organization collaboration and Brand Kits are real Phase 2 capabilities; commercial pricing remains future work.

Portfolio case-study, campaign and brand-showcase pages remain archived outside production routing. The fictional employer starter remains excluded from production templates. Brand assets and useful implementation remain available for future workspace/event customization.

Events & Experience Builder now uses workspace ownership and immutable launch revisions, with separate guest-safe image copies. One room code carries guests through Originals and Studio to a cumulative event finale. Phase 3.5 now adds a centralized host soundtrack and quiet phone feedback from authoritative semantic cues, with persistent controls and reconnect-safe presentation. Its original procedural pack remains a pre-release reference pending human audible approval. Phase 4 now separates reusable engines from curated, versioned content and discovery without implementing billing. Phase 4.5/4.5B applies original-demo page archetypes across these host tools; human art-direction approval remains pending. See [architecture](ARCHITECTURE.md), [authentication](AUTHENTICATION.md), and [roadmap](ROADMAP.md).

## Phase 4 content foundation

Content Packs now separate reusable game rules from authored material: Ruckus defaults and private workspace packs share versioned validation and frozen launch behavior. Content discovery is part of the Library, without a marketplace, entitlements or artificial scarcity. Phase 5 now records qualified completed/early-ended outcomes and useful workspace usage, without changing the live room into a database-driven runtime.

## Host experience principle

The original game-night Ruckus product should feel deeper as capabilities grow: cream and ink, blue actions, purposeful yellow, game accents, editorial hierarchy and little utility chrome. Phase 4.5 applies that direction to the host shell, shelves, editors and workspace/account tools. Compact migration and acknowledged status feedback support the task instead of masking it. Phase 4.5B follows the original page archetypes rather than one universal header/grid. Human art-direction approval is pending Anthony’s review. See the [host design system](HOST-DESIGN-SYSTEM.md).

## Session History and useful perspective

Hosts can revisit actual Original, Studio and Event outcomes in workspace History, export a recap and understand what the room has played. Final standings and source metadata are frozen, while current-source actions recheck current access. Analytics counts hosting occasions and session-local attendances, never employee performance or cross-session player identities. Creative submissions and drawings are excluded. Completion writes are asynchronous and bounded; missing uncommitted history remains possible on process loss. Retention and production reliability are the next operational work. [History](SESSION-HISTORY.md) · [Analytics](ANALYTICS.md).
