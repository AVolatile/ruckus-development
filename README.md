# Ruckus Development

**Ruckus** is a multiplayer social experience platform built for teams, workplaces, events, and groups who want something more engaging than another presentation, poll, or meeting icebreaker.

Players join from their phones while a shared screen acts as the stage. Hosts can launch original Ruckus games, create custom experiences, and eventually tailor sessions around their organization, event, brand, or audience.

This repository represents the active **startup and product-development version of Ruckus**.

The original portfolio/demo implementation remains separate and is treated as a stable proof of concept.

---

## Product Vision

Ruckus is designed around a simple idea:

> **Turn any shared screen into something the room can play with.**

The platform combines:

- Multiplayer party-game mechanics
- Phone-based player controls
- Shared-screen presentation
- Custom content creation
- Workplace and event use cases
- Persistent player identity
- Organization workspaces
- Brand customization
- Analytics
- Progression and collectibles
- Premium content

Ruckus should feel fun enough for a party while being polished enough for a company event.

The goal is not to become another learning-management system or presentation tool.

The long-term positioning is:

**Multiplayer social experiences for teams.**

---

# Current Product Foundation

The current Ruckus platform already includes six multiplayer game formats.

### Hotwire
Fast-paced trivia focused on speed and accuracy.

### Room Temperature
Players answer opinion-based prompts and try to match the room.

### Sellout
Players create pitches and compete through group voting.

### Caption This
Players write captions for visual prompts and vote for their favorites.

### Odd One In
Players identify the real fact hidden among decoys.

### Scribble Shift
Players draw from their phones and compete through voting.

The existing multiplayer engine supports:

- 2–30 players
- Phone controllers
- Shared-screen host presentation
- QR joining
- Real-time Socket.IO communication
- Host controls
- Scoring
- Leaderboards
- Pause/resume
- Reconnection
- Bots
- Rematches
- Session summaries

---

# Ruckus Studio

Ruckus Studio allows hosts to create their own multiplayer experiences.

Current capabilities include:

- Custom boards
- Multiple-choice questions
- True / False
- Polls
- Question libraries
- Starter templates
- Browser-local autosave
- Question reordering
- Duplication
- Import/export
- CSV imports
- Host previews
- Phone previews
- Live launches

The startup version of Ruckus will evolve Studio into a cloud-based creation platform.

---

# Startup Direction

The next stage of Ruckus development focuses on transforming the existing prototype into a scalable SaaS platform.

The product will eventually support three major audiences:

### Players

Players should be able to join Ruckus sessions with almost no friction.

Core principles:

- No payment required
- No account required to join
- QR or room-code access
- Optional persistent player profile
- Character customization
- Progression
- Achievements
- Collectibles

### Hosts

Hosts create and run experiences.

Potential paid capabilities include:

- Unlimited boards
- Cloud storage
- Premium content
- Session history
- Analytics
- Higher participant limits
- Brand customization
- Advanced moderation

### Organizations

Businesses and larger groups receive shared workspaces and professional tools.

Potential capabilities include:

- Shared board libraries
- Multiple hosts
- Organization templates
- Brand Kits
- Event branding
- Analytics
- Roles and permissions
- Administration
- Enterprise authentication
- Audit controls

---

# Business Model

The intended business model is:

> **Free players. Paid hosts. Premium workplaces.**

Ruckus should allow free users to experience the real product rather than placing the majority of gameplay behind a paywall.

Monetization should primarily come from increased scale, persistence, customization, content, and organizational capabilities.

---

## Proposed Product Tiers

### Ruckus Free

Designed for casual groups and new users.

Potential limits:

- Smaller player counts
- Limited custom boards
- Core content packs
- Local board storage
- Basic session summaries
- Standard Ruckus branding

The purpose of the free tier is product discovery and organic adoption.

---

### Ruckus Host

Designed for recurring hosts.

Potential capabilities:

- Higher participant limits
- Unlimited cloud boards
- Full Ruckus content library
- Premium content packs
- Session history
- Analytics
- Exports
- Basic branding
- Persistent host profile

---

### Ruckus Teams

Designed for organizations and recurring workplace use.

Potential capabilities:

- Shared workspaces
- Multiple hosts
- Shared board libraries
- Organization templates
- Brand Kits
- Event customization
- Advanced analytics
- Moderation controls
- Higher participant limits
- Workspace administration

---

### Ruckus Enterprise

Designed for large organizations and high-volume events.

Potential capabilities:

