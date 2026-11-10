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

## Changes
Helper:
- `board.deadlineWaiting`: open deadline items (not PI) without a slot, nearest first.
- `start_work` refuses an item without a deadline with `DEADLINE_ITEM_WAITING` while a deadline item waits that fits
  the slot (s4: no BUG/CR); `force: true` overrides (deadline item that cannot be finished). The same check applies to
  `integrate_item` `next` (reported as `nextError`, the slot is left free for the deadline item).
Orchestrator (SKILL.md, agent file):
- A wave's deadline items are assigned first (start_work + spawn, seconds), then the PI.
- s5 takes a deadline item (with a `team_feature_worker`) before a heavy item without a deadline; a heavy item with a
  deadline keeps s5.
- While working a PI: `wait_for_update` `noWait` between steps; a waiting deadline item and a free slot means start
  it at once.

Tests: incident test checks `DEADLINE_ITEM_WAITING` and `deadlineWaiting`; all 7 test files pass.
