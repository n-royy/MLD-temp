# team-pack 1.5.27: lanes, rescue and time budgets

On top of 1.5.26. Driven by R7WFBQBT (1.5.26: 6 of 12 items submitted) against 6QYJQAVJ (1.5.13: 11). The machine was
not the main cause (same model latency and job waits); the schedule was: short items waited behind long ones, heavy
workers held worker slots, a paused PI agent left an item untouched, and CR-07 was done but never committed.

## 1. A fast lane that is always free (s5/s6)
- s5/s6 take only PIs and short TASKs (TASK, not heavy, effort S/M). `start_work` of anything else there fails with
  `FAST_LANE_SHORT_ONLY` (with `freeWorkerSlot`) before Start Work is sent. Board role: `fast-lane`.
- `suggestNext` for the fast lane: a short deadline item, else the best short item, else nothing (it stays free for the
  next PI). Worker slots: deadline (least slack) → one heavy item → chain (`same`) → long items by points/effort →
  short items. `worker` is always the slot's own agent (`slot_agent`).
- The fast-lane agents (`team_incident_worker`) are never paused or interrupted; a PI goes to the agent of
  `incident.slot`.

## 2. Helper rescue before every deadline
- 2.5 minutes (`MTM_RESCUE_MINUTES`) before an item's deadline or the match end, the helper itself: clears a stale git
  lock, keeps a valid answer or builds an honest PARTIAL from the template (PASS rows whose evidence exists, the rest
  NOT_RUN "Not verified before the deadline."), commits the work in the slot and integrates + submits it.
  Reported as `AUTO_SUBMITTED` with `rescued: true` and `answer` (`worker`, `repaired`, `template`).
  A rescue that fails (e.g. the answer breaks the schema) wakes the orchestrator at once in the same reason with
  `status: "RESCUE_FAILED"` and the error.
- `DEADLINE_SOON` now comes at 6 minutes (`MTM_SOON_MINUTES`) with action `COMMIT_AND_VALIDATE_NOW` and
  `rescueAtMinutesLeft`, for every busy item alike (no late heavy call any more).

## 3. Time budget and stalled slots
- The brief carries `budgetMinutes` (S 8, M 12, L 18, XL 25) and `wrapUpBy` (never later than 6 minutes before the
  deadline or the match end). WORKER.md: score-first order, first checkpoint commit and valid answer at the first PASS,
  at most three rounds, wrap up by `wrapUpBy`.
- New wake-up `SLOT_STALLED`: a busy slot with no DONE.json and nothing written in its scratch, jobs or answer folder
  for 5 minutes (`MTM_STALL_MINUTES`); reported once; the orchestrator sends that agent one message.

## 4. Lighter process
- Removed: the separate heavy worker (`team_heavy_worker`; a heavy item is done by the slot's own worker), the PI
  pause, `high` reasoning effort (default reasoning everywhere).
- The checklist stays a plan and one final pass; open boxes no longer block the helper's auto-submit.
- Kept: helper auto-submit, deadline-first suggestions, git lock fixes, installs in preparation, the PI log sweep.

## 5. Specification items (R7WFBQBT TASK-08: 84/100, 5 planted defects, the batch-volume one missed)
- The checklist also takes apart the organizer's specification files (`challenge/*.md` except submit/MVS): every
  rule and statement is a `Spec` box; sentences that bind every rule ("any number of lines in one import ...") come
  first as "constraints on every rule", with the cases they need (every entry point, hundreds of records in one call,
  mixed order); the module/entry-point table is listed once; out-of-scope lines are notes.
- `weakBoxes`: open boxes, `Spec` boxes without a proof, and proofs copied onto 3+ boxes. SLOT_DONE `checklistOpen`
  names them ("C12 copied proof"). On an item with a quality gate such a `Spec` box stops the helper's auto-submit;
  the orchestrator sends exactly those boxes back once (more than ~8 minutes left).
- WORKER.md `SUITE_DETECTION` rewritten: the Spec boxes are the matrix; test boundaries, volume (past batch/chunk
  sizes), order, repetition, every path that sets a field and modules together before anything else; one mutant per
  Spec box with its own proof; the project's tests once at the end for the changed modules (never two full runs on a
  slow machine); no product change only to run on this machine.
- Effort: an item worked from an organizer specification file (brief, `onStartFiles` or `releaseFiles`) or a test
  suite scored by broken builds is at least level L (never short, never the fast lane); the heavy score is unchanged.

## Tests
- New `tests/lane.test.mjs`: fast lane refusal and suggestion, rescue of an uncommitted item as a PARTIAL, SLOT_STALLED,
  a suite item with copied Spec proofs left to the orchestrator.
- `checklist.test`: Spec boxes from a spec file (real TASK-08 text: 29 boxes), `weakBoxes`; `effort.test`: the L floor.
- Older tests pin `MTM_SOON_MINUTES=3` and turn the rescue off; the heavy final-call test now checks the common call.
