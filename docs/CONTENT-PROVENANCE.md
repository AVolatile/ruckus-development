# Content provenance

Ruckus-owned canonical content remains in `server/content.ts` and `shared/content/library.ts`. `server/content-packs/built-ins.ts` converts it to strict pack documents without changing prompt order, answer keys, explanations, legacy topic labels or existing scene references. These are existing project-authored banks, not newly scraped or licensed third-party content. Caption scenes remain the existing `/scenes/0.svg` through `/scenes/14.svg` assets. No assets or audio were generated for Phase 4.

Default pack counts: General Knowledge (Hotwire) 169; Read the Room 32; Big Ideas, Small Products (Sellout) 12; Office Oddities (Caption This) 15; Curious Facts (Odd One In) 10; Drawing Outside the Lines (Scribble Shift) 12. Food for Thought is a focused alternate Hotwire pack containing the twelve existing food-tagged questions. It introduces no new factual claims. No broad factual rewrite, seasonal filler or scraped material was added. Existing content is preserved; parity testing does not certify every inherited fact against an external source.

Persisted provenance is `ruckus_original`, `workspace_authored` or `copied`. Copies can retain server-only source pack/revision UUIDs for operational provenance, but responses/portable exports never disclose private source workspace details. A copy never follows future source edits. Workspace authors remain responsible for material they provide.

The explicit content validator checks every default’s runtime output against the original selection function for five rounds, 500 offsets and eight topic/fallback cases (120,000 prompt comparisons). Seed output includes per-document SHA-256 hashes. Review any intentional source correction and updated parity expectations as a separate content release.
