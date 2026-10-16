# DEV category catalogue — analysis and extraction candidate

The current approval view derives its choices from a manual matching index. That index contains only entries with a nonzero amount in a relevant month. It is unsuitable as a complete category catalogue: it omits unused entries and mixes aggregate section rows with individual purchases.

`category-hierarchy.js` builds a separate hierarchy from bounded label/formula reads, independent of transaction amounts. It distinguishes sheet roots, structural sections, individual entries and calculated cross-sheet results. Parent-child relations follow the actual SUM/range/addition formulas, including nested branches. Font style alone is not trusted. Placeholder entries are disabled; unsupported references become noneditable computed nodes. Totals and the planned-budget block are excluded. Conflicting parents and incomplete source reads fail explicitly.

A read-only inspection of the existing workbook validated extraction across all 15 transaction-related sheets: 80 sections, 541 entries, and 2 cross-sheet computed results. One unnamed placeholder requires review; disabled nodes must not be selectable. The private source snapshot and generated catalogue are not included in this public repository.

Inflow roots (T1–T3) are distinct from outflow roots (T4 onward). Repayments and own-account transfers remain outside purchase automation. New rows need a leaf-section destination, not merely a sheet name or a fixed four-person selector. Existing entries and potential duplicate matches remain separate concepts. Existing DEV decisions require explicit path resolution before eventual posting; no automatic migration has been implemented.

This module is an analysis/extraction candidate. It is not yet wired into the approval service, UI, current bundle or live Apps Script. Do not replace the deployed code with the module alone. Next integration must persist the catalogue separately, expose dependent section controls and validate selected paths server-side while preserving saved queue decisions. Source refresh must be explicit; opening a view must not rescan a spreadsheet. No production, U47, importer, trigger, spreadsheet or existing data modifications were made by this review.

Validation: 65 automated tests pass, including 6 catalogue tests with synthetic fixtures. The extractor also ran successfully on the private read-only structure snapshot. No budget-write testing or live category UI testing is claimed.
