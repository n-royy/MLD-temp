# team-pack 1.5.22: deadline items are never left without a slot

On top of 1.5.21.

## What went wrong in IPZ0U79E (1.5.21, stopped at minute 32)
| Time (game min) | What happened |
|---|---|
| 7 | Wave 2: PI-02, CR-07 (deadline 20), BUG-11, TASK-10 (heavy, deadline 30). Free: s3 and s5. The orchestrator started TASK-10 in s5 and then worked PI-02 for 13.5 minutes (first, 120/120). CR-07 was never started although s3 stayed free; it closed at minute 27 |
| 14.5 | PI-03 appeared; the helper started it in s3 (s4 held PI-02) |
| 20.5 | Wave 4: TASK-07 (deadline 15), TASK-06 |
| 21 | TASK-10 submitted (100/100); s5 went to TASK-12 (heavy, no deadline) through `next` while TASK-07 waited |
| 26.5 | The orchestrator started TASK-06 (no deadline) itself in s4; TASK-07 still had no slot |
Cause: SKILL.md said "PI first, immediately, by you; then deadline items", and nothing stopped a no-deadline item
from taking a slot a deadline item needed. s1/s2 held BUG-09 and TASK-08 (no deadline) the whole match.

## Review fixes (independent review of the 1.5.22 workflow)
Priority stays **PI first** (a race: every later team loses 10-40 %), then deadline items, then the rest. Deadline
items are assigned in the moments the PI does not need the orchestrator, so they cost the PI nothing.
- A wave with a PI and a deadline item while a slot is free returns `MATCH_UPDATED` with `incidentPending` at once
  (one cell to start the deadline items); `NEW_PI` follows as soon as the PI's data is ready. `noWait` never waits for
  a PI's collection, and `DEADLINE_SOON` (the safety net) is checked before it (before: up to 90 s, twice).
- No `DONE_HELD_FOR_PI` while the PI has no slot yet (the hold parked the very slot the PI needed, up to 8 minutes),
  nor while a deadline item waits and no slot is free (the finished slot is its way in).
- `deadlineWaiting` leaves out items started once before (released after a rejected gate) and items with under 4
  minutes left, so an unfinishable item no longer blocks every start until `force`.
- Wave order uses the same reveal time as the deadline (`revealedElapsedSec`, else `revealedAtMinute`, else first seen).
- s4 takes a deadline item only when it is a value TASK (no quality gate, effort S/M); a test suite, data pack, heavy
  item or BUG/CR goes to a worker.
- `integrate_item` with `next` returns a fresh board.
- Second review: the PI's slot is claimed the moment the PI is discovered (no deadline item is offered a slot the PI
  is about to take); a waiting deadline item un-holds only one finished slot per waiting item (oldest first); items
  already started are recognised after a helper restart (progress log); a PI whose data becomes ready wakes
  `wait_for_update` at once instead of after its 5-second poll.
- A heavy item with a deadline while s5 holds a heavy item without one takes the next free worker slot.
- Stale text removed: the orchestrator agent file's "dependencies are handled by rebasing", "PI and deadline items
  first"; SKILL.md's "syncing the dependent slot", the slot list without s5, a garbled sentence, and the list of
  allowed mid-work messages (now the same everywhere).

## Changes
Helper:
- `board.deadlineWaiting`: open deadline items (not PI) without a slot, nearest first.
- `start_work` refuses an item without a deadline with `DEADLINE_ITEM_WAITING` while a deadline item waits that fits
  the slot (s4: no BUG/CR); `force: true` overrides (deadline item that cannot be finished). The same check applies to
  `integrate_item` `next` (reported as `nextError`, the slot is left free for the deadline item).
Deadline order (helper `deadlineWaiting`, SKILL.md): earlier wave first; within a wave the shorter deadline first,
then more points. A later wave's item never jumps ahead of an unstarted item of an earlier wave, even with a shorter
deadline (TASK-10, deadline 30 at minute 7, takes 12-15 minutes; TASK-07, deadline 15 at minute 20, comes after it).

Orchestrator (SKILL.md, agent file):
- A wave's deadline items are assigned first (start_work + spawn, seconds), then the PI.
- s5 takes a deadline item (with a `team_feature_worker`) before a heavy item without a deadline; a heavy item with a
  deadline keeps s5.
- While working a PI: `wait_for_update` `noWait` between steps; a waiting deadline item and a free slot means start
  it at once.

Tests: incident tests check `DEADLINE_ITEM_WAITING`, `deadlineWaiting` (order, started and unfinishable items left out) and the s4 rule; all 7 test files pass.
