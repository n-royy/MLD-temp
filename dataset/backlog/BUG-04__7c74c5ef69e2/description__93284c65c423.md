# Cards dropped at the top of a list lose their order

## Context
On a board, a user drags a card above the first card of a list. It looks right, but after a refresh the order is sometimes different. When a second card is dragged to the top of the same list, the two top cards swap at random on every reload. Dragging between two cards or to the bottom works.

## Expected outcome
A card dropped at the top of a list stays exactly there, however many times cards are dropped at the top, and the order survives a reload.

## Requirements
1. Card and list ordering uses fractional positions from `src/lib/position.ts`. Fix the cause there. Keep the module path, every exported name (`POSITION_GAP`, `MIN_POSITION_GAP`, `appendPosition`, `betweenPosition`, `needsRebalance`, `rebalancedPositions`) and their signatures; other features and hidden tests depend on them.
2. Positions stay positive numbers. Moves between two cards, moves to the bottom, new cards and rebalancing keep their current behaviour.
3. Add automated tests. Existing tests must keep passing; do not weaken, skip or delete them. Put new tests in new files under `src/tests/`. The grader runs the whole test suite and the type check itself on your submitted revision; before it does, it restores the original `vitest.config.ts`, `tsconfig.json`, `tests/global-setup.ts`, `tests/helpers.ts`, `tests/accounting.test.ts`, `tests/heatmap.test.ts` and `tests/move-card.test.ts`, so changes to those files are discarded and reported. `tests/cascade.test.ts` is the only original test you may correct.

Maximum practice score: 80 points.

## Acceptance criteria
1. A card dropped above the first card of a list gets a position strictly between 0 and the position of that card.
2. Thirty drops in a row at the top of a list keep a strictly ordered sequence without ties.
3. Drops between two cards, at the bottom and into an empty list are unchanged.

## Grading
Half of the points come from the Minimum Verification Scenarios: the grader replays `BUG-04-mvs.test.ts` (provided at START) against your submitted source, and each case scores only when you report it PASS with evidence and the replay passes. The other half comes from organizer hidden tests that call the exported position functions directly with many more cases. Neither uses a database or a browser.

## Out of scope
Changing the drag-and-drop library, the database type of positions, or the rebalance strategy.

## Submission

Create `answers/BUG-04/`, copy `challenge/BUG-04-submit.json` to `answers/BUG-04/submit.json`, and create its `evidence/` child directory. Commit source, tests, evidence and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/BUG-04-submit.schema.json` (JSON Schema 2020-12). Grading checks this schema first: a file that does not validate scores 0.

- Keep exactly the template rows `BUG-04-TC-01`, `BUG-04-TC-02`, `BUG-04-TC-03` (see `BUG-04-minimum-verification-scenarios.md`) and the field names `id`, `result`, `evidence`, optionally `note`.
- `result` is `PASS`, `FAIL` or `NOT_RUN`. A `PASS` row lists at least one existing evidence path `evidence/<file name>`.
- Set the top-level `status` to `DONE`, `PARTIAL` or `BLOCKED` before submitting.

Complete the engineering record with the observed and expected behaviour, the root cause, the change and its verification.