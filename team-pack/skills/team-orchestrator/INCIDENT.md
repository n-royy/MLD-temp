# Answering a PI (playbook of the fast-lane agents `team_incident_worker`, and of any worker given a PI)

A PI (production incident) is a race: the first correct team gets 100 %, later ones 90/75/60 %, a wrong field 0 for
that field. Every field and the fix are graded on their own. So **exact and complete first, then fast**. The helper
has already done the slow, mechanical part: Start Work in a slot (the fast lane s5/s6, or a free worker slot),
the incident rules, and it is collecting every log entry into `<slotMatchRoot>/.mtm-tmp/<ID>/incident/`.

## The follow-up you get
`PI <ID> in slot <sN>. incident.dir <path>. briefFile <path>. answerFile <path>. validateCommand <cmd>.
worktreeRoot <path>. slotMatchRoot <path>.` Work in the slot it
names (the slot is installed: tests and builds run there).

## Steps
1. **Read while the logs are collected** (they take up to a few minutes): the brief (`briefFile`: description,
   answer fields, acceptance criteria, whether a **fix in the source** is asked), `incident/kb.md` **in full** (naming
   and scope rules decide the answer: which release counts as the cause, which component name, what an "affected"
   record is, how to rank or compute), and, when a fix is asked, the code the brief and the rules point to (rg in
   `<slotMatchRoot>`). Note the definition of every field in your own words in `.mtm-tmp/<ID>/plan.md`.
2. **Wait for the logs**: `wait_incident_data({ dir: incident.dir })` (blocks up to 280 s; call again while
   `ready` is false). Then read `incident/digest.md` and the coverage it returns:
   - `complete` false, or a query you need marked incomplete or `optional`: collect the rest yourself with
     `company_tool_call({ name, arguments, backlogId: "<ID>", slotMatchRoot })`. A search capped at N entries
     without paging is narrowed with more words (a day `2025-10-18`, then an hour `2025-10-18T22`, a release, an id)
     until each answer's `total` equals its `returned`; save every answer to a file and merge them by script. A set
     built from a first page is incomplete and scores 0 (5APIQYXW: "total": 38, "returned": 20).
3. **One Node script** `<slotMatchRoot>/.mtm-tmp/<ID>/solve.mjs` (start from `incident/solve-starter.mjs`: data loaded
   and indexed; copy it to `../solve.mjs`) over `incident/logs.json` / `entities.json` (plus anything you collected)
   computes **every** field the brief asks for, exactly by the definitions in the rules and the brief, and prints each
   value with the log rows that prove it:
   - sets complete: every record that matches the definition, found by joining each record's events in order, not
     only the records a ticket or alert names; distinct counts by the id the brief names;
   - "first/earliest" by the order the brief names (`ts`, or a sequence field such as `context.seq`), never file order;
   - ranks, scores and causes exactly as the rules define them; strings exactly as logged (case, separators,
     version format); sums over the exact set the brief defines (absolute values when it says so);
   - a value the data does not determine: say so in the record, never invent it.
   The script asserts its own coverage (e.g. "expected 755 entries, got N") and fails when it is short.
   Write its output to `solve-output.json`. Never pick values by eye.
4. **Check the values** (this is where the points are won): every template field filled from the script output with
   the schema's type; re-read every rule once against your values; each set's size equals the count the script
   printed and contains nothing the definition excludes; a second, independent way to compute the key field
   (another join, the other order, the code itself on the logged inputs) agrees. When a check fails, fix the script
   and run it again; never patch values by hand.
5. **The fix, when the brief asks for one** (YH6OAYMZ PI-02: "Then fix the fault in the application source"):
   - reproduce the fault with a test first: one new test file with the logged cases (the wrong inputs and the
     expected right result from step 3), failing on the issued code;
   - fix the **root cause** the rules and the logs point to (the faulty release's change), not the symptom; keep the
     change minimal and inside the assigned folder;
   - run the new test, the existing tests of that module and any test the brief names; all must pass. Never weaken
     or delete an existing test;
   - commit in the slot (`git -C <worktreeRoot> add -- <folder>` then `commit -m "<ID>: <fix>"`).
   Speed matters, but a fix that is not verified loses its points: keep it to what the brief asks.
6. **One pass over the checklist** (`checklistFile`) before `answer_item`: every box met by a value from the script
   or the fix and its test; an open box is work still to do, not a note to write.
7. **One call answers it**: `answer_item` with `backlogItemKey`, `values` (the fields exactly as printed), `record` (a
   short incident record: impact, timeline, root cause, containment, recovery, prevention; name the fix commit and
   its test), `evidence` (`{"investigation.json": {"from": "<solve-output.json>"}}`, plus the test output when a fix
   was made) and **no** `integrate`. It fills the template, validates (INVALID returns the problems: fix and call
   again), commits the answer in the slot and writes DONE.json. The orchestrator's helper submits it within seconds.
   Put a real doubt in DONE.json `doubts` only when a value is truly uncertain (the orchestrator then decides).
8. Final answer: one line (`<ID> answered: <the key values>; fix <commit or none>`). Nothing else.

## After the PI
Wait for the next follow-up (in the fast lane: another PI or a short TASK).

## Never
Guess a value, read values off a log by eye, stop at the first page of a capped query, call `integrate`,
`start_work`, `prepare_incident` or `submit_work`, touch a slot other than the one named, or message the
orchestrator while working.
