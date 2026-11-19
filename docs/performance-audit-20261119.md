# Performance audit — TEST — 2026-11-19
Status: measured dashboard optimization deployed; full-device and write-path audit incomplete.

## Deployed
Apps Script API version 11 (same deployment and access settings), replaces version 10.
Kod.gs: pwaBook_(preloadNames, headerDates) reads batch values and only header number formats needed to preserve date typing.
getBudgetData and OdswiezanieReczneBackend.gs/getBudgetDataFresh preload four dashboard sheets, retaining source-change/day-change guards and unchanged budgetCalculateV23_ calculations.
Frontend private-budget.js: opt-in owner-only local bounded diagnostics, RPC/Sheets timings, result milestones and JSON export.
index.html: category-cache/category-current/dashboard-current/render milestones.
sw.js: shell v119-performance-verified.
No financial ledger writes and no bank API calls were made by these tests.

## Measurements
Cloud Chrome, same authenticated application and November budget, warm application, no network shaping. Not a physical iPhone; not Wi-Fi/LTE.
Times in milliseconds. Browser timings include automation interaction overhead.
Manual refresh: click to refresh control enabled again (backend response applied).
Before: [11722,11272,11738,13701,13488], median11738, range11272–13701.
After v11: [4125,4192,3670,3197,3817], median3817, range3197–4192.
Saving7921ms /67.5%. Five trials each. Same single dashboard RPC path; total baseline network count was not captured. Exported after RPC durations: [3814,3832,3308,2864,3125]. Separate periodic queue reads are not part of this single RPC count.

Server read+calculate, five sequential paired comparisons, no result cache:
old [12644,13025,15414,13309,13103], median13103.
new [1021,1048,1111,1056,1025], median1048.
Saving12055ms /92.0%. All five JSON results identical.
Additional September/October/November comparisons all identical:
old [7648,8155,7686], new [985,747,1137].
Main data retrieval is now one values batch plus one small header-format read; previously per-sheet formatted grid retrieval. Source timestamp checks remain.

Warm category reopen useful-data times: [372,604,648,581,603], median603, range372–648.
These are cached details, NOT fresh-backend latency; no comparable before series for this audit.
Observed fresh category RPC3215ms, one trial only.

Queue read experiment:
parallel before [1029,709,1263,893,1204], median1029.
batch experiment [1469,1013,1712,1675,1882], median1675.
Two reads became one, but timing regressed; experiment reverted. No speed claim for queue.
Warm correction reopen [1717,1775,2218,2112,2006], median2006, range1717–2218.
First correction read visibly waited for queued processing; no valid controlled numeric cold-start series was captured.
No p95 for these small series.

## Confirmed remaining bottleneck
private-budget.js/callBudgetFormQueued appends a command, waits for worker result, then waitForForm polls every4500ms.
completedCorrectionRead scans A2:E of form history and then reads the matching result row.
KorektaZapisanychTESTV1.gs/kzGetDevV1 acquires queue lock and verifies ledger/history/current cells.
Do not remove these checks or call a queued acknowledgement a durable save.
This audit did NOT replace the form worker path or prove faster durable assignments/cash/split/refund/valuation writes.

## Automated checks
Run from repository root:
node tests/performance-20261119/performance-diagnostics.cjs
node tests/performance-20261119/shared-reads-refresh-perf.cjs
node tests/performance-20261119/category-snapshot-sync-perf.cjs
node tests/performance-20261119/warsaw-day-perf.cjs
All passed locally on the deployed source.
Coverage: concurrent read sharing, separate months, writes never coalesced, post-write invalidation, retry after error, late responses, category/dashboard mismatch rejection, Warsaw midnight/month rollover, diagnostics owner gate, bounded storage and no request arguments/results/errors/URLs in telemetry.
Mock tests do not prove actual end-to-end durable writes, disconnection recovery or phone rendering.

## Physical iPhone protocol
Open PWA as owner. Bottom of main page: Pomiary szybkości · tylko właściciel.
Enable measurement; choose Wi-Fi or LTE/5G, warm/cold condition, series.
For each trial click Nowa próba, then perform ONE action; repeat five times. Export after each scenario/small group (300-event bound).
Prioritize manual dashboard refresh, category open/reopen, original purchase correction, then resume/start.
Keep a small note mapping trial numbers to actions and whether PWA was fully closed or only backgrounded.
Do not clear authentication/private data to simulate cold starts; full close does not guarantee an empty data cache.
Do not create fictional financial transactions. Real write performance needs isolated fixtures or telemetry from intended real actions.
Export JSON and send it for analysis. Network labels are manual, not automatically detected.
No physical-phone baseline was captured before deployment; choosing “Przed” does not restore old code.
Bytes are unmeasured (null in final build). Missing milestones mean unmeasured, not zero.
Authentication before role confirmation and iframe interaction-to-render timing are not fully covered.
No automatic remote upload or recurring monitoring was added.

## Rollback
Frontend backup branch backup/performance-20261119-v116 at d749ed9ecb1e1fc7ff65392f73a33de86fcd4977.
Restore index.html/private-budget.js/sw.js from that reference, publish with a new shell cache version (do not reuse stale version name).
Apps Script: manage existing deployment, select version10, retain endpoint/access settings. Current source should also be restored from version history if reverting editor code.
Do not rollback financial sheets: audit did not modify their records.

## Outstanding
Physical iPhone version verification, Wi-Fi/LTE before-after trials, cold start and next-day resume, all-tab refresh series, real isolated writes and associated-view completion, interrupted-network E2E, payload-size accounting and graphics cost profile.
Do not describe this as a completed full audit or all-app speedup.
