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
- The orchestrator integrates; it does not code. A BUG done in its own slot held a finished item ~4 minutes and
  doubled its context. (5FLQMNAA BUG-04)
- When the dev server does not show a change after one restart, verify on a production build and look at the source,
  not at compiled bundles. (5FLQMNAA BUG-01: ~10 minutes)
- A brief that names another item ("right only on source that also contains the <ID> fixes") makes that item a
  deadline item: start it no later than the item that needs it, and the dependent includes the change itself when it
  will not land in time. (32PTEO8K CR-07: 73/100; BUG-11 started after CR-07 was submitted)
- While a PI is open, finished items without a deadline wait; deadline items and their prerequisites do not.
- Rows passing is not the end when the grading rewards more (detection by broken builds, data requirements, hidden
  tests): with time left, run the quality gate before submitting. (32PTEO8K TASK-08 84/100 at minute 12, TASK-07 35/50)
- The organizer no longer marks heavy items: read the effort profile (board effort/heavy/heavyCandidate with reasons:
  large or compressed data, stated volume, cleaning traps, aggregated answers). (32PTEO8K TASK-10/12 profile XL)
- Agent threads are capped: the pack sets max_threads 10 for 4 workers, the heavy worker and the idle scout.
  (6QYJQAVJ: spawn refused with 4 sub-agents; the orchestrator did 6 items itself)
- Assign deadline items in the first cell of a wave, then work the PI yourself at once; never give a PI to a worker,
  never interrupt a worker for another item. (6QYJQAVJ CR-07 0/100; 6YOBNM4Z PI 20 min, BUG-09 15/80 after WRAP_UP)
- Numbers read from an image are read twice from crops and checked against the team's answers.
  (6QYJQAVJ TASK-11: one transposed digit, 64/80)
- A suite scored by broken builds must also fail on the issued source's real defects, with non-ASCII text variants.
  (6QYJQAVJ TASK-08: 80/100 despite 36/37 own mutants caught)
- The heavy worker (high reasoning) is for XL items only; deadline and L items run faster on feature workers.
  (6YOBNM4Z CR-07 56/100 on a heavy worker)
- Evidence rows are proved, not abandoned: change the approach, not the target, while time remains. (6YOBNM4Z BUG-09)
- The machine is the bottleneck before the agents are: stale servers of an earlier match, six installs, production
  builds and a full baseline at once made every git call and test run crawl. Free the machine, queue heavy jobs,
  run the narrowest proof. (UA9QF7DU: one submission in 25 minutes)
- A deadline item that needs another item's fix takes it by cherry-pick as soon as that fix is committed, not when
  it is submitted. (32PTEO8K / 6QYJQAVJ / UA9QF7DU CR-07)
- A PI is values first: no source change, build or test suite before the fields are computed and submitted, unless
  its grading scores the change. (UA9QF7DU PI-02 not submitted after 20 minutes)
- One item per cell: start_work and spawn together, deadline items first; a PI still being collected never holds
  back the news. (SC0E8AV2: CR-07 got its worker 10 minutes after it appeared)
- A deadline item that needs another item's fix makes the part it needs itself from the start, and commits after
  every passing row. (SC0E8AV2 CR-07: no commit at the deadline, 0/100)
- Never burst Company Tools: a rate-limited log set gives wrong counts. (SC0E8AV2 PI-02: first, 76/120)
- Mutate every rule id once before mutating any rule twice; compute a data manifest by running the parser.
  (TASK-08 80-84 three matches in a row with half the rules never mutated; TASK-07 35/50 with a predicted manifest)
- Slot installs start right after the clone, one at a time; they are the long pole of preparation. (SC0E8AV2)
