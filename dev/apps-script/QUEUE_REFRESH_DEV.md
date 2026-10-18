# Explicit DEV queue refresh

Candidate code, not deployed or run against the live budget. Run only in the existing isolated DEV project. The existing isolation guard and read-only spreadsheet scope remain required.

`ebDev04OdswiezPorownanieBezUtratyDecyzji` reads the copied inbox and the budget configured by the existing DEV reader, rebuilds the comparison, and saves the queue with a new revision. It does not import mail or bank transactions, write spreadsheet cells, or change inbox decisions. Preparation still refuses to overwrite an existing queue. Normal page reads and decisions never call the refresh or scan Sheets.

Important source limitation: the DEV workbook is a separate copy. Manual edits in the original workbook are not automatically present in that copy. Before a real refresh test, verify that the read-only DEV input contains the current source data. This change neither synchronizes that copy nor redirects the reader to PROD. A refresh against an old DEV copy does not verify the user's latest manual entries.

All earlier decisions and their original transaction evidence are retained, including transactions absent from the new pending plan. Their old manual target evidence remains inspectable even when a changed monthly amount changes the matching key. Non-deferred decisions are flagged for review after manual updates. Nothing is marked posted or silently declared a duplicate. A changed monthly aggregate alone cannot establish inclusion of a specific purchase.

Previously claimed manual entries remain unavailable to other transactions, including when the amount-based key changes but sheet, row, column and month remain the same. Row insertions or moves need manual review; coordinates are not durable purchase identities. Stale browser decisions fail through revision checks. Failed reads or interrupted inactive-bank writes leave the previous published queue readable.

The refresh logs separate times for the manual index, comparison and persistence, plus total duration. Logs contain counts and times, not merchant details or values. The page continues to time saved-state reads. No live Google request latency is claimed by local tests.

Validation: 71 Node tests pass. Added cases cover changed aggregate amounts, preserved decisions and original evidence, missing transactions, repeated refresh, reserved entries, stale revisions, scan failure, and reopening without a spreadsheet scan. Live refresh, current-source verification and mobile interaction remain outstanding. The category hierarchy integration is a separate unfinished change.

The generated `KolejkaDEV-bundle.gs` includes the queue, service and HTML. It is a replacement for the isolated DEV queue module only, never for the main backend. Do not paste separate copies of the same functions alongside the bundle.
