# Amounts for VND clients are 100 times too large

## Context
Our accountant reports that invoices for Vietnamese clients are wrong. When she creates an invoice for a client billed in VND and types a unit price of 24,680, the saved invoice shows ₫2,468,000 per unit. Payments recorded for those clients are inflated the same way. Invoices for USD clients look correct.

## Expected outcome
Amounts typed for a client are saved and shown in that client's currency, following Solova's accounting standards for money, for every currency the product supports.

## Requirements
Fix the amounts entered on Accounting screens for clients whose currency differs from the workspace currency. Existing USD behaviour, stored data of other invoices and accounting postings must stay correct. Maximum practice score: 100 points. This item has a deadline of 18 minutes from its release: after that, Game Master closes the item and accepts no submission for it.

Screen flow:

```text
Accounting → Invoices → New invoice → client billed in VND → quantity and unit price → Create → Issue
Accounting → Payments → same client → applies to that invoice → amount → Record
```

## Acceptance criteria
1. An invoice for a VND client is saved with the total computed from the quantity and unit price that were typed, in VND (0 decimals).
2. A payment applied to it is saved with the amount that was typed and the invoice becomes partially paid.
3. An invoice for a USD client is still saved with the amount that was typed (2 decimals).
4. Existing tests keep passing. Do not weaken, skip or delete existing tests. If an existing test contradicts the application's intended behavior, fix the test and explain why in the engineering record. Put new tests in new files under `src/tests/`. The grader runs the whole test suite and the type check itself on your submitted revision; before it does, it restores the original `vitest.config.ts`, `tsconfig.json`, `tests/global-setup.ts`, `tests/helpers.ts`, `tests/accounting.test.ts`, `tests/heatmap.test.ts` and `tests/move-card.test.ts`, so changes to those files are discarded and reported. `tests/cascade.test.ts` is the only original test you may correct.

## Verification data
Verify with the official QA test data issued to your team for BUG-02: it names the companies, quantities and amounts to type. The values differ from match to match and other data cannot match the expected results. A loader script, a report script and the verification scenarios are provided when you start this item.

## Out of scope
Currency conversion, changing invoice numbering or accounting postings, and unrelated UI changes.

## Submission

Create `answers/BUG-02/`, copy `challenge/BUG-02-submit.json` to `answers/BUG-02/submit.json`, and create its `evidence/` child directory. Follow the evidence rules and file names in `BUG-02-minimum-verification-scenarios.md`. Every PASS result must reference an existing evidence file. Commit source, tests, evidence, and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/BUG-02-submit.schema.json` (JSON Schema 2020-12), delivered with the submit template. Grading checks this schema first: a file that does not validate scores 0 and no test case is graded.

- Start from the template. It already lists one `testResults` row per test case, in the required order: `BUG-02-TC-01`, `BUG-02-TC-02`, `BUG-02-TC-03`, `BUG-02-TC-04`. Keep exactly these rows and these field names: `id`, `result`, `evidence`, and optionally `note`. Do not rename, add or remove fields or rows.
- `result` is `PASS`, `FAIL` or `NOT_RUN` (upper case). A `PASS` row lists at least one evidence path.
- Evidence paths are `evidence/<file name>`, for files directly inside `answers/BUG-02/evidence/`.
- Before submitting, set the top-level `status` to `DONE` (all requirements met), `PARTIAL` or `BLOCKED`.

Example row:

```json
{ "id": "BUG-02-TC-01", "result": "PASS", "evidence": ["evidence/tc-01-vnd-invoice.png", "evidence/currency-report.txt"] }
```

Complete the engineering record with the observed and expected behaviour, the root cause, the affected files, the change and its verification.