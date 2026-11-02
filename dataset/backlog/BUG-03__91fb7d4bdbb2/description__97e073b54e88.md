# Invoices paid in full stay partially paid

## Context
Accounting reports two problems with invoice statuses since the last refactoring:

- A client pays an invoice exactly in full, in one or several payments, but the invoice keeps the status **Partially paid**. Only when a client pays more than the total does it switch to **Paid**.
- An unpaid invoice is shown as **Overdue** on its due date already, while the client still has that whole day to pay.

Both statuses feed the company Finance tab, the dashboard and the receivables the accountant chases, so clients get chased for money they do not owe.

## Expected outcome
Invoice statuses follow Solova's company definition of paid, partially paid and overdue invoices, maintained by the accounting team in the internal knowledge base.

## Requirements
1. The status rule for issued invoices lives in `src/lib/invoice-status.ts`, function `deriveInvoiceStatus({ status, totalMinor, paidMinor, dueDate, now })`, used when a payment is recorded. Fix the rule there; keep the module path, the exported function name and its input fields, because other features depend on them.
2. DRAFT and VOID invoices are never changed by this rule, and a partially paid invoice keeps its current behaviour.
3. Add automated tests for the rule. Existing tests must keep passing; do not weaken, skip or delete them. Put new tests in new files under `src/tests/`. The grader runs the whole test suite and the type check itself on your submitted revision; before it does, it restores the original `vitest.config.ts`, `tsconfig.json`, `tests/global-setup.ts`, `tests/helpers.ts`, `tests/accounting.test.ts`, `tests/heatmap.test.ts` and `tests/move-card.test.ts`, so changes to those files are discarded and reported. `tests/cascade.test.ts` is the only original test you may correct.
4. This item has a deadline of 15 minutes from its release: after that, Game Master closes the item and accepts no submission for it. Maximum practice score: 80 points.

## Acceptance criteria
1. An invoice whose payments add up exactly to its total is PAID; an overpaid invoice is PAID.
2. An unpaid invoice is not overdue during its due date and is overdue from the following day, exactly as the company definition says.
3. Partially paid, draft, void and undated invoices behave as before.

## Grading
Half of the points come from the Minimum Verification Scenarios: the grader replays `BUG-03-mvs.test.ts` (provided at START) against your submitted source, and each case scores only when you report it PASS with evidence and the replay passes. The other half comes from organizer hidden tests that call `deriveInvoiceStatus` directly with many more cases, including boundaries. Neither uses a database. Hard-coding the examples does not pass the hidden tests.

## Out of scope
Changing stored statuses of existing invoices, reminders, and UI changes.

## Submission

Create `answers/BUG-03/`, copy `challenge/BUG-03-submit.json` to `answers/BUG-03/submit.json`, and create its `evidence/` child directory. Commit source, tests, evidence and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/BUG-03-submit.schema.json` (JSON Schema 2020-12). Grading checks this schema first: a file that does not validate scores 0.

- Keep exactly the template rows `BUG-03-TC-01`, `BUG-03-TC-02`, `BUG-03-TC-03` (see `BUG-03-minimum-verification-scenarios.md`) and the field names `id`, `result`, `evidence`, optionally `note`.
- `result` is `PASS`, `FAIL` or `NOT_RUN`. A `PASS` row lists at least one existing evidence path `evidence/<file name>`.
- Set the top-level `status` to `DONE`, `PARTIAL` or `BLOCKED` before submitting.

Complete the engineering record with the observed and expected behaviour, the root cause, the change and its verification.