# Ruckus product vision

Ruckus makes a shared screen something a room can play with. Phones are controllers; the host creates the occasion. Fun multiplayer is the primary value. Turning custom content into multiplayer is the second value.

## Ruckus Originals

Six authored mechanics offer instant starts: speed trivia, majority opinions, creative pitches, caption writing, fact spotting and drawing. They establish the brand’s voice and bring different kinds of people into the game. Hosts do not need to become content creators to have a good session.

## Ruckus Studio

Studio turns an author’s questions into the same shared-screen experience. The browser library, starter boards, question bank, editor, previews and live launch form one practical loop. Multiple choice, True / False and polls cover a useful first release without turning Ruckus into a learning-management system. Templates are invitations to personalize, not simulations of real employer training.

## Why both exist

Originals earn the first visit; custom boards create reasons to return. A team can play something in five minutes, then make something specific to its own occasion. The consistent lobby, phone controls and presenter tools prevent a second product from emerging inside the first.

## Target users

Office hosts and managers who want a meeting warmup or Friday break; teams making company trivia or onboarding mixers; event hosts preparing offsites or conferences; remote teams using an existing video call to share the stage. The target activity is a short social session with voluntary participation.

## Current boundaries

Boards autosave locally and transfer via files. Sessions support 2–30 players on one in-memory realtime server. Reconnect survives a refresh or short interruption, not a server restart. Summary CSV contains display names, scores and aggregate question counts. Accounts, shared board editing, organization reporting and guaranteed uptime are not implemented.

## Future organization capabilities — not implemented

Authenticated workspaces and owner roles; PostgreSQL-backed boards with revision history; sharing permissions; reviewed content workflows; SSO if pilots establish a need; explicit retention controls; audit logging; persistent room recovery; observability and capacity-tested horizontal scale. Security/privacy/legal review precedes employee-data or confidential-content pilots.

Keep the UI independent of persistence through `BoardRepository`. A future API implementation should authenticate board CRUD and enforce ownership on the server. PostgreSQL tables can represent boards, ordered questions, options and revisions. Live gameplay should consume an immutable board revision instead of the mutable author document.

Scaling needs a shared authoritative room-state model, locks/versioned transitions, durable recovery and a scheduler strategy. The Socket.IO Redis adapter coordinates event delivery but does not persist this Room class. Add Redis/shared state and load balancing only alongside demonstrated capacity needs. Avoid deploying multiple independent instances with separate room maps.

## Business direction

Validate repeat hosting and authoring usefulness before billing. Potential paid value: saved cloud libraries, branded events, shared organization workspaces and managed reliable hosting. Preserve accessible phone controls, fast joining, original illustration and candid feature boundaries. Measure pilot hosting friction and participation, not employee proficiency.

## Startup development surfaces — Phase 0

The public website explains Ruckus; `/app` lets hosts use it; `/join` lets players enter immediately. Studio and all six Originals live within the host application. Host tools are open access until real accounts ship. Login/signup explicitly communicate that state without collecting credentials. Commercial pricing, cloud saving, organization workspaces, and Brand Kits remain future capability.

Portfolio case-study, campaign, and brand-showcase pages are archived outside production routing. The fictional employer starter is excluded from production templates. Brand assets and useful implementation remain available to build real workspace/event customization later.

The next milestone is **Authentication + PostgreSQL + CloudBoardRepository**, as one working host-account-to-cloud-board-to-live-room vertical slice. See [architecture](ARCHITECTURE.md) and [roadmap](ROADMAP.md).
