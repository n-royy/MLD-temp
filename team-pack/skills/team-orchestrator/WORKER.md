# Working one backlog item (worker playbook)

Read by every `team_feature_worker`, and by the orchestrator when it does an item itself. Same rules as the
single-agent pack; only the place changes: a worker works in its slot (`slotMatchRoot`) instead of `matchRoot`.

## Inputs
The orchestrator's message gives: backlog ID, `briefFile`, `worktreeRoot`, `slotMatchRoot`, slot index, and notes
(baseline failures, port, files to avoid). `briefFile` (JSON) has the full brief (`item`, including "Submission" and
"submit.json contract"), `startInstruction`, `submitTemplate`, MVS, `requiredTestCases`, `answerFile`,
`evidenceDir`, `organizerFiles`, `validateCommand`, `doneFile`. Company Tool answers the orchestrator fetched are in
the same folder (`company-*.txt`). `<slotMatchRoot>/.mtm-tmp/repo-map.md` describes the code base: read it first
instead of exploring.

## Your slot may still be installing (first minutes of the game)
If `slotInstallState` in the brief is not `DONE`, read and edit code first, then before your first test or server
run call the helper tool `wait_jobs` with `dir` = the brief's `jobsDir` and `names: [<slotInstallJob>]` (one blocking
call; never poll). FAILED/LOST: run the slot's locked install yourself as a job (`start_jobs`, same command as in
`<jobsDir>/<slotInstallJob>.cmd.txt`) and `wait_jobs` again. Long test runs and builds can use the same two tools.

## UI evidence: foundation steps and subject steps
T5QSM1E2 lost 3/4 rows of BUG-02 (sidebar of BUG-01 intercepted the Accounting tab clicks) and 4/5 rows of CR-01
(home-made sign-in script never finished hydration) with correct code: a `NOT_RUN` row scores 0.
- Split every MVS scenario into **subject steps** (the behaviour this item fixes or adds, e.g. the BUG-02 invoice
  form and its saved amount) and **foundation steps** (only reach the state: sign in, open a page or tab, load QA
  data with the organizer loader).
- Subject steps are done for real through the UI the MVS names. Never create the data under test by API, database
  or script when the MVS says to enter it on a screen; never edit, crop or compose a screenshot.
- Foundation steps may take a lawful shorter path that does not change what the row proves: the signed-in session
  `shot.mjs` saves (run it once, then your own browser script uses `browser.newContext({ storageState:
  '.mtm-tmp/tools/auth.json' })` as CR-03 did, instead of typing credentials), opening the page or tab by its URL, keyboard (Tab,
  Enter, arrow keys) instead of a click on a covered control, ordinary scrolling, a larger desktop viewport that
  still meets the MVS size rule. Wait for a visible element of the target screen, not for `networkidle`.
- No shortcut when the item or the row is about that step itself: an item about sign-in, sessions, permissions,
  navigation or layout, or a signed-out row (CR-01 TC-04), does the step exactly as written.
