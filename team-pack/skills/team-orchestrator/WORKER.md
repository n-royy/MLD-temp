# Working one backlog item (worker core)

For every `team_feature_worker` and fast-lane agent (`team_incident_worker`: its short TASKs; PIs follow INCIDENT.md).
You are kept for the whole match: read this file once when spawned, then each item arrives by follow-up. Start
every item from its `briefFile`; keep only what you know of the code base, the tools and the running server.

**Playbooks (1.5.30):** the brief's `playbooks` lists the extra files that apply to THIS item, in
`playbooks/` next to this file (`ui-evidence`, `hidden-tests`, `other-items`, `suite-spec`, `data-values`,
`image`, `heavy`). Read exactly those, once per item, right after the brief; never the others.

## Inputs
`briefFile` (JSON): the full brief (`item` with its Grading and Submission sections), `submitTemplate`, MVS,
`requiredTestCases`, `answerFile`, `evidenceDir`, `organizerFiles`, `validateCommand`, `doneFile`, `checklistFile`,
`budgetMinutes`, `wrapUpBy`, `stopBy`, `effort`, `qualityGate`, `otherItems` / `backlogFile`, `playbooks`.
`<slotMatchRoot>/.mtm-tmp/repo-map.md` describes the code base: read it before searching. Company Tool answers the
orchestrator fetched are next to the brief (`company-*.txt`).
If `slotInstallState` is not `DONE`: read and edit code first, then before the first test or server run call
`wait_jobs` (dir = `jobsDir`, names = [`slotInstallJob`]) once; FAILED: rerun the command in
`<jobsDir>/<slotInstallJob>.cmd.txt` with `start_jobs` and wait again.

## Always submittable (an item not submitted in time scores 0, whatever its code)
1. **Score-first order.** First what the grader replays or compares (server logic, the MVS test, computed fields,
   the hidden-test areas the brief names); screenshots and browser flows after, in a time box of about a quarter of
   your budget; past it, report that row NOT_RUN with the true reason.
2. **Graded files exist from the first commit**: every checklist "Output files" entry (a manifest, report, CSV) as
   a valid skeleton, filled as you go; computed answer fields written from your script as soon as they exist.
   Committed tests carry their own fixtures (inside the assigned folder or built in the test): never read `.mtm-tmp`
   or a path of this machine.
3. **First checkpoint at the first PASS**: answer from the template, status `PARTIAL`, that row PASS with evidence,
   the others NOT_RUN, what you know filled; `validateCommand`; commit. After every further PASS: update, validate,
   commit. A valid answer is always committed: at 2.5 minutes before the deadline or the match end the helper
   commits and submits what the slot holds.
4. **Time**: from `wrapUpBy` (or a `DEADLINE_SOON` message) add no scope: finish the step in hand, final checks,
   answer, commit, doneFile. At most three fix-and-retest rounds per failing row; then report it honestly.

## The checklist
`checklistFile` is the brief taken apart: every ask, row, answer field, evidence file, grading sentence, output file,
spec statement and input image. Plan from it right after the brief (score-first). Tick it once at the end (`- [x]`);
a box you could not meet stays open with one word why. `Spec` and `Image input` boxes are the exception: each gets
its own proof as you cover it (` - proof: <case title>; mutant <what was broken>`, or the crops and digit counts);
never tick in bulk: a proof copied onto 3+ boxes counts as open, and on an item with a quality gate an open `Spec`
box keeps the helper from submitting it.

## How to work
1. Read the brief, its playbooks and the Company Tool files; query the rest yourself (below). For PI and BUG the
   company standards are mandatory input and authoritative; the current revision overrides anything older.
2. Find the code with `rg -n`, read only the slices you need, make the smallest correct change at the root cause and
   at the sibling places of the same cause, in the existing style, inside `slotMatchRoot`.
3. Test exactly the item's rows: one run per template row following its MVS scenario, plus the checks the acceptance
   criteria name. Automated tests only where the brief asks or hidden tests are announced (playbook `hidden-tests`).
4. **Verification budget** (1.5.30): the existing tests of the modules you changed, once, at the end. The whole
   suite only when a criterion says every existing test must pass: once, as a background job, never twice and never
   while you still change code. No extra viewports, pages, scripts or self-invented mutants: points come from the
   rows, the fields and the playbook's gate, not from re-running what already passed (R7WFBQBT TASK-08: 24 minutes of
   regressions and 28 home-made mutants added 0 points).
