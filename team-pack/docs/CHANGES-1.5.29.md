# team-pack 1.5.29: safe integration under conflicts, gradable outputs first

On top of 1.5.28. Driven by 39PSWT5C (1.5.28, 408 points, 8 of 14 submitted). Per-item grader results:

| Item | Score | What went wrong |
|---|---|---|
| BUG-11 | 18/70 | The rescue committed s4 in the middle of a conflicted rebase: `src/shared/util.ts` reached the grader with `<<<<<<< / ======= / >>>>>>>`; every replay and hidden test failed to transform (the four reported values still scored). |
| TASK-07 | 0/45 | The rescue committed 12 statement files; the manifest, written last, did not exist: "manifest.json not found" on all six criteria. |
| CR-07 | 35/70 | Three browser rows NOT_RUN at the deadline (21 points); a committed test read `.mtm-tmp/CR-07/official.zip` (team-tests 0/3). |
| TASK-08 | 97/110 | batch-volume missed again: the volume cases used a few hundred records. |
| BUG-09 | 60/60, 7 min late | Done at 08:15:26, held for the open PI-03 until 08:22:24: its slot idle. |
| PI-04, TASK-12 | not submitted | The rescue pushed the empty template; the submission was refused. |

CR-07 had carried BUG-11's fix to `util.ts`; BUG-11 learnt of it only at its own integration near the end.

## Helper
- **Conflict markers never reach the branch.** `integrate_item` refuses commits that add `<<<<<<<`, `=======` or
  `>>>>>>>` lines (`CONFLICT_MARKERS`, checked on the slot diff and again after the cherry-pick; nothing pushed).
- **Rescue settles an open git operation first**: a rebase, merge or cherry-pick left in progress is continued when
  every conflict is resolved, aborted otherwise (back to the worker's own commit); staged files that still carry
  markers go back to the last commit. When the rescue's cherry-pick conflicts with the branch, it keeps the branch's
  side of each conflicting hunk and every other change of the item (`-X ours`) instead of submitting nothing.
- **Overlaps**: after every integration, busy slots whose own changes touch the same files are listed
  (`overlaps[]`, also in `AUTO_SUBMITTED`); the orchestrator tells those agents to rebase at once.
- **`TEST_USES_LOCAL_FILES`**: a committed test that reads `.mtm-tmp` or a path of this machine is refused (not in a
  rescue).
- **`RESCUE_NOTHING_TO_SUBMIT`**: a rescue whose answer is still the empty template does not push or submit; the
  orchestrator is woken with that code.

## Nothing waits for a PI
- Removed the 1.5.10 hold (`DONE_HELD_FOR_PI`, `board.heldForPi`): a finished item is reported and auto-submitted at
  once, also while a PI is open, and its slot refilled. 39PSWT5C BUG-09: done at 08:15:26, submitted at 08:22:24 -
  its slot idle 7 minutes while PI-03 was worked in the fast lane. Integrations are serialized and take seconds.

## Checklist and worker
- New "Output files" boxes: every file the Requirements ask to commit or produce (a manifest, a report, a CSV), to
  create as a valid skeleton at the first checkpoint.
- Spec "constraints on every rule": volume cases now over 1,000 records in one call (past batch, chunk and SQL
  parameter limits), in each kind of call.
- WORKER.md "Always submittable": output files and computed fields first; committed tests carry their own fixtures;
  browser build started in the background in the first minutes; a rebase is finished in one go (`git diff --check`).
- SKILL.md: the new codes and the `overlaps[]` rule.

## Tests
- `lane.test`: markers refused, local-file test refused, overlaps reported; rescue in a conflicted rebase submits
  without markers keeping the branch's line.
- `checklist.test`: Output files boxes; the volume wording.