- Never: `click({ force: true })`, dispatching DOM events, injecting CSS/JS into the page, or patching the running
  app with a change that is not in your commit. Never commit a fix that another item owns (see "A defect that blocks
  your verification" below): briefs list "unrelated UI changes" as out of scope.
- Every shorter path used goes into that row's `note`, e.g. "opened Accounting by URL with the keyboard because the
  desktop sidebar (BUG-01) covers the tab; invoice entered and issued through the form".
- Be efficient, not quick to give up (6QYJQAVJ BUG-09: 20 minutes on a home-made Playwright script; 6YOBNM4Z: the
  same rows left NOT_RUN scored 15/80). Start from `shot.mjs` and the slot's tools; write your own script only for the
  steps they cannot do. When it fails twice the same way, change the approach (a foundation shortcut above, a URL,
  the keyboard), not the target: every MVS row is run and proved while `stopBy` allows; a row is NOT_RUN only when
  time is out.

## Check the evidence path first (UI items)
Before changing code, open each screen your evidence rows need once (`shot.mjs` or one browser step) and confirm the
controls you must operate are reachable. A covered control, a redirect loop, a sign-in that never completes or a
blank page is found now, not at the end, and you try the foundation paths above while the code is still open.

## When another item blocks your evidence
If your note says another item fixes something your scenario needs (e.g. a layout bug hiding content), or the
check above finds it, do everything else first (code, unit tests, data checks, organizer scripts that do not need
the fixed screen), then reach the screen by a foundation path above and take the evidence on your own revision; the
blocking defect may stay visible in the screenshot as long as the row's required content is readable. When the
orchestrator tells you the blocker is on the branch, `git -C <worktreeRoot> rebase <branch>` (commit first), restart
your server and retake only the rows that still lack evidence.

## A defect that blocks your verification
Your rows are scored only when their verification runs (organizer scripts, MVS scenarios, required evidence). When
a defect outside your change stops it (a page that never settles, a crash, a screen that does not load), decide
who owns the defect:
- **Owned by another item**: an item in the brief's `otherItems` (or the orchestrator's note) describes it. Do not fix
  it; work around it by a foundation path above, or wait for its fix on the branch ("When another item blocks your
  evidence"). Exception: your grade is computed on your own source with that fix in it, and it will not land in
  time ("Your item needs another item's changes" below).
- **Owned by nobody** (no item describes it): it is part of your item. Make the smallest change that lets your
  verification run as written, in its own commit, run the existing tests again, and name it in the engineering
  record (defect, cause, fix). Never change the organizer scripts or their reports instead.
A row is never FAIL or NOT_RUN only because such a blocker exists while time remains: fix it or work around it,
then run the verification.

### Your item needs another item's changes (brief `dependsOn`)
The brief lists in `dependsOn` the items your brief names, with their state (`NOT_STARTED`, `IN_PROGRESS`,
`SUBMITTED`). Read what your brief says about them. When your grade is computed on **your own submitted source**
with those changes in it (e.g. "right only on source that also contains the <ID> fixes", "loads the official data
with your submission"), the other item's changes must be in your commit:
- `SUBMITTED`: rebase on the branch (`git -C <worktreeRoot> rebase <branch>`) before your final checks.
- **Your item has a deadline and the other is not submitted: work as if it were already fixed** (1.5.17; SC0E8AV2:
  CR-07 waited for BUG-11, whose fix came 16 minutes after reveal, and missed its 20-minute deadline). Write your
  feature and your checks against the correct behaviour from the first minute. Within your first ~5 minutes, list
  what of the other item's fix your rows need (read its brief in `dependsOn`, its scenarios, the code), make that
  smallest change yourself, in its own commit named `<your ID>: include <other ID> fix needed for <what>`, and name
  it in the engineering record. Never wait for the other worker.
- No deadline on your item: the same smallest change when the other item may not land before your `stopBy` minus
  ~5 minutes. Rebase again if it lands before you finish.
- Never submit FAIL or a computed-elsewhere value only because the other item has not landed while you can still
  include its change (32PTEO8K: CR-07 reported TC-02 FAIL "BUG-11 defects remain in this source" and lost 27 points).
- **The prerequisite's fix may also arrive by cherry-pick**: the orchestrator sends you `<other ID> fix is commit
  <sha> ...: git -C <worktreeRoot> cherry-pick <sha>`. If your own version already makes your rows pass, skip it
  (`git cherry-pick --abort` on a conflict) and say so in one line; otherwise take it (a conflict with your own
  change of the same lines: keep the other item's version, which its own tests prove), rerun, go on.
- **Deadline items commit early**: after every row that passes, commit (source, tests, the answer filled honestly
  with PARTIAL and the rows not yet run as NOT_RUN). At the deadline the orchestrator submits your last commit as it
  is, so an uncommitted half-feature is worth 0 and a committed passing row is worth its points.
Your brief lists in `prerequisiteOf` the deadline items that need yours, and `effectiveDeadlineAt`: treat it as
your deadline (your `stopBy` already uses it). **Commit the fix they need first, alone**: as soon as the code change
works (your reproduction passes), before evidence, answer or quality gate, commit only the source change (no
`answers/`, no tests of yours) as `<your ID>: fix <what>`, then write its full sha to
`<slotMatchRoot>/.mtm-tmp/<your ID>/FIX_COMMIT` (one line). The helper hands it to the dependent worker, so its
deadline item no longer waits for your submission. Later corrections of the fix go in new commits (never amend or
rebase that commit) and get a new FIX_COMMIT line only when the dependent needs them.

## An item of a kind no section here names
The brief's `grading` is the organizer's scoring text. Plan from it whatever the item is: list what is scored (each
field, row, file, requirement or hidden check it names), how each part is checked (exact comparison, replay, import,
hidden tests on other data), and secure the parts one by one, committing a valid answer after each (status
`PARTIAL` until the last). Prefer running the real code or the real data over reasoning about them. When `grading`
rewards more than passing your own checks, apply the closest quality gate below. `effort` in the brief (level and
reasons) tells you how much of your time the organizer expects the item to take: plan for it.

## Quality gate (brief `qualityGate`)
Some items are graded on more than their rows: a test suite by the broken builds it detects, a data pack by every
requirement, a feature by hidden tests on the official data. Rows that pass are then not the end: an item submitted
early with a defect left in it loses points that the remaining time could have kept (32PTEO8K: TASK-08 submitted at
minute 12 of 40 with a planted bug undetected, 84/100; TASK-07 35/50). When the brief has `qualityGate`, after your
rows pass and are committed, run the gate for its `kind`, write the result to `qualityGate.reportFile` (a table:
check, result, what you changed), fix what it finds, commit, and put
`"qualityGate":{"kind":"<kind>","status":"PASS|PARTIAL","summary":"one line"}` in DONE.json.
Time: the gate is worth its time whenever `stopBy` (or `effectiveDeadlineAt`) is more than ~8 minutes away. Stop it
at `stopBy` minus ~5 minutes, commit what holds, and report `PARTIAL` with what was not checked. Never leave a
mutant, a temporary source restore or a debug edit in the tree: `git status --porcelain` must be empty before DONE.
- **`SUITE_DETECTION`** (your suite is scored by the broken builds it fails on):
  1. Rule matrix: for every rule of the specification, every operation that reaches it (create, update of each
     field, moving between accounts or owners, delete, batch), every field the rule states, and variants (boundaries
     on both sides, zero, empty, non-ASCII text, several rows at once). Each cell has a case that asserts it.
  2. Self-mutation: for each rule, break the code that implements it in your slot (invert the condition, drop the
     field update, shift the boundary by one), run your suite, record which case failed, restore the file
     (`git -C <worktreeRoot> checkout -- <file>`). A rule no case catches gets a new case. The application fixes you
     made stay; the mutants never.
  3. Never assert what the specification does not state: a case that fails on a correct build never counts.
  4. The organizer's broken builds are the defects the issued source shipped with, not only the ones you imagine
     (6QYJQAVJ TASK-08: 36 of 37 own mutants caught, 80/100). Run your suite on the issued behaviour: restore every
     product file that differs from `issuedRevision` in the specification's modules (fixes by any item, the branch
     included: `git -C <worktreeRoot> diff --name-only <issuedRevision> HEAD -- <modules>`), run, record which cases
     fail, restore HEAD. Every fix in those modules must turn at least one case red; a fix none catches gets a case.
  5. Any rule about text (equal ignoring case, title case, trimming, parsing amounts) gets non-ASCII variants:
     accented and Vietnamese letters in both cases (`Phở`/`PHỞ`, `Đà Nẵng`/`đà nẵng`), and Unicode signs (`−` minus).
  6. **Every quantifier of a rule is a dimension of the matrix** (32PTEO8K / 6QYJQAVJ TASK-08: the misses were an
     update-path payee defect and non-ASCII names, both in words of the spec). Underline the words `either`,
     `both`, `each`, `every`, `any number`, `however`, `in any account`, `included`, `only`, `otherwise`, `never`,
     `at most`, `before or after`; each one lists the values a broken build may handle wrongly. Write one case per
     value: "either side" → change the first side AND the second side; "however the payee was set" → each listed
     path; "any number of lines" → at least 3 lines in one call, with the rule on the 2nd or 3rd line, not only the
     first; "at most 7 days before or after" → 7 and 8 days, before and after; "otherwise" → both branches; "never"
     → the case that would tempt the code. A broken build usually breaks one value of one dimension.
  7. **Mutants by script, not by hand, every rule id first.** (SC0E8AV2 TASK-08: 10 mutants, all on T and A rules,
     the I0 one interrupted; the I, R, S, M and B rules - half of the specification - were never mutated, 80/100
     for the third match in a row.) Order the list rule-first: one mutant for EVERY rule id of the specification
     (T1..T6, A1, A2, B1, I0..I5, R1..R3, S1, S2, M1..M3 in that example: 25 runs of ~20 s, ~9 minutes) before any
     second mutant of a rule; then the quantifier values of step 6. Mutate each section as soon as its cases are
     written, not all at the end. Write `.mtm-tmp/<ID>/mutants.mjs`: a list of `{file, find, replace, rule}`
     (aim for 30+), and for each: apply it, run only your suite files
     (`vitest run <files>` or the project's equivalent, not the whole suite), record KILLED/SURVIVED, restore the
     file in a `finally`. Run it as one job (`start_jobs`/`wait_jobs`), print only the survivors. Every survivor
     gets a case or a stated reason (equivalent mutant). The table goes into `qualityGate.reportFile`.
  8. **No false alarm on a correct build:** run your suite files 3 times on HEAD (all three green; a flaky case is
     fixed or removed), with generous timeouts for Windows (no 5-second budget-load timeouts), each test on its own
     fresh data (no order dependence), and no assertion on ids, timestamps or order the spec leaves open.
- **`DATA_REQUIREMENTS`** (a pack, dataset or manifest checked against requirements):
  1. Requirement table: every quantity, ratio, mix, overlap, recurrence, special case and size limit of the
     specification, the value you reached and the margin. Where a requirement is a bound or range, stay clearly
     inside it (not on the boundary; a few percent margin where the specification allows).
  2. Replay as the grader does: on the issued source (`issuedRevision`), through the import path and settings the
     specification describes. To get the issued behaviour in your slot, restore every product source file that
     differs (`git -C <worktreeRoot> diff --name-only <issuedRevision> HEAD -- <app source dir>`, tests excluded) with
     `git checkout <issuedRevision> -- <files>`, run the replay, then `git checkout HEAD -- <files>`. Every number in
     the manifest must match the replay exactly.
  3. **The manifest is the parser's output, never your prediction** (SC0E8AV2 TASK-07, 35/50 for the third time: the
     generator wrote what it intended and submitted with "parser/import replay pending"). The generator script
     writes the files, then runs the issued parser and import itself (the same functions the grader calls, with
     the stated settings, in a fresh test database) and writes the manifest from what they return: parsed rows,
     added per file, final count and balance. One script, one run: the manifest cannot disagree with the replay.
     Do this from the first version, even under a deadline; a hand-predicted manifest is the slow path.
- **`OFFICIAL_DATA`** (hidden tests, the official test data loaded with your submitted source):
  1. Load the official test data with your own branch (rebased on everything your brief `dependsOn` needs, see
     "Your item needs another item's changes") and compare every reported figure with values computed independently
     from the brief and the current standards; they must agree.
  2. Hidden tests check the rule in more cases than the MVS: one test of your own per rule boundary the brief or
     standard states (before, on, after; empty; non-ASCII; rounding), in a new test file.

## Reading values from an image or a drawing (brief `needsVision`)
A misread digit costs the field (6QYJQAVJ TASK-11: `255230227` read as `252320227`, 16 points). For every number,
id and code you take from an image:
1. Read it twice, independently: the whole image once, then a crop or zoom of just that region (write the crop
   with a short script: sharp/Playwright/`magick`, whatever the slot has), and compare digit by digit, counting the
   digits. Different readings: read a third, larger crop.
2. A value the image or brief says comes from elsewhere ("TASK-10 baseline", "the balance of …") is checked against
   that source: the team's submitted answers in `teamAnswersFile` (JSON by item key), the data, or the app. A
   mismatch means a misread until proven otherwise.
3. Write each value with the region it came from in your evidence.

## Values that come from another item
Whenever an input refers to another item's figure, compare it with `teamAnswersFile` (every submitted answer of
the team) before you use it, and name the source in the record.

## Heavy items (brief `heavy: true`)
The brief's effort profile (`effort`, level XL, with its reasons) marks the item as expensive. You usually work it in the dedicated slot s5 and have this item only:
aim for every row, with full quality (tokens are not the limit here; time is). Points come per test-case row, so
secure rows one by one. The brief gives `stopBy` (ISO time: the earlier of the item deadline and the match end);
check the clock with `Get-Date` (or `new Date()`) before each step.
1. **Plan first** (`.mtm-tmp/<ID>/plan.md`, before any code change): read the whole brief, the MVS file, the
   organizer files and the current company standards the brief points to. Write: every row (id, what it proves, how
   it is verified, estimated cost: low = logic or organizer test only, medium = one screen or one data set, high =
   several screens, large data or a long build), the acceptance criteria, the files you expect to change, the code
   several rows share, the risks, and the order of work (shared code first, then rows from cheapest to most
   expensive).
2. **Progress notes** (`.mtm-tmp/<ID>/progress.md`): after every step, one or two lines (row, state, commit, what is
   next, open doubts). A long session gets compacted: when you lose track, re-read plan.md and progress.md instead of
   exploring again.
3. **Row by row.** Verify each row properly (its MVS scenario, the organizer scripts, the checks its criteria name).
   You may add tests of your own in new files when they help you get the row right. After each row that PASSes: put
   that row and its evidence into the answer, keep the other rows `NOT_RUN` with a note, `status` PARTIAL, run
   `validateCommand`, commit. The committed answer is then always submittable.
4. **Self-review** before the final checks: compare every acceptance criterion and every row with the code, the
   evidence files and the answer (exact file names, values, formats, the current standard); fix what does not match.
5. **Sync with the branch** before the final checks: other items land while you work (fixes of shared code,
   baseline repairs). `git -C <worktreeRoot> log --oneline HEAD..<branch>`; if anything landed, commit, `rebase
   <branch>` (when both sides changed the same code, keep the branch's fix and re-apply yours on top), then run the
   whole suite, the typecheck and every row's verification again on the rebased code, and retake only the evidence
   the rebase changed.
6. **Time.** Keep working the next row until `stopBy` is about 2 minutes away: about 1.5 minutes before it the
   orchestrator submits your last commit without asking, so whatever is committed with a valid answer by then counts
   and uncommitted work is lost. When `stopBy` is 2 minutes away: make sure the last commit has a valid answer with
   the rows that PASS, write doneFile (`status` PARTIAL, the real counts), and finish.
7. All rows PASS, self-review and sync done: `status` DONE, doneFile, finish.

## Do not give up a row while time remains
(For a heavy item, its rule 6 sets the stop time.)
A UI row stays `NOT_RUN` only when every lawful foundation path failed, or your deadline (or the match end) is less
than 3 minutes away. Until then keep trying the next path; commit after each passing row so the orchestrator's
safety net can integrate what is verified. A home-made browser script that failed twice is replaced by `shot.mjs` or
by another foundation path, not by `NOT_RUN`. Put each failed path in that row's `note` and in DONE.json `doubts`.

## Next item in the same slot (rare)
When a queued item has no deadline and your slot frees first, the orchestrator may hand it to you by follow-up.
- Work on one item at a time, exactly as below, and finish it with its doneFile and a one-line final answer.
- The orchestrator integrates and submits it, resets your slot to the branch head (which now includes your item and
  anything else submitted), and sends the next item's briefFile by follow-up. Do not start the next item before that
  message: its answer folder and brief do not exist yet.
- Keep what you learned: the code layout, the running dev server (restart only if it stopped), the database, your
  evidence tools. Re-read only the files the new item touches; files from your previous item are already merged.
- If `baselineRepair` is set in the brief, the baseline failure is already fixed on the branch: the existing suite
  should be green; say "existing tests pass on a branch that includes baseline repair <sha>" where relevant.

## Item kinds of the official format (warm-up 5APIQYXW: 10 items, 4 waves, deadlines of 8-18 minutes)
Read the brief's "Grading" and "Submission" sections first; they decide what to do.
1. **Function with hidden tests** (hidden or organizer tests announced anywhere: brief, MVS file or criteria; e.g.
   "organizer hidden tests call `<fn>` directly"; typical: invoice status, card position, aging report, contact links). Half the points are hidden boundary cases from the company standard.
   - Query the standard yourself (Company Tools below): search with the brief's own words, read the CURRENT revision
     completely, follow cross-references. Write every rule and boundary as a numbered table in
     `.mtm-tmp/<ID>/rules.md` before coding.
   - Implement the pure function exactly; keep module path, exported names and signatures.
   - Tests are required here: a NEW file `src/tests/<id>-*.test.ts` with one case per rule and per boundary (day
     before/on/after, zero, exact equality, rounding, each currency, empty/null input, ordering). Run the provided
     `<ID>-mvs.test.ts` as the MVS instructions say. Never hard-code the examples.
2. **Investigation** (PI: release, component, flag, complete sets, request ids). Change code only when the brief
   asks for a fix (then also item kind 1 for the fixed function). Pull the logs and
   the incident-report rules with Company Tools, save large answers to files and extract the facts with a small
   Node script (complete sets, earliest timestamps), never by eye. **Log searches are paged** (5APIQYXW: "total": 38,
   "returned": 20): page with the tool's offset/page parameter until you hold every entry (`returned` summed = `total`),
   or narrow the query until `returned == total`; a set built from the first page is incomplete and scores 0. Strings exactly as logged. Speed is scored: finish
   as soon as every field is backed by the data. Write the answer with the helper tool `answer_item`
   (`values` = the fields, `record`, `evidence` = your script output): it fills the template, validates, commits and
   writes DONE.json in one call.
3. **Value question** (TASK). First decide what is asked:
   - "which value does the source / the code compute" → RUN the issued code on the official QA data (a script that
     calls the real function, or the real flow on the test database), not by reading and reasoning.
   - "what is the correct value" under a company standard (how much is overdue, the total in the reporting
     currency...) → compute it from the CURRENT standard with a small script on the QA data, then run the code too.
     If they differ, the standard wins: the code may hold a defect another item fixes (cascade trap). Say so in the
     engineering record.
   Apply the normalization literally. Deadlines are short (8 minutes). Write the answer with `answer_item` (values,
   record, evidence) instead of editing submit.json, validating, committing and writing DONE.json by hand.
4. **Behaviour bug / feature with UI** (layout, currency, CSV export). Take any "before fixing" evidence BEFORE
   changing code. Load the official QA data with the provided loader. Screenshots with `.mtm-tmp/tools/shot.mjs`.
   **Organizer scripts are the grading instruments** (`<ID>-layout-check.mjs`, `-run-checks.mjs`, `-signed-out-check.mjs`,
   `-seed.ts`, `-report.ts`): BUG-01 of 5APIQYXW was scored from the layout report the provided script writes. Run
   them exactly as the MVS file says (arguments, output names, dev and production), never replace them with your own
   script, never edit their reports.
Items without test-case rows (PI, value questions): DONE.json `tests` = `{"required":0,"executed":1,"passed":1,...}`
for the one verification you ran (or `failed` 1 if it did not hold).

Grader facts that apply to every item:
- The grader runs the whole suite and the type check itself and first RESTORES the files the brief lists (e.g.
  `vitest.config.ts`, `tsconfig.json`, `tests/global-setup.ts`, `tests/helpers.ts`, original test files): never
  change them; your change would be discarded and reported. Only the test the brief names may be corrected.
- New tests go in new files under `src/tests/`.
- Company standards are revised between matches: the current revision in the Company Tools overrides LESSONS,
  product notes, caches and anything from earlier matches.

## Company Tools (you can call them)
The tool definitions (names, parameters, paging) are in `<slotMatchRoot>/.mtm-tmp/company-tools.json`.
Your helper process has no team key, so pass your slot: `company_tools_list({ slotMatchRoot })` and
`company_tool_call({ name, arguments, backlogId: "<ID>", slotMatchRoot })`. The call is relayed through the
orchestrator's helper. Answers over 6000 characters are saved to a file in your slot and you get its path: read it
in slices. Use them for every standard, QA data set, log and ticket the item needs; do not guess a format.
One call per tool call: never call Company Tools from a loop or a script in an exec cell (the match README: "Call
them one at a time, never from a script or loop"); the helper queues calls one at a time.

## Boundaries
- Edit only inside `slotMatchRoot`. Never touch the main checkout, other slots or other items' answers.
- Commit only on the slot's local branch (`git -C <worktreeRoot> add -- <folder>` then `commit -m "<ID>: <summary>"`).
  Never push, never pull into the assigned branch, never force anything, never change the remote.
- Never call `start_work`, `submit_work`, `integrate_item`, `report_progress` or `configure_session`; the orchestrator
  owns Game Master. `company_tool_call` / `company_tools_list` with `slotMatchRoot` (see above) are yours.
- Never print or write credentials. Local passwords live only in git-ignored env files.
- Use the network only for Git and package registries. No web search or browsing: look things up in the source,
  the brief, package metadata (`pnpm audit --json`, `npm view`) and the Company Tools.
- If you need to run the app, use port `<default port> + 10 × slot index` and check it is free first; stop every
  server you started before finishing. Use the slot's own database (its env file already names it).

## How to work
1. Read the brief and any Company Tool files already in your folder, then query what else the item needs yourself
   ("Company Tools" above). For PI and BUG they are mandatory input; their information is authoritative.
2. Find the code with `rg -n` and read only the slices you need. Make the smallest correct change at the root cause,
   in the existing style, inside `slotMatchRoot`.
   Before changing code outside your item's scope (a defect your tests or evidence trip over), check whether another
   item already fixed it: `git -C <worktreeRoot> log --oneline HEAD..<branch> -- <file>`. If it did, commit and
   `git -C <worktreeRoot> rebase <branch>` instead of writing your own fix (WXNDA4AW: CR-02 re-fixed a Reports
   refetch loop BUG-01 had landed 6 minutes earlier, then hit INTEGRATION_CONFLICT).
3. Test exactly the item's test cases, no more ("Test cases" below), except the quality gate your brief names
   (`qualityGate`, "Quality gate" below): one run per template row (`<ID>-TC-01..n`),
   following its MVS scenario, plus only the checks the acceptance criteria name. Think through edge cases while
   writing the code (empty input, permissions, boundaries, validation), but do not turn them into extra test cases,
   extra pages, viewports or scripts. Max ~3 fix/test rounds.
4. Commit early: as soon as the MVS pass, commit (the orchestrator can integrate the last commit at the safety net).
   Before you report an "existing tests pass" case FAIL because of a known baseline failure, check whether its fix
   (or another item's fix of the same test) already landed: `git -C <worktreeRoot> log --oneline HEAD..<branch>`;
   if anything landed, commit, `rebase <branch>` and run the suite again: fixes of other items land while you work.
   If you are the baseline owner and the item has a deadline, the baseline fix comes first.
   Preflight before the final checks and final evidence: `git -C <worktreeRoot> diff --name-only HEAD...<branch>`.
   If it lists a file you changed, or code of a screen you capture, commit and `rebase <branch>` now; when both sides
   fixed the same defect keep the branch's version. Then run the final checks on the rebased code and retake only
   the evidence whose screen or output the rebase changed. If nothing overlaps, do not rebase.
5. Answer: edit `answerFile` (created from the template). Keep exactly the template's keys and rows, fill every field
   truthfully, set the top-level status the way the brief says. Every list stays a JSON array even with one element
   (`"evidence": ["evidence/a.png"]`). Write it with `apply_patch` or Node (`JSON.stringify(obj, null, 2)`);
   **never with PowerShell `ConvertTo-Json`**. Evidence files go in `evidenceDir` and are referenced as
   `evidence/<file>` (never with an `answers/<ID>/` prefix, never at repository root). Evidence = exactly the files the MVS/brief names as required (e.g. `tc-01-desktop-dashboard.png`,
   a "before fixing" screenshot), plus one small text file (command + tail) for a row that names none. No extra
   screenshots, layout dumps or duplicate logs; `evidenceFiles` lists exactly the referenced files.
   A value answer (number, ID or text compared exactly) always holds your best answer computed from the source you
   have. When the brief names a commit or data you cannot obtain, compute it on the issued checkout, set `PARTIAL` and
   state the gap in the evidence; never submit `0`, an empty string or any other placeholder (it always scores 0).
6. Run `validateCommand` (same checks as `validate_answer`); fix until it prints `"valid":true`.
7. Commit source + tests + answer + evidence. `git -C <worktreeRoot> status --porcelain` must be empty.
8. Write `doneFile` LAST (it tells the orchestrator you are finished), with Node or `apply_patch`:
   `{"status":"DONE|PARTIAL|BLOCKED","tests":{"required":n,"executed":n,"passed":n,"failed":n,"skipped":n,"summary":"one line"},"summary":"one line","doubts":"optional one line"}`
   `tests` counts test cases = the template rows (`required` = number of rows; `executed`/`passed`/`failed` = rows
   run/PASS/FAIL), never the number of unit tests, suite tests, builds or typechecks. The helper recounts from the
   committed answer rows anyway; existing-suite results go into `summary` and the engineering record as text.
9. Final answer: one line (`<ID> DONE, tests 5/5, see DONE.json`). No diffs, no logs.

If the orchestrator sends a follow-up (a rejected integration or submit gate), fix exactly that, rerun only the affected test cases (and the existing suite once if a criterion requires it), no new evidence
commits for re-runs; the
tests, commit, rewrite `doneFile`, and answer in one line again. For `INTEGRATION_CONFLICT`:
`git -C <worktreeRoot> rebase <branch>`, resolve keeping both changes (when both sides fixed the same defect, keep
the branch's version), rerun only the test cases touched by the conflict, `git rebase --continue`.
A message `<ID> on <branch> changed <files>` is information, not an order: rebase at your preflight (step 4), or at
once only if you are about to take final evidence.

## Playbook by type
| Type | How | Done when |
|---|---|---|
| PI | Company tools first (all log pages, tickets, monitoring), facts by script; fix code only if the brief asks | Every asked field backed by the data + every template test case run |
| BUG | Reproduce with the MVS, smallest fix at the root cause, keep MVS tests unchanged | Every template test case PASS + criteria checks + required evidence |
| CR | List every spec point and edge case, implement them; automated tests when the brief asks (exactly its points) or hidden tests are announced (item kind 1: every rule and boundary) | Every template test case PASS + criteria checks + required evidence |
| TASK | Do exactly what is asked, verify by command/test | Every template test case (or the asked verification) done |

## Test cases (what to run and count)
- Count honestly (`executed = passed + failed + skipped`); the helper recounts from your rows anyway.
- The item's test cases are the rows of `submitTemplate.testResults`; their number is `requiredTestCases`. Run each
  once following its MVS scenario and fill exactly those rows. Never add rows or invent extra scenarios.
- Run other checks only when an acceptance criterion names them, once, at the end:
  "existing tests keep passing" → the existing suite once; "typecheck/build passes" → that command once;
  "add automated tests for X" → write tests for exactly the listed points (no more). They are not test cases: report
  them as text in the engineering record, not in the counts.
- Do not write new unit tests, extra browser scripts, extra viewports or pages "to be safe" when nothing asks for
  them; do not rerun a passing suite unless code changed after the run. Exception that is not optional: when the
  brief asks for automated tests or announces hidden tests, test every rule and boundary of the standard (item kind 1).
- An item without rows (`requiredTestCases` 0): do the one verification the brief asks for and count it.

## Existing tests
Never weaken, skip, delete or rewrite an existing test to make it pass: fix the product code. Only when the brief
explicitly allows correcting a test that contradicts the intended behaviour may you change it: decide the intended
behaviour from the brief, the business rule and the repository's design documents, not from what the current code
does; explain it in the answer's engineering record and put the same reason (30+ characters) in DONE.json
`doubts` as `acknowledgeTestChanges: <reason>` so the orchestrator passes it on. New tests you add are fine.

## Baseline failures (tests that already fail before your change)
Usually already repaired before you start (`baselineRepair` in the brief). Otherwise only the worker the orchestrator
names as baseline owner fixes them; other workers count the named test as a known
pre-existing failure, do not touch it, and write in the engineering record that it is fixed by `<owner ID>` on the
assigned branch. The baseline owner:
1. Reads the failing test and the design documents (`DECISIONS.md`, `BUILD_REPORT.md`, specs, migration history) to
   decide which side is wrong.
2. If the code drifted from the documented design (for example a later migration contradicts a documented rule),
   fixes the code: for a database rule add a new migration that restores the documented behaviour; never edit old
   migrations. Runs the whole suite again.
3. If the test contradicts the documented behaviour and the brief allows it, corrects the test and explains why.
4. Keeps the fix minimal; describes it in the engineering record ("baseline failure in X caused by Y; fixed by Z").
5. If the cause stays unclear after 10 minutes, leaves the test, reports the criterion honestly and moves on.

## Status of an answer
`status` follows the item's own acceptance criteria exactly: `DONE` when every criterion holds, `PARTIAL` when one
is not met (say which one and why in the engineering record), `BLOCKED` when the work could not proceed. Do not mark
an item PARTIAL for a problem outside its criteria: an existing test that fails or times out on this machine without
your change (6QYJQAVJ TASK-08: a 5-second budget-load timeout on Windows) is recorded as pre-existing, not a reason
for PARTIAL.

## Scratch scripts
Organizer scripts (seed, report, run-checks; copies are in `organizerFiles`) and your own check or reproduction
scripts go in a `.mtm-tmp/` folder (git-ignored), e.g. `<slotMatchRoot>/src/.mtm-tmp/`, so imports still resolve.
Commit only product code, tests and `answers/<ID>/`.

## Missing tools
If the item needs a tool the machine lacks, install it following "Toolchain installs" in
`.agents/skills/game-preparation/ENVIRONMENT.md` (user scope, no admin), then continue.

## Speed (from BCYRV9M9: 23-60 one-second polls and up to 14 reruns of a home-made screenshot script per item)
- **The machine is shared by six slots** (UA9QF7DU: two 1 GB production builds, three installs and the baseline at
  once; test runs took 4 minutes, git timed out, nothing was submitted in 25 minutes). Run the narrowest command
  that proves your point: the test files you touched, not the whole suite; the dev server, not a production build,
  unless your evidence needs the build. Builds, installs and full test runs go through `start_jobs`: the job runner
  queues them machine-wide (at most 3 at once), so a job may wait before it starts; its log says so. Stop your
  servers and watchers (`serve.mjs --stop`) when your item is done.
- Long commands (install, build, full test runs, typecheck, prisma): an exec call returns after about 30 s whatever
  `yield_time_ms` it asks for (UV8P4HUS), so anything longer goes through `start_jobs` (dir
  `<slotMatchRoot>/.mtm-tmp/jobs`) and ONE blocking `wait_jobs`. Never poll a running command with `write_stdin` or
  1 s waits: every poll is a full model turn. Start a server with the slot's
  `.mtm-tmp/tools/serve.mjs` (it returns when the port answers) instead of starting and polling `pnpm dev`.
- Waiting on a cell that still answers "Script running" (a `wait_jobs`, a long command): ONE `wait` with
  `yield_time_ms: 270000`. It returns as soon as the cell ends, so the long yield costs no time; every short wait
  (1000, 10000) is a full model turn (5FLQMNAA: 76 ten-second waits across the workers). Never use the `sleep` tool.
- A change that does not show in the running dev server (a style, a class, a config value): restart the server once
  (`serve.mjs --stop`, then start it again). Still not visible: the dev server is not the question. Verify on a
  production build (`build`, then `start` through `serve.mjs`) and take the evidence there, and look for the cause in
  the source (the file, import or rule you changed), never in the bundler's output or cache files (5FLQMNAA: ~10
  minutes of one item went into reading compiled CSS chunks and restarting the dev server).
- Screenshots in your context: `view_image` only to confirm a final evidence shot whose content a text check
  (layout report, page text, a DOM query) cannot confirm, once per shot. Every image stays in your context for the
  rest of the item.
- Evidence screenshots: use `.mtm-tmp/tools/shot.mjs` (signed-in, waits for content, one call per screenshot);
  write your own browser script only if it is missing or cannot do the step, and fix it at most twice; then switch
  to another foundation path ("UI evidence" above). When a screenshot fails, read which wait failed before acting:
  `goto` (server, route or session down), the page never settles (constant refetch: pass `--wait <visible text>`),
  or the expected content is missing (product behaviour). Only the last is a reason to change product code.
- Do not message the orchestrator while working: no progress reports, no questions it cannot answer. Your only
  message is the one-line final answer after doneFile; put doubts in DONE.json.

## Cost discipline
Tokens and time both count. Read `repo-map.md` before searching, read only the slices you need, tail long outputs
(`| Select-Object -Last 30` / `tail -30`), do not re-read files, run the full suite only when a criterion asks for
it (once, at the end; otherwise the module suite proves the change), and keep messages to the orchestrator to one line.
