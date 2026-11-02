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
  app with a change that is not in your commit. Never commit another item's fix in your item: briefs list
  "unrelated UI changes" as out of scope.
- Every shorter path used goes into that row's `note`, e.g. "opened Accounting by URL with the keyboard because the
  desktop sidebar (BUG-01) covers the tab; invoice entered and issued through the form".

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

## Do not give up a row while time remains
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
   as soon as every field is backed by the data.
3. **Value question** (TASK). First decide what is asked:
   - "which value does the source / the code compute" → RUN the issued code on the official QA data (a script that
     calls the real function, or the real flow on the test database), not by reading and reasoning.
   - "what is the correct value" under a company standard (how much is overdue, the total in the reporting
     currency...) → compute it from the CURRENT standard with a small script on the QA data, then run the code too.
     If they differ, the standard wins: the code may hold a defect another item fixes (cascade trap). Say so in the
     engineering record.
   Apply the normalization literally. Deadlines are short (8 minutes).
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
3. Test exactly the item's test cases, no more ("Test cases" below): one run per template row (`<ID>-TC-01..n`),
   following its MVS scenario, plus only the checks the acceptance criteria name. Think through edge cases while
   writing the code (empty input, permissions, boundaries, validation), but do not turn them into extra test cases,
   extra pages, viewports or scripts. Max ~3 fix/test rounds.
4. Commit early: as soon as the MVS pass, commit (the orchestrator can integrate the last commit at the safety net).
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
`git -C <worktreeRoot> rebase <branch>`, resolve keeping both changes, rerun only the test cases touched by the conflict, `git rebase --continue`.

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
an item PARTIAL for a problem outside its criteria.

## Scratch scripts
Organizer scripts (seed, report, run-checks; copies are in `organizerFiles`) and your own check or reproduction
scripts go in a `.mtm-tmp/` folder (git-ignored), e.g. `<slotMatchRoot>/src/.mtm-tmp/`, so imports still resolve.
Commit only product code, tests and `answers/<ID>/`.

## Missing tools
If the item needs a tool the machine lacks, install it following "Toolchain installs" in
`.agents/skills/game-preparation/ENVIRONMENT.md` (user scope, no admin), then continue.

## Speed (from BCYRV9M9: 23-60 one-second polls and up to 14 reruns of a home-made screenshot script per item)
- Long commands (install, build, full test runs, typecheck, prisma): an exec call returns after about 30 s whatever
  `yield_time_ms` it asks for (UV8P4HUS), so anything longer goes through `start_jobs` (dir
  `<slotMatchRoot>/.mtm-tmp/jobs`) and ONE blocking `wait_jobs`. Never poll a running command with `write_stdin` or
  1 s waits: every poll is a full model turn. Start a server with the slot's
  `.mtm-tmp/tools/serve.mjs` (it returns when the port answers) instead of starting and polling `pnpm dev`.
- Evidence screenshots: use `.mtm-tmp/tools/shot.mjs` (signed-in, waits for content, one call per screenshot);
  write your own browser script only if it is missing or cannot do the step, and fix it at most twice; then switch
  to another foundation path ("UI evidence" above).
- Do not message the orchestrator while working: no progress reports, no questions it cannot answer. Your only
  message is the one-line final answer after doneFile; put doubts in DONE.json.

## Cost discipline
Tokens and time both count. Read `repo-map.md` before searching, read only the slices you need, tail long outputs
(`| Select-Object -Last 30` / `tail -30`), do not re-read files, run the full suite only when a criterion asks for
it (once, at the end; otherwise the module suite proves the change), and keep messages to the orchestrator to one line.
