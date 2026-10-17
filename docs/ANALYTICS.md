# Ruckus Analytics

Open History → Analytics at `/app/w/:workspaceId/history/analytics`. The old `/app/analytics` path resolves to the current personal workspace's real Analytics page. History contributes one shell navigation item; Analytics is its adjacent tab.

## Questions answered

The page counts recorded occasions, participant attendances, time together, sessions by UTC day/month, play types and the most-played Original segments, Content Packs and Events. Event segments contribute to game/pack usage; one Event contributes one session. Studio-only sessions remain a distinct play type. Scored and poll Studio segments are visible in recaps without inventing poll rankings.

An editorial blue summary owns the dominant number. A simple labelled bar strip answers when play happened. Actual game colors/icons identify an ordered most-played lineup, followed by plain source lists and supporting averages. No chart library, KPI-card grid, public leaderboard, tracking SDK or external analytics service is used. The restored original-demo fonts, thin ink geometry, tactile controls and paper remain authoritative. Human art-direction approval is pending Anthony's review.

An empty workspace offers Originals, Events and Studio, with no sample statistics or wall of zeroes. A filter with no matching records gets a specific empty selection. Loading/error/retry states do not pretend an unavailable request is an empty library. Filters live in the URL and support browser history. The native date disclosure has specific validation messages and keyboard operation.

## Metric definitions

| Measure                     | Definition                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Sessions                    | Number of qualified committed runs in the selection, including ended-early runs                                  |
| Attendances                 | Sum of joined entries per run, including demo players; never cross-session unique people                         |
| Demo attendances            | Subset explicitly labelled demo by the runtime                                                                   |
| Time together               | Sum of wall seconds from host start through finale/early end; includes intros, pauses, results and intermissions |
| Average attendance/duration | PostgreSQL averages per recorded run, not per segment                                                            |
| Made it to the finale       | Completed / recorded runs; not all attempted lobbies, not a promise of capture completeness                      |
| Activity                    | Session count and attendances grouped by UTC day; all-time uses month                                            |
| Original/Pack plays         | Played segment count, including an early-ended segment after at least one closed round                           |
| Event use                   | Run count grouped by frozen Event ID; repeat launches are count minus the first in this selection                |
| Play types                  | Standalone Original, standalone Studio, Event; games inside Events remain segment usage                          |

Activity returns up to the latest 120 **active** buckets, ordered chronologically. Days/months with no recorded play are omitted and the caption says so. Printed counts/dates accompany every bar; color and height are not the only encoding. The strip can scroll inside its region on narrow screens. All-time scalar totals still cover all selected history, beyond the displayed active buckets. Top lists are bounded to six games, ten Packs and ten Events. Names come from recorded snapshots (the latest recorded label in the selection), not current mutable source metadata.

## Database boundary

`SessionHistoryService.analytics` authorizes `analytics.read`, then performs six aggregate queries: totals, activity, type distribution, games, Packs and Events. PostgreSQL performs filtering/counts/sums/averages/grouping. The browser receives bounded summaries; it never downloads the workspace's participant library to calculate analytics. No per-session queries or per-player queries are needed for these lists.

The shared date normalization supports 7, 30, 90 days and all time, plus optional UTC dates. Presets include the current UTC date through now; a custom through date is inclusive and anchors a preset when no from date is given. List/aggregate filters share the same workspace/date/type/game/Event conditions. A game filter also matches games inside Events. Changing source names never changes earlier outcomes.

Indexes support workspace/start/UUID keyset access, workspace/type/start/UUID, workspace/Event identity/date, run/segment order, game/run and run/participant rank. Small test datasets may legitimately use sequential scans; no large-workspace load or query-plan certification is claimed. All-time aggregates necessarily examine selected historical data and may eventually need measured rollups. Avoid high-frequency live writes or speculative denormalized dashboards in response.

## Access and limits

Owner/Admin/Host/Viewer can read through current membership. Players cannot call authenticated history endpoints. Source links open current permitted content or show unavailability while leaving the recap readable. CSV belongs to individual recaps; bulk history export is deferred.

These metrics describe hosting usage and session-local participation. They do not measure fun, engagement, team health, proficiency, employee performance, sentiment or retention. Missing history after a crash before durable enqueue, exhausted handoff or terminal materialization failure is not evidence that play did not happen. Phase 6 recovers committed queued work after restart. Confirmed recap deletion removes its Analytics contribution; there is no separate retained personal analytics rollup. There is no live monitoring, cross-workspace benchmarking, AI insight, billing entitlement or inferred player identity.

Local rendered QA and Axe checks support the new surfaces; they do not establish comprehensive WCAG conformance, physical-device behavior or human design approval. Operational release gaps from previous phases remain.

Phase 6 bounds database statements/transactions and includes a local synthetic query exercise, not a large-workspace benchmark. See [report](PHASE-6-REPORT.md) for exact sample counts/limits and [retention](RETENTION.md) for intentional removal.