- Custom participant limits
- SSO
- SCIM
- Advanced permissions
- Audit logs
- Retention controls
- Custom domains
- Advanced branding
- White-label options
- Dedicated support
- SLA agreements

---

# Ruckus Brand Kits

Brand Kits are expected to become one of Ruckus's primary B2B features.

Organizations should be able to make Ruckus experiences feel native to their company while maintaining subtle Ruckus attribution.

Example:

```text
FIDELITY INVESTMENTS

2027 Workplace Investing Team Challenge

Powered by Ruckus
```

A Brand Kit may eventually contain:

- Organization name
- Company logo
- Light/dark logo variants
- Primary color
- Secondary color
- Accent color
- Background assets
- Typography preferences
- Lobby styling
- Leaderboard styling
- Winner-screen styling
- Footer text
- Event graphics

Brand Kits should be reusable across multiple boards and events.

Organizations may eventually maintain multiple Brand Kits for:

- Departments
- Conferences
- Campaigns
- Holiday events
- Sales kickoffs
- Internal initiatives

---

# Content Packs

Ruckus games should be treated as reusable game engines rather than static collections of questions.

Example:

```text
Hotwire
├── General Mayhem
├── Sports
├── Movies
├── Music
├── Gaming
├── Pop Culture
├── Halloween
└── Holiday Chaos
```

This allows Ruckus to continuously add value without needing to build an entirely new multiplayer game for every release.

Content packs may eventually be:

- Free
- Premium
- Seasonal
- Organization-specific
- Event-specific
- Unlockable
- Limited edition

---

# Characters and Player Identity

Ruckus characters will eventually become part of a persistent player identity system.

Potential categories include:

- Base characters
- Earnable characters
- Seasonal characters
- Achievement rewards
- Event-exclusive characters
- Premium characters

Characters should remain cosmetic.

Ruckus should avoid pay-to-win mechanics.

---

## Seasonal Character Collections

### Halloween

Potential characters:

- Zombie
- Mummy
- Witch
- Bat
- Scarecrow
- Jack-o'-Lantern
- Candy Corn
- Ghost
- Skeleton
- Vampire

### Holiday

Potential characters:

- Santa
- Elf
- Reindeer
- Snowman
- Gingerbread character
- Nutcracker
- Present
- Yeti

Seasonal collections can support:

- Player retention
- Limited-time events
- Achievements
- Progression
- Premium cosmetic purchases

---

# Player Progression

Optional Ruckus accounts may eventually track persistent player identity.

Possible progression systems:

- XP
- Player level
- Games played
- Wins
- Achievements
- Character unlocks
- Collection completion
- Game-specific statistics
- Event badges

Example:

```text
Anthony
Level 17

38 Games Played
12 Wins

Hotwire Ace

Halloween Collection
6 / 10
```

This creates continuity between otherwise independent Ruckus sessions.

---

# Ruckus Events

Ruckus should eventually support event-specific experiences.

Examples:

- Company holiday parties
- Conferences
- Employee onboarding
- Sales kickoffs
- Team offsites
- Weddings
- Family events
- Networking events
- Fundraisers
- Remote socials

Events may include:

- Custom branding
- Event titles
- Event graphics
- Selected game playlists
- Event-only characters
- Analytics
- Session history

---

# Event Passes

Not every customer needs a subscription.

Ruckus may eventually offer short-term Event Passes.

Potential offering:

```text
Ruckus Event Pass

7 Days
100–200 Players
All Ruckus Originals
Premium Content Packs
Custom Boards
Brand Kit
Event Analytics
```

This could serve customers hosting one-time events without requiring a recurring subscription.

---

# Future AI Features

Ruckus Studio may eventually include assisted board generation.

Example:

> Create a 15-question holiday game for a corporate team event. Include Christmas trivia, pop culture, workplace humor, and sports. Keep everything workplace appropriate.

Ruckus could generate:

- Questions
- Answers
- Polls
- Game combinations
- Recommended timers
- Suggested content packs

AI-generated content should always require host review before publication or live use.

---

# Future Marketplace

A long-term possibility is a creator marketplace.

Creators could publish:

- Trivia packs
- Event templates
- Holiday games
- Wedding games
- Sports content
- Workplace templates
- Original Ruckus experiences

Marketplace development should not begin until Ruckus has mature:

- Content moderation
- Copyright policies
- Creator ownership rules
- Payments
- Reporting
- Quality controls

---

# Architecture Direction

The existing application should remain modular as Ruckus grows.

Target system boundaries:

