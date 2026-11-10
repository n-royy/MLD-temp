# team-pack 1.5.21: no dependency scheduling; a dependent item fixes what it needs itself

On top of 1.5.20 (1.5.12 + slot installs in preparation).

## Why
In three matches CR-07 (deadline 20) needed BUG-11's fixes and lost points while BUG-11 was scheduled, prioritised
or waited for: 32PTEO8K 73/100, 6QYJQAVJ 0, SC0E8AV2 0. Scheduling the prerequisite like a deadline item took a
slot and still did not land in time.

## Changes
Helper (`src/runtime-session.mjs`, `bin/runtime-server.mjs`):
- Removed dependency detection: no `dependsOn` / `prerequisiteOf` / `effectiveMinutesLeft` on the board, no
  `dependsOn` / `prerequisiteOf` / `effectiveDeadlineAt` in the brief, no `PREREQUISITE_DEADLINE` and no deadline
  borrowed from another item (`stopBy` = own deadline or match end).
- An open PI holds every finished item without a deadline of its own; deadline items still go first.
- The brief carries `otherItems` with each item's state and `backlogFile`: every other revealed item's full
  description, so a worker can read and fix another item's defect.

Priority (SKILL.md, orchestrator agent): PI (by the orchestrator) → deadline items, nearest first → the rest.
Heavy items still go to s5.

Worker (WORKER.md "Your item needs another item's changes (fix it yourself)"): when the brief's grade needs another
item's fix, the worker reads that item in `backlogFile`, fixes it completely for the cases its grade uses (the
other item's own scenario, a test, existing tests), in its own commit before its own work, builds its item on the
fixed behaviour, never waits and never submits FAIL because the other item has not landed. If the other item lands
first, rebase and keep its version.

Tests: incident test for dependencies replaced (no dependency fields, backlogFile, PI hold for no-deadline items);
all 7 test files pass.
