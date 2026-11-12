# Playbook: a test suite run on broken versions (`qualityGate` SUITE_DETECTION)

Any item - TASK, CR, BUG or PI - whose judging runs your test suite "on a correct version and on several versions
that each break the rules in one place". The rules are the specification file when there is one, otherwise the
company standards the brief names.

How it is scored: the organizer plants a few defects in the application, each against one statement of the
specification; each is worth its fix plus its detection by your suite (R7WFBQBT TASK-08: 5 planted, 12 + 4 points
each). The organizer's own suite checks the application; your suite must pass on a correct build.

1. **The `Spec` boxes of the checklist are the matrix.** "Constraints on every rule" (any number, any order, every
   entry point) first. Each box gets at least one case through the real entry point the spec's module table names
   (the handler, not only the function, when both are listed).
2. **Where planted defects hide** - test these axes for every rule before anything else:
   - boundaries on both sides (on, one before, one after);
   - **sizes the brief states** ("orders with a few hundred lines and lines of a few thousand units", "large
     amounts", "long text"): go past each by 10x - lines, units, amounts, string length, nesting depth, number of
     locations - one case each (8COFCHVS: `many-lines`, `large-quantity`, `large-amounts`, `long-line`,
     `deep-fields`, `many-locations` versions undetected in 7 items, ~80 points);
   - **volume sized from the code**: `rg -n -i "page_?count|page_?size|chunk|batch_?size|limit|offset|max_?rows|\.slice\(|\[[^]]*:" <the modules the
     spec names and the db/query helpers they call>`, then more records in ONE call than the largest size found and
     over 1,000, in every kind of call (import lines; added, updated and deleted together). A volume case checks
     every resulting row, not a count (45CVHIIC caught the paging defect `slice(i, pageCount)` with 1,005 records;
     39PSWT5C missed it with 160);
   - order (reverse, interleaved, two lines competing for one candidate), repetition (the same line or call twice),
     every path that sets a field (direct, rule, import, schedule, merge), modules together in one case.
3. **The first suite run shows most planted defects**: fix each in the application at its root cause, then cover the
   axes above.
4. **One mutant per `Spec` box**, not per idea: break the code behind that statement (shift the boundary, cap the
   loop or page at a small size, drop the field update, skip the second pass, reverse the order), run only the
   integration suite, record the failing case, restore the file (`git -C <worktreeRoot> checkout -- <file>`). A box
   no case catches gets a case. Proof per box: ` - proof: <case title>; mutant <what was broken>`. Gate PASS only
   when every `Spec` box has one.
5. The project's existing tests once at the end (core rule "Verification budget"). Never assert what the
   specification does not state (tie order, ids, timestamps): a case failing on a correct build never counts.
