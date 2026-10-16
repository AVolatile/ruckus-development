# Working with Content Packs

Open **Library → Content Packs** in your workspace. Originals define the rules; packs provide the material. Browse by game, category, season, difficulty or source, or search names/descriptions/tags. Seasonal metadata organizes discovery and never expires access.

A pack detail shows its source, compatible game, item count, revision and up to five host-preview items. **Play this pack** opens setup with that choice selected. Quick Original launches retain the Ruckus default. Setup and Event segment options show only compatible ready choices; an unavailable saved selection needs an explicit replacement. The legacy topic filter remains available for migrated banks.

Use **Create private pack** to name a draft and choose its game. Add prompts, complete choices, choose answer keys where appropriate, reorder with Up/Down, duplicate or delete items, and edit metadata. Caption This uses existing Ruckus scenes. When every item is complete, choose **Ready to play**. Drafts save but cannot launch. A new empty draft is revision 1; later acknowledged edits append revisions. The game cannot change after creation.

Changes autosave after 750 ms. **Save now** flushes pending work. Watch the acknowledged save status before closing the tab. Network/conflict failures preserve edits and pause saving. Export before choosing **Load latest** if you want to keep a conflicting version. Optional tab recovery is not a durability guarantee before cloud acknowledgement.

**Copy into workspace** creates an independent editable copy in a destination where you can create content. Ruckus packs themselves stay read-only. Export JSON and import it through the catalog to create a new private pack. Exports include schema version, metadata and content; they exclude account/workspace identities, source references and revision history. Import uses strict validation, never arbitrary field merging. CSV import is not part of this release.

**Add to a new Event** starts a lineup with the selected pack. Existing Events offer pack selection under each Original’s segment options. All enabled sources are checked at launch; drafts, archived packs, incompatible games and unreadable sources block launch with a repair message. Launches pin exact revisions and prompts. Editing or archiving afterward cannot change an already running room. Cross-workspace Event copies make independent copies of private pack dependencies.

Owners/Admins can archive workspace packs. Hosts can create/edit/use, and Viewers can inspect/copy to a writable destination. Guests still join without accounts and cannot browse catalogs or answer keys. Brand settings and audio profiles remain independent of pack selection.

## Built-in content release

```sh
npm run content:validate
npm run content:diff
# Review the diff, then explicitly apply:
npm run content:seed
```

Validation requires no database and proves exact default-bank parity. Diff reads the configured database without mutation. Seed requires reviewed migrations and a configured DATABASE_URL, creates permanent identities, adds a revision only for a real content change and refuses a system pack whose current hash diverges from its last seeded hash. Repeat runs report `unchanged`. Never seed on application startup. To release a content change, edit the canonical source, validate, review the database diff, explicitly seed, test affected games and document the release. The commands never touch workspace-authored packs.

`npm run db:test:prepare` explicitly migrates/seeds only the guarded local test database. CI explicitly validates and seeds twice to exercise repeatability. Deployment still requires a reviewed migration/seed step; no live release has been performed.

The production Docker artifact includes the compiled CLI and canonical content. After `db:migrate:production`, use `npm run content:diff:production` and the reviewed `npm run content:seed:production`; neither requires development dependencies. These commands require server-side DATABASE_URL and never run automatically.
