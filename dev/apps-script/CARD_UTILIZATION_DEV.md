# U30 card utilization — isolated DEV candidate

This is a pure calculation module with tests. It is not connected to the live inbox, Apps Script deployment, or spreadsheet cell U30.

## Rules

- At cutover, record the actual utilized amount once: credit limit minus available credit from the bank app. For this sheet the limit is 9,000 PLN. Do not reset a card with debt to zero.
- Alerty24 email authorizations are provisional card events and affect the running amount immediately.
- When the booked bank transaction arrives, the existing reconciler must supply an explicit `links` pair. The API amount replaces the email estimate and both source IDs remain on one logical event.
- An API transaction without an email remains its own posted event. Repeated source IDs are idempotent.
- A refund, card repayment, or bank reversal reduces utilization. A card repayment is a transfer, not a purchase.
- An explicitly cancelled authorization is marked VOID. Do not automatically expire it just because three days passed; lack of a booked transaction does not prove a hold was cancelled.
- An uncertain collision is marked REVIEW and excluded from the calculated total until resolved. The separate manual bank check will expose the difference.
- The final U30 value keeps the workbook's current sign convention: negative utilized credit. The manual available-credit check is compared with the calculated utilization; it does not overwrite it.

## Integration gate

The existing reconciliation result must be adapted to stable source identifiers (Gmail message/auth ID and bank transaction reference) and explicit email/API links. Do not fuzzy-match inside the balance calculator. If an item cannot be linked confidently, flag it for review.

The isolated DEV project currently uses read-only spreadsheet access. Before writing U30, a separate DEV-only writer must be added and tested against a verified DEV spreadsheet ID, guarded by the DEV isolation check. It must write only U30, never U47 or other budget cells. No new Gmail scan or import should run when opening the budget.

## Validation

Run `node --test tests/card-utilization-ledger.test.cjs`. Tests cover opening debt, email-to-booked transition, repeat imports, refunds, repayments, cancelled holds, review items, and manual balance comparison. Live API identifiers, email parsing, Apps Script authorization, and a DEV U30 write are not yet verified.
