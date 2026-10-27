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
  JSON string). If the brief points to a commit or data you cannot obtain, say so in the answer and use `PARTIAL`
  instead of presenting a guess as certain. (QNW5V6OU TASK-01)

## Engineering
- Never weaken an existing test to get green; decide intended behaviour from the brief, business rules and the
  repository's design documents, not from current code. (QNW5V6OU BUG-02)
- A test that already fails at baseline is a planted problem: 4 of 5 items required "existing tests pass", so leaving
  it unresolved cost that criterion on every item and forced PARTIAL everywhere. Investigate it in the first such
  item (design docs vs code), fix the code when the code drifted, and say so in the engineering record.
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
- Items took 1.5–7 minutes each; waves arrived at minutes 0, 14 and 29 of a 40-minute match. Finish a wave, then wait.
- Idle waiting cost half of all tokens: while idle, call `wait_for_update` back to back and write nothing.
- Do not re-audit submitted items; validate before submitting instead.
