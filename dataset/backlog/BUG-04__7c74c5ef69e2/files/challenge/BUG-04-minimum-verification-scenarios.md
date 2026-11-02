# BUG-04 minimum verification scenarios

The position cases below are also provided as an executable test file, `BUG-04-mvs.test.ts`. Grading replays this same file against your submitted source: a case scores only when you report it PASS with its evidence **and** the replay passes. Hidden tests then check further cases.

## Running the scenarios

1. Copy `BUG-04-mvs.test.ts` to `src/tests/bug-04-mvs.test.ts` (do not change it).
2. From `src/`: `pnpm vitest run tests/bug-04-mvs.test.ts > ../answers/BUG-04/evidence/mvs-tests.log 2>&1`
3. Record each case below in `submit.json`.

## BUG-04-TC-01 – drop above the first card

Data: a fresh list whose only card has the position of a newly created card.

Expected: a card dropped above it gets a position strictly between 0 and that card's position.

Required evidence: `mvs-tests.log`.

## BUG-04-TC-02 – two drops at the top keep their order

Data: cards A, B, C created in that order; drag C above A, then B above C.

Expected: positions are positive and strictly ordered B < C < A. In the app, the order is B, C, A after two reloads.

Required evidence: `mvs-tests.log`, `tc-02-top-order.png` (the list after the second reload).

## BUG-04-TC-03 – other drops unchanged

Data: a drop between cards at 65536 and 131072, a drop below the last card at 196608, and a drop into an empty list.

Expected: positions 98304, 262144 and 65536; and, checked together with the fix, a drop above a card at 65536 lands strictly between 0 and 65536.

Required evidence: `mvs-tests.log`.
