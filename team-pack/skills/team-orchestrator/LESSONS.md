# Lessons from earlier matches (team MLD)

Short rules learned from real matches. Each line names where it came from. They override habits.

## Submission contract
- The submit schema is graded first: an answer that does not validate scores 0 even when the code is right.
  Run `validate_answer` before every commit. (practice QNW5V6OU: 2 of 5 answers invalid, 400 points at risk)
- Lists stay JSON arrays even with one element. Write submit.json with `apply_patch` or Node, never PowerShell
  `ConvertTo-Json`, which turned `["evidence/x.txt"]` into `"evidence/x.txt"`. (QNW5V6OU BUG-02, TASK-02)
- Keep the template's rows and field names exactly; status values come from the brief (`DONE`, `PARTIAL`, `BLOCKED`).
- Every PASS row needs at least one existing `evidence/<file>`; the brief may name required evidence files
  (e.g. a "before fixing" screenshot). (QNW5V6OU BUG-01)
- TASK answers can be compared by exact string equality: copy the format the brief asks for (e.g. a digits-only
  JSON string). Always submit your best answer computed from the source you have. If the brief points to a commit
  or data you cannot obtain, compute the answer on the issued checkout, set `PARTIAL` and state the gap in the
  evidence. Never submit `0`, an empty string or any other placeholder: it always scores 0, while the answer traced
  on the issued source scored full points twice. (QNW5V6OU, HW828P0Y TASK-01)

## Engineering
- Workers could not use the Company Tools (their own helper process is unconfigured: NOT_CONFIGURED in 7GAZA14X)
  and fell back to assumptions about the export standard. Since 1.5.0 they relay through the orchestrator helper
  (`slotMatchRoot`): standards must come from the tools, never from guesses.
- Standards are revised between matches ("the current revision is authoritative and overrides assumptions or files
  built for earlier matches", warm-up 5APIQYXW CR-01): never reuse a format, value or answer from an earlier match.
- Hidden tests call pure functions with boundary cases from the company standard (5APIQYXW BUG-03/BUG-04/CR-02/
  CR-03, half of their points): a rule table and one test per rule and boundary are part of the work.
- Test only the item's template test cases (TC-01..n) plus the checks its criteria name. DO6SQWGV workers ran and
  counted 17/27/41 "tests" for 3/4/5 test cases (suite, build, typecheck, own scripts), wrote unit tests no brief asked
  for (BUG-02) and produced 14 evidence files for 3 rows (BUG-01): time and tokens with no score. Exception: CR-01
  criterion 5 asked for automated export tests, so those were required.
- A clear configuration/migration drift is repaired at baseline even when other baseline failures (product logic of
  backlog items) stay red; otherwise the nearest-deadline item that needs "existing tests pass" owns the repair. An
  owner without a deadline landed the fix after a deadline item had to be submitted, which lost that item's case.
- Never weaken an existing test to get green; decide intended behaviour from the brief, business rules and the
  repository's design documents, not from current code. (QNW5V6OU BUG-02)
- A test that already fails at baseline is a planted problem: 4 of 5 items required "existing tests pass", so leaving
  it unresolved cost that criterion on every item and forced PARTIAL everywhere. The baseline owner (SKILL.md
  "Baseline failures") investigates it (design docs vs code), fixes the code when the code drifted, and says so in the engineering record.
  (QNW5V6OU fixed the test instead; VREGZAVG left it and lost the criterion 4 times)
- A baseline test can pass for the wrong reason: a shared local database kept the previous match's fix, so the
  planted CASCADE defect looked fixed and no migration was committed; the grader's fresh database will fail it.
  Isolate databases per match and judge defects from the code/migration folder. (FWBI6I0S, all 4 items at risk)
- Organizer scripts and your own checks live in `.mtm-tmp/`; commit only product code, tests and answers.
  (QNW5V6OU: helper scripts were committed into src/)
- Before starting a dev server, check the port is free; stop servers you started when the item is done.
  (QNW5V6OU BUG-01: port 3000 already in use)
- Use the Company Tools before coding: official QA data (`get_test_data`) and the internal standards (`kb_search`)
  decide formats and expected values. `TEST_DATA_NOT_FOUND` just means no data is issued for that item.
- No web search: dependency advisories come from `pnpm audit --json` / package metadata. (QNW5V6OU TASK-02)

## Pace and cost
- Official format (warm-up 5APIQYXW): 10 items in 4 waves at minutes 0, 8, 12 and 20, deadlines of 8-18 minutes:
  waves overlap, so keep every slot busy; never wait for a wave to finish before starting the next one.
- Idle waiting cost half of all tokens: while idle, call `wait_for_update` back to back and write nothing.
- Do not re-audit submitted items; validate before submitting instead.
- Whatever enters a context is paid again on every later turn. Short waits (1-60 s yields, `sleep`) and big tool
  results (images, whole logs and files, full boards) made 5FLQMNAA cost ~33M tokens for 10 items; one long wait per
  cell, compact results and script extracts keep the same work much cheaper. (5FLQMNAA)
- The orchestrator coordinates; it does not code and does not answer items, not even a PI. A BUG done in its own slot
  held a finished item ~4 minutes and doubled its context (5FLQMNAA BUG-04); a 13.5-minute PI-02 kept CR-07 from
  ever starting (IPZ0U79E).
- When the dev server does not show a change after one restart, verify on a production build and look at the source,
  not at compiled bundles. (5FLQMNAA BUG-01: ~10 minutes)
- A brief that names another item ("right only on source that also contains the <ID> fixes"): the dependent's worker
  makes the fix it needs itself from the start; never wait for the other item. (32PTEO8K CR-07 73/100, 6QYJQAVJ 0,
  SC0E8AV2 0: each time CR-07 waited for BUG-11)
- While a PI is open, finished items without a deadline wait; deadline items do not.
- Rows passing is not the end when the grading rewards more (detection by broken builds, data requirements, hidden
  tests): with time left, run the quality gate before submitting. (32PTEO8K TASK-08 84/100 at minute 12, TASK-07 35/50)
- The organizer no longer marks heavy items: read the effort profile (board effort/heavy/heavyCandidate with reasons:
  large or compressed data, stated volume, cleaning traps, aggregated answers). (32PTEO8K TASK-10/12 profile XL)
- The PI first, but every deadline item is assigned in the same turn (a PI is handed over in one call), and a free
  slot takes a deadline item before a heavy item without a deadline. (IPZ0U79E: CR-07 never started during a
  13-minute PI with s3 free; TASK-07 waited while s5 took TASK-12)
- Deadline items by least slack (minutes left minus the minutes the effort needs), not by wave: a 30-minute item
  done in 12-15 minutes can wait for a 15-minute one. (IPZ0U79E TASK-10 / TASK-07)
- A clean finished item does not need the orchestrator: the helper submits it (AUTO_SUBMITTED) and suggests the next
  item for the slot, so a busy orchestrator (a PI) no longer delays submissions or refills.
- A PI given to a freshly spawned worker took 20 minutes (6YOBNM4Z, 1.5.14: data collection queued behind other
  calls, a new agent reading from scratch, no slot for the next PI). A PI goes to a PI agent that read INCIDENT.md
  during preparation, in a PI slot of its own, with the data already collected by the helper.
- Codex counts every agent thread, idle ones too ("agent thread limit reached" with 4 sub-agents, 6QYJQAVJ): keep a
  fixed team and hand items over by follow-up instead of spawning one agent per item.
- Six installs at once take 13 minutes each where one takes 1.5 (IPZ0U79E): two at a time, hard links for Yarn, and
  the main install as the scout's first action.
