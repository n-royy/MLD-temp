# CR-01 minimum verification scenarios

## Files provided with this item

| File | Use |
|---|---|
| `CR-01-submit.json` | Submission template, copy to `answers/CR-01/submit.json` |
| `CR-01-submit.schema.json` | JSON Schema that `submit.json` must satisfy |
| `CR-01-seed.ts` | Loader for your team's official CR-01 test data |
| `CR-01-signed-out-check.mjs` | Writes the TC-04 report |
| `CR-01-run-checks.mjs` | Runs `pnpm test` and `pnpm typecheck` and writes their logs |

## Preparation (once, before capturing evidence)

1. Obtain your team's official CR-01 test data from the QA test data store and save it unchanged as `answers/CR-01/evidence/cr-01-test-data.json` (the `answers/` folder next to `src/`).
2. Copy `CR-01-seed.ts` to `src/prisma/seed-cr01.ts` and load the data from the `src/` folder:
   `pnpm tsx prisma/seed-cr01.ts ../answers/CR-01/evidence/cr-01-test-data.json`
   This replaces every invoice in your database. Do not create, edit, pay or void invoices afterwards.
3. The fixture's `data.companies[].key` values (`A`, `B`, `VN`, `EMPTY`) and `data.scenarios` tell which company each case uses.

## Evidence rules (apply to every case)

- Location: every evidence file goes in `answers/CR-01/evidence/` with the exact name below. `submit.json` references them as `evidence/<name>`.
- Screenshots (PNG): desktop viewport at least 1280×720, from the running app (`pnpm dev` or `pnpm start`), showing the controls named in the case. No editing over app content.
- CSV files: the file exactly as the browser downloaded it, renamed only. Never open and re-save it in Excel or an editor; that changes encoding and quoting.
- Text and log files: written by the provided scripts, UTF-8, unedited.

## General evidence (required once)

| File | Content |
|---|---|
| `cr-01-test-data.json` | Your team's CR-01 test data, unchanged |
| `before-invoices.png` | Accounting → Invoices before the change: company filter and New invoice, no Export CSV |
| `after-invoices.png` | Same page after the change: company filter, Export CSV and New invoice, as in the wireframe |
| `test.log`, `typecheck.log` | Written by `node <path>/CR-01-run-checks.mjs ../answers/CR-01/evidence`, run from the `src/` folder |

## CR-01-TC-01 – all companies

Precondition: signed in; test data loaded; Accounting → Invoices.

1. Select **All companies**.
2. Click **Export CSV**.

Expected: one row for every invoice of the test data, in the on-screen order, including draft and void invoices; the file follows the invoice export standard.

Required evidence:
- `tc-01-all-invoices.png`: the filter showing All companies and the full invoice list.
- `tc-01-all-invoices.csv`: the file downloaded from that screen.

## CR-01-TC-02 – one company

Precondition: as TC-01.

1. Select the company with key `A` using the company filter and wait for its list.
2. Click **Export CSV**.

Expected: only company A's invoices, in the on-screen order, following the standard.

Required evidence:
- `tc-02-filtered-invoices.png`: the filter visibly set to company A, with its invoice list.
- `tc-02-filtered-invoices.csv`: the file downloaded from that screen.

## CR-01-TC-03 – special characters and zero-decimal currency

Precondition: as TC-01.

1. Select the company with key `VN` (Vietnamese name with a comma, double quotes and a line break).
2. Click **Export CSV**.

Expected: exactly one row; after RFC 4180 parsing the company name equals the stored name character for character; amounts follow the currency rules of the standard.

Required evidence:
- `tc-03-special-company.png`: the filter set to company VN, with its invoice.
- `tc-03-special-company.csv`: the file downloaded from that screen.

## CR-01-TC-04 – signed out

Precondition: the app is running; no session, no cookies.

1. Open `/accounting` in a fresh private browser window.
2. Run the provided check against the data source your export uses (your export endpoint, or the invoice list request it reads):
   `node <path>/CR-01-signed-out-check.mjs "<url>" <answers>/CR-01/evidence/tc-04-signed-out-request.txt`

Expected: the page shows the login page or a rejection, and the report says the request was rejected and leaked no invoice data.

Required evidence:
- `tc-04-signed-out.png`: the fresh window after opening `/accounting`.
- `tc-04-signed-out-request.txt`: the report written by the script.

## CR-01-TC-05 – empty selection

Precondition: as TC-01.

1. Select the company with key `EMPTY` (no invoices).
2. Click **Export CSV**.

Expected: a valid file containing only the header row; no rows from a previously selected company.

Required evidence:
- `tc-05-empty-export.png`: the filter set to company EMPTY, showing the empty state and Export CSV.
- `tc-05-empty-export.csv`: the file downloaded from that screen.
