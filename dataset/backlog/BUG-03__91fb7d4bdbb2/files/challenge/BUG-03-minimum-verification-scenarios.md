# BUG-03 minimum verification scenarios

The scenarios below are also provided as an executable test file, `BUG-03-mvs.test.ts`. Grading replays this same file against your submitted source: a case scores only when you report it PASS with its evidence **and** the replay passes. Hidden tests then check further cases.

## Running the scenarios

1. Copy `BUG-03-mvs.test.ts` to `src/tests/bug-03-mvs.test.ts` (do not change it).
2. From `src/`: `pnpm vitest run tests/bug-03-mvs.test.ts > ../answers/BUG-03/evidence/mvs-tests.log 2>&1`
3. Record each case below in `submit.json`; every row references `evidence/mvs-tests.log`.

All amounts are minor units; `now` is the moment the status is computed.

## BUG-03-TC-01 – paid in full

Data: total 30000, two payments 18000 + 12000, due 2026-12-01, now 2026-11-05 09:00 UTC; and total 30000 with 30500 paid.

Expected: both invoices are `PAID`.

## BUG-03-TC-02 – due-date boundary

Data: total 30000, nothing paid, due 2026-11-05.

Expected: `SENT` at 2026-11-05 21:00 UTC (still the due date), `OVERDUE` at 2026-11-06 00:30 UTC.

## BUG-03-TC-03 – unchanged behaviour

Data: total 30000, 12000 paid, due 2026-10-01, now 2026-11-05; and a `DRAFT` invoice fully paid.

Expected: the first stays `PARTIAL` after its due date; the draft stays `DRAFT`; and, checked together with the fix, a single payment of exactly 12500 on a 12500 invoice is `PAID`.

Required evidence for every case: `mvs-tests.log`.
