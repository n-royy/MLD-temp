# Export the filtered invoice list as CSV

## Context
Our accountants import invoice lists into their bookkeeping tool. Today they retype invoices from the Accounting screen because Solova has no export. They asked for a CSV download that their tool can import without manual fixing.

## Expected outcome
On Accounting → Invoices, the user can download, as one CSV file, exactly the invoice list selected by the current company filter.

## Requirements
1. Place a button labelled **Export CSV** beside **New invoice**, to the right of the company filter. Keep the existing controls available.
2. Export every invoice returned by the current company filter, in the order shown on screen, without silently excluding any status. An empty selection still downloads a valid file.
3. The file goes straight into the accountants' import tool, so its layout, encoding, columns, amounts, paid and outstanding balances, status values and dates must follow Solova's accounting data-exchange standards exactly. The accounting team maintains those standards in the company's internal systems; they are authoritative and override assumptions.
4. Invoice and company financial data stays restricted to signed-in staff, also through the new export. Either an authenticated server export or an export built from the already authenticated invoice list is acceptable.
5. Add automated tests for the export logic, including filtering, CSV escaping, amount/date formatting and the signed-out case. Existing tests must keep passing. Do not weaken, skip or delete existing tests. If an existing test contradicts the application's intended behavior, fix the test and explain why in the engineering record.

Desktop wireframe:

```text
Accounting
Reports | Invoices | Payments | Products | Expenses | Journal | Accounts
[All companies / selected company]       [Export CSV] [New invoice]
Invoice list selected by that company filter
```

## Acceptance criteria
1. Clicking Export CSV on Invoices downloads a CSV of exactly the invoices selected by the active company filter, in screen order, including draft and void invoices.
2. The file conforms to Solova's invoice export standard: encoding, header, column order, quoting, amounts per currency, paid and outstanding balances, status values and dates.
3. Company names with Vietnamese letters, commas, double quotes and line breaks survive the round trip unchanged.
4. An empty selection downloads a file with only the header row; existing invoice actions keep working.
5. Signed-out users cannot obtain invoice data or an export through the implemented flow.
6. `pnpm test` (including the new tests) and `pnpm typecheck` pass.

## Verification data
Verify with the official QA test data issued to your team for CR-01; other data cannot match the expected results. A loader script and the verification scenarios are provided when you start this item.

## Out of scope
PDF export, changing invoice accounting or statuses, currency conversion, and unrelated UI changes. Do not introduce a heavy library when it is unnecessary. Formula-injection protection is optional and carries no points; if you add it, the verification data must still round-trip unchanged.

## Submission
Create `answers/CR-01/` with `submit.json` (copied from `challenge/CR-01-submit.json`) and an `evidence/` child folder. Follow the evidence rules and file names in `CR-01-minimum-verification-scenarios.md`. Every PASS result must reference existing evidence files. Commit source, tests, evidence and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/CR-01-submit.schema.json` (JSON Schema 2020-12), delivered with the submit template. Grading checks this schema first: a file that does not validate scores 0 and no test case is graded.

- Start from the template. It already lists one `testResults` row per test case, in the required order: `CR-01-TC-01` … `CR-01-TC-05`. Keep exactly these rows and these field names: `id`, `result`, `evidence`, and optionally `note`. Do not rename, add or remove fields or rows.
- `result` is `PASS`, `FAIL` or `NOT_RUN` (upper case). A `PASS` row lists at least one evidence path.
- Evidence paths are `evidence/<file name>`, for files directly inside `answers/CR-01/evidence/`.
- Before submitting, set the top-level `status` to `DONE` (all requirements met), `PARTIAL` or `BLOCKED`.

Example row:

```json
{ "id": "CR-01-TC-01", "result": "PASS", "evidence": ["evidence/tc-01-all-invoices.png", "evidence/tc-01-all-invoices.csv"] }
```

The engineering record describes the chosen export design, the standards applied and the edge cases handled. Its completeness is reviewed, but prose quality does not change functional points.