```text
Client Applications
        │
        ▼
Ruckus API
        │
        ├── Authentication
        ├── Organizations
        ├── Boards
        ├── Content
        ├── Entitlements
        ├── Billing
        ├── Analytics
        └── Player Profiles
        │
        ▼
PostgreSQL
```

Realtime gameplay remains a separate authoritative system:

```text
Players / Host
      │
      ▼
Socket.IO
      │
      ▼
Realtime Game Engine
      │
      ├── Rooms
      ├── Timers
      ├── Player State
      ├── Scoring
      ├── Voting
      └── Session State
```

Future shared-state infrastructure may include Redis or another distributed coordination layer once scaling requirements justify it.

---

# Core Future Data Model

Potential entities include:

```text
users
organizations
memberships
subscriptions
entitlements

boards
board_revisions
questions
content_packs

brand_kits
events

sessions
session_players
session_results

player_profiles
characters
character_packs
user_unlocks
achievements
```

Database design should preserve clear ownership boundaries between users, organizations, content, and live gameplay.

---

# Entitlements

Ruckus should avoid hard-coding subscription plan names throughout the application.

Instead, product access should be controlled through capabilities such as:

```text
canCreateBoard
canHostPlayers
canUseBrandKit
canExportResults
canUsePremiumPack
canCreateWorkspace
canViewAnalytics
canUseCustomDomain
```

This allows pricing and packaging to evolve without tightly coupling business logic to UI code.

---

# Development Roadmap

## Phase 1 — Foundation

- Authentication
- PostgreSQL
- User accounts
- Cloud BoardRepository
- Persistent boards
- Migration from local-only storage
- Product analytics instrumentation

---

## Phase 2 — Product Packaging

- Content-pack architecture
- Entitlements
- Free-tier limits
- Premium feature gates
- Session history
- Host dashboard

---

## Phase 3 — Monetization

- Subscription infrastructure
- Payment provider integration
- Billing portal
- Subscription webhooks
- Event Passes
- Premium content

---

## Phase 4 — Business Platform

- Organization workspaces
- Workspace memberships
- Roles and permissions
- Shared board libraries
- Organization templates
- Ruckus Brand Kits
- Event branding

---

## Phase 5 — Analytics

- Session dashboards
- Participation metrics
- Question performance
- Response timing
- Voting metrics
- CSV exports
- Shareable recaps

---

## Phase 6 — Player Ecosystem

- Player accounts
- XP
- Levels
- Achievements
- Character collections
- Seasonal unlocks
- Player statistics

---

## Phase 7 — Scale

- Persistent room recovery
- Distributed realtime state
- Redis/shared infrastructure
- Capacity testing
- Observability
- Error monitoring
- Automated backups
- Rate limiting
- Security reviews

---

## Phase 8 — Expansion

Potential future areas:

- Slack integrations
- Microsoft Teams
- Zoom
- Google Meet
- AI Studio tools
- Template marketplace
- Creator ecosystem
- Enterprise administration
- Mobile applications

---

# Product Principles

Ruckus development should continue to follow several core principles.

### Joining must remain frictionless

Players should never need an account simply to participate.

### Fun comes first

Business features should enhance Ruckus rather than turn it into corporate software with games attached.

### Hosts are the primary customer

Players generate adoption. Hosts and organizations generate revenue.

### Customization should not destroy identity

Company branding should coexist with recognizable Ruckus design.

### Cosmetics stay cosmetic

Characters and collectibles should not affect competitive outcomes.

### Build systems, not isolated features

Branding, events, content, progression, analytics, and subscriptions should share reusable architecture.

### Validate before scaling

Do not prematurely build enterprise infrastructure, marketplaces, or complex monetization before users demonstrate demand.

---

# Repository Purpose

This repository is the active product-development environment for the future Ruckus startup.

Development here may include experimental, incomplete, or unreleased functionality.

The original portfolio/demo repository should remain separate and stable.

```text
icebreaker-game-project
└── Stable portfolio/demo implementation

ruckus-development
└── Active startup product development
```

---

# Status

**Stage:** Early product development / startup exploration

**Current objective:** Evolve the existing multiplayer proof of concept into a scalable, persistent, monetizable platform while preserving the simplicity and personality that make Ruckus fun.

---

# Long-Term Goal

Ruckus should become the easiest way for a group of people to turn a shared screen into a live multiplayer experience.

Whether the occasion is:

- a five-minute meeting warmup,
- an onboarding session,
- a conference,
- a holiday party,
- a team offsite,
- or a night with friends,

the experience should begin the same way:

**Open Ruckus.**

**Start a room.**

**Scan the code.**

**Make some noise.**