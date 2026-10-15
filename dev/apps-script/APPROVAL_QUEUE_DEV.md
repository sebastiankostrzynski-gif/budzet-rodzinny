# Approval queue: isolated DEV candidate

Not deployed. Files are reviewed in PR #7; merging alone does not deploy Apps Script.

Use only the existing isolated DEV project with its existing `ebDevAssertIsolation_` guard and read-only Sheets scope. Do not install in either original project. Do not change PROD, U47, inbox contents, triggers, OAuth scopes or spreadsheet data.

Add `approval-queue.js`, `approval-queue-service.gs` and `ApprovalQueue.html` to that isolated project after access is restored. Existing guards, paged manual reader and original pure matching helpers are dependencies. Run `ebDev02PrzygotujKolejke` explicitly in the editor once. It reads the existing copied inbox and copied budget, then saves a separate compressed queue property. It does not import Gmail/API transactions. Repeat preparation refuses to overwrite decisions. This first preview is a fixed snapshot; incremental refresh and decision migration are not implemented.

Before opening a test web app, verify deployment is restricted to the owner. Do not publish financial data with access set to anyone. This candidate adds `doGet` only to the isolated project; it must not replace existing production routing. Deployment and real-data browser tests remain outstanding.

List and decision endpoints access the saved DEV property only. ScriptLock serializes operations; revision checks reject stale requests. Compressed data is split into 7000-character chunks in two reusable banks (up to 20 chunks each). The inactive bank is written first; its pointer is published last. An interrupted write leaves the active snapshot readable. Oversized queues fail before writes. No inbox properties are changed or deleted. Successful decisions do not mark any transaction as posted and do not write budget cells. A timed-out decision can still finish on the server: the UI removes decision controls and requires a fresh read before another decision.

The initial category choices come from existing manual budget row labels. They require user validation before future automatic categorization. Existing technical classification is reused; its broad merchant/name rules have not been validated for every real transaction. Review exclusions before enabling autonomous processing. Non-PLN transactions cannot be linked to manual PLN entries through this preview.

Implemented decisions: category proposal in DEV; explicit confirmation of an eligible existing budget entry; defer for this snapshot. No automatic budget posting or rule learning. Linking is limited to server-derived candidates and cannot reuse reserved or already claimed manual entries.

Validation: `node --test tests/*.test.cjs` — 45 passing tests, including reopening saved state, stale decisions, write-size failure and zero sheet/inbox reads on list/decision. Live Google latency, Google authorization/deployment and mobile/browser behavior are not yet verified. The client displays end-to-end seconds and backend milliseconds; do not substitute local test duration for live request latency.

After preparation, run `ebDev03SprawdzSzybkiOdczytKolejki` to log row counts and elapsed time without scanning Sheets. QUEUE_SAVE logs only encoded size, chunk count and elapsed time.

## Row intent and custom descriptions
The preview now records EXISTING_ROW (add a purchase to a known existing total) or NEW_ROW (a new described row in a known expense sheet). Both are DEV intents only; no spreadsheet write occurs. Multiple purchases may target one running total. This is distinct from ALREADY_IN_BUDGET, which claims a single existing purchase and prevents reuse. Earlier CATEGORY decisions remain intact. User descriptions are plain text (maximum 200 characters); NEW_ROW requires a nonempty description. Sheet options come from the saved manual index, so sheets without any indexed entry are not available yet. Opening and deciding do not rescan Sheets.

51 tests pass. Browser interaction for these new controls still needs verification after deploying the updated isolated DEV version. Do not prepare the queue again; existing snapshot and decisions are compatible.
