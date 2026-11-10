# team-pack 1.5.23: the helper submits finished items itself; deadline items by least slack

On top of 1.5.22. Priority unchanged: **PI first**, then deadline items, then the rest.

## Why
In IPZ0U79E the orchestrator was the bottleneck: while it worked a PI (13.5 minutes) finished items waited for it to
integrate them, and freed slots waited for it to pick the next item. Deadline items were ordered by wave, so a
30-minute item that needs 12-15 minutes went before a 15-minute item revealed later.

## Changes
1. **Auto-integration** (`MTM_AUTO_INTEGRATE`, on by default; tick `MTM_AUTO_TICK_MS`, 5 s). The helper integrates
   and submits a finished worker item by itself when its DONE.json is clean: status `DONE`, no `doubts`, quality gate
   `PASS` when the item has one, not s4, not a PI. Integrations are serialized (one at a time, also with the
   orchestrator's own `integrate_item`). `wait_for_update` reports them as `reason: "AUTO_SUBMITTED"` with
   `autoSubmitted[]` `{slot, item, status, submissionId, includedFixes, suggestNext}`. Anything else (doubts,
   PARTIAL, a missing gate, a failed auto-submission with `autoIntegrateError`) still comes as `SLOT_DONE`.
   While a PI is open, no-deadline items stay held (`DONE_HELD_FOR_PI`) so the PI's submission never queues behind
   them; deadline items are submitted at once.
2. **Least-slack order for deadline items**: slack = minutes left minus the minutes the effort needs
   (S 6, M 10, L 15, XL 20); ties by earlier wave, shorter deadline, more points. `board.deadlineWaiting` shows `slack`.
3. **Same-slot chain for dependencies**: a worker that fixed another item's defect for its own grade names it in
   DONE.json `includedFixes`; `suggestNext` then proposes that item to the same worker (`worker: "same"`,
   `followup_task`), since its fix is already on the branch.
4. **`suggestNext`** on every `AUTO_SUBMITTED` and `SLOT_DONE` entry: the first waiting deadline item that fits the
   slot, else (s5) a heavy item, else a chain item, else the most points per effort. Advice only; s4 gets only
   deadline suggestions.

## Tests
New section in `tests/slots.test.mjs`: a clean DONE is submitted by the helper (`AUTO_SUBMITTED` with
`suggestNext`), a DONE with `doubts` comes back as `SLOT_DONE` unsubmitted. Older tests run with
`MTM_AUTO_INTEGRATE=0`; the deadline-order expectation follows least slack.

## Planned
1.5.24: a pre-spawned PI agent. Time budgets per item after measuring a match.