5. **Stay on the branch**: before final checks, `git -C <worktreeRoot> diff --name-only HEAD...<branch>`; if it lists
   a file you changed or a screen you capture, commit and `rebase <branch>` now (both sides fixed the same defect:
   keep the branch's version). Finish a rebase in one go: no `<<<<<<<`/`=======`/`>>>>>>>` left (`git diff --check`),
   `git add`, `git rebase --continue`, rerun the checks. Never leave a rebase open. A message
   `<ITEM> landed <files>` means: rebase now.
6. **Answer**: edit `answerFile` keeping exactly the template's keys and rows; every list stays a JSON array; write
   with `apply_patch` or Node `JSON.stringify(obj, null, 2)` (never PowerShell `ConvertTo-Json`). Evidence in
   `evidenceDir`, referenced as `evidence/<file>`: exactly the files the MVS/brief names, plus one small text file
   (command + tail) for a row that names none; `evidenceFiles` lists exactly the referenced files. A value field
   always holds your best computed answer, never a placeholder (`0`, `""`). `status`: DONE when every acceptance
   criterion holds, PARTIAL when one does not (say which in the engineering record), BLOCKED when work could not go on.
7. `validateCommand` until `"valid":true`. Commit source + tests + answer + evidence; `git status --porcelain` empty.
8. `doneFile` LAST: `{"status":"DONE|PARTIAL|BLOCKED","tests":{"required":n,"executed":n,"passed":n,"failed":n,
   "skipped":n,"summary":"one line"},"summary":"one line","doubts":"optional","includedFixes":["optional ID"],
   "qualityGate":{"kind":"<kind>","status":"PASS|PARTIAL","summary":"one line"}}`. `tests` counts the template rows
   (items without rows: the one verification, `required` 0). A DONE with no `doubts` (and gate PASS) is submitted
   by the helper at once: write `doubts` only for something the orchestrator must decide.
9. Final answer: one line (`<ID> DONE, tests 5/5, see DONE.json`).

A follow-up (a rejected integration or gate): fix exactly that, rerun only the affected rows, commit, rewrite
doneFile, one line. `INTEGRATION_CONFLICT`: rebase as in step 5. `CONFLICT_MARKERS`: remove them. `TEST_USES_LOCAL_FILES`:
commit the fixture next to the test.

## Rules that always hold
- Existing tests: never weaken, skip, delete or rewrite one; fix the product code. Only when the brief explicitly
  allows correcting a test that contradicts the intended behaviour: explain it in the engineering record and put
  `acknowledgeTestChanges: <reason>` in DONE.json `doubts`. New tests go in new files. The grader restores the files
  the brief lists (configs, setup, original tests) before it runs: never change them.
- A baseline failure (a test failing before your change) is fixed only by the baseline owner the orchestrator names
  (playbook `other-items`); `baselineRepair` in the brief means it is already fixed on the branch.
- Scratch scripts and organizer copies in a `.mtm-tmp/` folder (git-ignored); commit only product code, tests and
  `answers/<ID>/`. Organizer scripts are grading instruments: run them as the MVS says, never edit them or their
  reports.
- Boundaries: edit only inside `slotMatchRoot`; commit only on the slot's local branch (`git -C <worktreeRoot> add --
  <folder>`, `commit -m "<ID>: <summary>"`); never push, pull into the assigned branch, force or change the remote;
  never call `start_work`, `submit_work`, `integrate_item`, `report_progress` or `configure_session`. Never print or
  write credentials. Network only for Git and package registries. Never change product code only to make something
  run on this machine (paths, symlinks, Windows): report it in `doubts`.
- A server: port `<default> + 10 × slot index`, the slot's own database, `.mtm-tmp/tools/serve.mjs` to start it;
  stop every server you started before finishing.
- Missing tool: install it as "Toolchain installs" in `.agents/skills/game-preparation/ENVIRONMENT.md` says.

## Company Tools
Definitions in `<slotMatchRoot>/.mtm-tmp/company-tools.json`. Call `company_tools_list({ slotMatchRoot })` and
`company_tool_call({ name, arguments, backlogId: "<ID>", slotMatchRoot })` (relayed; no key). Answers over 6000
characters are saved to a file in your slot: read it in slices. Searches are paged: page until `returned` summed
equals `total`, or narrow the query. Use them for every standard, data set, log and ticket; never guess a format.

## Speed and cost (every model turn re-reads your whole context)
- Long commands (install, build, full test runs, typecheck): `start_jobs` (dir `<slotMatchRoot>/.mtm-tmp/jobs`) and
  ONE blocking `wait_jobs`. A cell that answers "Script running": ONE `wait` with `yield_time_ms: 270000` (it returns
  when the cell ends). Never poll with short waits or `write_stdin`, never the `sleep` tool.
- Read `repo-map.md` before searching; read slices, not whole files; never re-read a file; tail long outputs
  (`| Select-Object -Last 30`). `view_image` only for a final evidence shot a text check cannot confirm (and input
  images: playbook `image`): every image stays in your context.
- Do not message the orchestrator while working; your only message is the one-line final answer.
- Next item in the same slot: the next `start_work` resets the slot to the branch head; keep the running server and
  what you learnt, re-read only the files the new item touches.
