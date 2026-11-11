# Playbook: other items, blocking defects and baseline failures

## Your grade needs another item's fix (make it yourself)
The brief says your result is "right only on source that also contains the <ID> fixes", loads the official data with
your submission, or a scenario fails on a defect another item describes. Nobody schedules that item for you; your
grade is computed on your own source (32PTEO8K / 6QYJQAVJ / SC0E8AV2: CR-07 waited for BUG-11 and scored 73, 0, 0).
1. First ~5 minutes: read the other item in `backlogFile` (description, scenarios, expected values); list what of
   its defect your rows touch. `otherItems` gives its state.
2. `SUBMITTED` already: rebase on the branch and go on.
3. Otherwise fix it completely for the cases your grade uses: reproduce with its own scenario, fix the cause, add a
   test, run the existing tests. One commit `<your ID>: include <other ID> fix for <what>`, before your own work.
4. Build and check your item on the fixed behaviour, never on the defect.
5. If the other item lands while you work: rebase at once, keep its version where both changed the same lines, rerun
   your checks. Name every item whose fix your commits include in DONE.json `includedFixes`.
6. Never submit FAIL, NOT_RUN or a value "computed elsewhere" because the other item has not landed.

## A defect outside your change blocks your verification
- Described by another item: as above when your grade needs it; when it only spoils a screenshot, work around it
  (playbook `ui-evidence`, step 5).
- Described by nobody: it is part of your item. Smallest change that lets the verification run as written, in its
  own commit, existing tests again, named in the engineering record. Never change organizer scripts or reports.
Before fixing anything outside your scope: `git -C <worktreeRoot> log --oneline HEAD..<branch> -- <file>`; if
another item already fixed it, rebase instead.

## Baseline failures (tests that already fail before your change)
Only the baseline owner the orchestrator names fixes them; everyone else counts the named test as a known failure,
leaves it alone and says it is fixed by `<owner ID>` on the branch. The owner reads the test and the design
documents (`DECISIONS.md`, specs, migration history) to decide which side is wrong; code drifted from the design:
fix the code (a new migration, never an edited old one); test contradicts the documented behaviour and the brief
allows it: correct the test and explain. Unclear after 10 minutes: leave it, report honestly, move on.
