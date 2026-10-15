# Ruckus product vision

Ruckus makes a shared screen something a room can play with. Phones are controllers; the host creates the occasion. Fun multiplayer is the primary value. Turning custom content into multiplayer is the second value.

## Ruckus Originals

Six authored mechanics offer instant starts: speed trivia, majority opinions, creative pitches, caption writing, fact spotting and drawing. They establish the brand’s voice and bring different kinds of people into the game. Hosts do not need to become content creators to have a good session.

## Ruckus Studio

Studio turns an author’s questions into the same shared-screen experience. The private cloud library, starter boards, question bank, editor, previews and live launch form one practical loop. Multiple choice, True / False and polls cover a useful first release without turning Ruckus into a learning-management system. Templates are invitations to personalize, not simulations of real employer training.

## Why both exist

Originals earn the first visit; custom boards create reasons to return. A team can play something in five minutes, then make something specific to its own occasion. The consistent lobby, phone controls and presenter tools prevent a second product from emerging inside the first.

## Target users

Office hosts and managers who want a meeting warmup or Friday break; teams making company trivia or onboarding mixers; event hosts preparing offsites or conferences; remote teams using an existing video call to share the stage. The target activity is a short social session with voluntary participation.

## Current boundaries

Authenticated hosts own PostgreSQL-backed boards with immutable revisions; existing local boards can be explicitly copied into an account and still transfer via files. Sessions support 2–30 players on one in-memory realtime server. Reconnect survives a refresh or short interruption, not a server restart. Summary CSV contains display names, scores and aggregate question counts. Host email/password accounts are implemented. Email verification/recovery, shared board editing, organization reporting and guaranteed uptime are not implemented.

## Future organization capabilities — not implemented

Organization workspaces and membership roles; shared ownership; sharing permissions; reviewed content workflows; SSO if pilots establish a need; explicit retention controls; audit logging; persistent room recovery; observability and capacity-tested horizontal scale. Security/privacy/legal review precedes employee-data or confidential-content pilots.

The async `BoardRepository` keeps Studio independent of persistence. The versioned API authenticates private board CRUD and enforces server-derived ownership. PostgreSQL stores boards as validated JSONB revisions; live gameplay consumes an isolated validated snapshot. Future organizations should extend these authorization/service boundaries without normalizing every question prematurely.

Scaling needs a shared authoritative room-state model, locks/versioned transitions, durable recovery and a scheduler strategy. The Socket.IO Redis adapter coordinates event delivery but does not persist this Room class. Add Redis/shared state and load balancing only alongside demonstrated capacity needs. Avoid deploying multiple independent instances with separate room maps.

## Business direction

Validate repeat hosting and authoring usefulness before billing. Potential paid value: saved cloud libraries, branded events, shared organization workspaces and managed reliable hosting. Preserve accessible phone controls, fast joining, original illustration and candid feature boundaries. Measure pilot hosting friction and participation, not employee proficiency.

## Startup development surfaces — Phase 1

The public website explains Ruckus; authenticated `/app` lets hosts use it; `/join` lets players enter immediately without accounts. Studio and all six Originals live within the host application. Real host accounts, private cloud saving, immutable revisions and local-to-cloud import exist. Commercial pricing, organizations and Brand Kits remain future capability.

Portfolio case-study, campaign and brand-showcase pages remain archived outside production routing. The fictional employer starter remains excluded from production templates. Brand assets and useful implementation remain available for future workspace/event customization.

The recommended next milestone is **Organizations + memberships + shared workspace ownership + the first real Brand Kit model**, after addressing the pre-public-launch account/security gaps. See [architecture](ARCHITECTURE.md), [authentication](AUTHENTICATION.md), and [roadmap](ROADMAP.md).
