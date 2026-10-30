# BUG-02 minimum verification scenarios

## Files provided with this item

| File | Save as | Use |
|---|---|---|
| `BUG-02-submit.json` | `answers/BUG-02/submit.json` | Submission template |
| `BUG-02-submit.schema.json` | (reference only) | JSON Schema that `submit.json` must satisfy |
| `BUG-02-seed.ts` | `src/prisma/seed-bug02.ts` | Creates your team's two BUG-02 client companies |
| `BUG-02-report.ts` | `src/prisma/report-bug02.ts` | Writes `currency-report.txt` from the database |
| `BUG-02-run-checks.mjs` | anywhere outside `answers/` | Runs `pnpm test` and writes `test.log` |

## Preparation (once)

1. Obtain your team's official BUG-02 test data from the QA test data store and save it unchanged as `answers/BUG-02/evidence/bug-02-test-data.json` (the `answers/` folder next to `src/`). `data.steps` lists the exact values to enter for each case. Do not reuse values from another match.
2. From the `src/` folder: `pnpm tsx prisma/seed-bug02.ts ../answers/BUG-02/evidence/bug-02-test-data.json`. This creates the companies with keys `VND` and `USD`.

## Evidence rules

- Every evidence file goes in `answers/BUG-02/evidence/` with the exact name below.
- Screenshots (PNG) come from the running app and show the saved amount.
- After the three UI cases, write the report from the `src/` folder:
  `pnpm tsx prisma/report-bug02.ts ../answers/BUG-02/evidence/bug-02-test-data.json ../answers/BUG-02/evidence/currency-report.txt`
  It reports the latest invoice of each company. Do not edit it, and do not create further invoices for these companies after the cases below.
- `test.log` is written by `node <path>/BUG-02-run-checks.mjs ../answers/BUG-02/evidence`, run from `src/`. Do not edit it.

## BUG-02-TC-01 – VND invoice

1. Accounting → Invoices → New invoice. Company: the company with key `VND`. One line with the description, quantity and unit price from `data.steps["BUG-02-TC-01"]`.
2. Create, then Issue the invoice.

Expected: the invoice total equals quantity × unit price, in VND.

Required evidence: `tc-01-vnd-invoice.png`, `currency-report.txt`.

## BUG-02-TC-02 – VND payment

1. Accounting → Payments. Company `VND`, applies to the invoice from TC-01, amount from `data.steps["BUG-02-TC-02"]`.
2. Record the payment.

Expected: the paid amount equals the typed amount; the invoice is partially paid.

Required evidence: `tc-02-vnd-payment.png`, `currency-report.txt`.

## BUG-02-TC-03 – USD invoice still correct

1. Accounting → Invoices → New invoice. Company `USD`, values from `data.steps["BUG-02-TC-03"]`.
2. Create, then Issue the invoice.

Expected: the invoice total equals quantity × unit price, in USD.

Required evidence: `tc-03-usd-invoice.png`, `currency-report.txt`.

## BUG-02-TC-04 – existing tests

1. Run `BUG-02-run-checks.mjs`.

Expected: `pnpm test` exits 0 with no failed test. Grading does not read `test.log`: the grader runs the whole test suite itself on your submitted revision, with the original test configuration and tests restored, and needs at least 12 passing tests and none failing.

Required evidence: `test.log`.
