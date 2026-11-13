# Answering a PI (playbook of the fast-lane agents `team_incident_worker`, and of any worker given a PI)

A PI (production incident) is a race: the first correct team gets 100 %, later ones 90/75/60 %, a wrong field 0 for
that field. Every field and the fix are graded on their own. So **exact and complete first, then fast**. The helper
has already done the slow, mechanical part: Start Work in a slot (the fast lane s5-s7, or a free worker slot),
the incident rules, and it is collecting every log entry into `<slotMatchRoot>/.mtm-tmp/<ID>/incident/`.

## The follow-up you get
`PI <ID> in slot <sN>. incident.dir <path>. briefFile <path>. answerFile <path>. validateCommand <cmd>.
worktreeRoot <path>. slotMatchRoot <path>. piKind <investigation|fix>. Playbooks <...>. Repro <path or none>.`
Work in the slot it names (the slot is installed: tests and builds run there).

## Two kinds of PI (1.5.34)
- **`piKind: fix`** - no figures to find in the logs; the brief asks to remove a fault and judges it with
  verification scenarios, hidden tests and **a test suite of your own run on versions that each break a rule**
  (8COFCHVS PI-23/PI-24: lost 6 and 14 points on volume versions alone). Work it like an item: WORKER.md and the
  playbooks the message lists (`suite-spec` for the suite: the brief's own sizes - "a few hundred lines, a few
  thousand units" - are the volume to go past, by 10x), the MVS run as the brief says, a valid answer committed from
  the first PASS. Skip the log steps below.
- **`piKind: investigation`** - figures from the logs (and usually a fix): the steps below, without tests.

## The repro script (when the brief asks for one)
`Repro answers/<ID>/repro.mjs` = the grader reruns your script on a second data set of the same kind, and half of
every figure is for that run (8COFCHVS PI-21: the script was right on the second set, the answer - computed before
the collection was complete - was not). So the solver IS that file, from the start:
`node answers/<ID>/repro.mjs --input <dir> --output <file> --src <folder>`; it reads only `<dir>/logs.json`
(`{ "entries": [...] }`) and `<dir>/data.json`, no other path, no network, under the brief's time limit. The helper
writes exactly that input to `<incident.dir>/repro-input/`; run your script on it and answer with ITS output.

## Steps (investigation: read, list, compute, fix, answer - no tests of your own, 1.5.35)
The figures come from your script over all the data, and the fix is judged by the organizer's own hidden tests: no
test file of yours earns a point here, so you write none and run none. Speed goes into reading the brief and the
rules thoroughly.
1. **Read while the logs are collected** (they take up to a few minutes): the brief (`briefFile`: description,
   answer fields, acceptance criteria, whether a **fix in the source** is asked), `incident/kb.md` **in full** (naming
   and scope rules decide the answer: which release counts as the cause, which component name, what an "affected"
   record is, how to rank or compute), and, when a fix is asked, the code the brief and the rules point to (rg in
   `<slotMatchRoot>`). Write `.mtm-tmp/<ID>/plan.md`: **the list of tasks** - every field with its definition in your
   own words (scope, filters, dedup key, order, units), the repro script if the brief asks for one, and the fix (which
   file, which change, which rule it restores). Every task in the brief is on that list before you compute anything.
2. **Wait for the logs**: `wait_incident_data({ dir: incident.dir })` (blocks up to 280 s; call again while
   `ready` is false). Then read `incident/digest.md` and the coverage it returns:
   - `complete` false, or a query you need marked incomplete or `optional`: collect the rest yourself with
     `company_tool_call({ name, arguments, backlogId: "<ID>", slotMatchRoot })`. A search capped at N entries
     without paging is narrowed with more words (a day `2025-10-18`, then an hour `2025-10-18T22`, a release, an id)
     until each answer's `total` equals its `returned`; save every answer to a file and merge them by script. A set
     built from a first page is incomplete and scores 0 (5APIQYXW: "total": 38, "returned": 20).
3. **One Node script** - the repro file when the brief asks for one (above), else
   `<slotMatchRoot>/.mtm-tmp/<ID>/solve.mjs` (start from `incident/solve-starter.mjs`: data loaded
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
   **Checkpoint at once**: as soon as the script gives every figure, write them into `answerFile` (template keys,
   status PARTIAL), run `validateCommand`, commit the answer and the script. Not submitted yet (the fix may still
   come), but the helper submits it 2.5 minutes before the deadline if you are not done (8COFCHVS PI-22: an 8-minute
   deadline and no committed answer = 0 of 65).
4. **Check the values against the list** (by reading, not by tests): every template field filled from the script
   output with the schema's type; re-read every rule once against your values; each set's size equals the count the
   script printed and contains nothing the definition excludes. A wrong value: fix the script, run it again; never
   patch values by hand.
5. **The fix, when the brief asks for one**: read the faulty release's change and the rule it breaks, fix the **root
   cause** (not the symptom) with the smallest change inside the assigned folder, re-read the diff once against the
   rule, commit in the slot (`git -C <worktreeRoot> add -- <folder>` then `commit -m "<ID>: <fix>"`). No new test, no
   test run; never touch an existing test.
6. **One pass over the checklist** (`checklistFile`) before `answer_item`: every box met by a value from the script
   or the fix; an open box is work still to do, not a note to write.
7. **One call answers it**: `answer_item` with `backlogItemKey`, `values` (the fields exactly as printed), `record` (a
   short incident record: impact, timeline, root cause, containment, recovery, prevention; name the fix commit),
   `evidence` (`{"investigation.json": {"from": "<solve-output.json>"}}`) and **no** `integrate`. It fills the template, validates (INVALID returns the problems: fix and call
   again), commits the answer in the slot and writes DONE.json. The orchestrator's helper submits it within seconds.
   Put a real doubt in DONE.json `doubts` only when a value is truly uncertain (the orchestrator then decides).
8. Final answer: one line (`<ID> answered: <the key values>; fix <commit or none>`). Nothing else.

## After the PI
Wait for the next follow-up (in the fast lane: another PI or a short TASK).

## Never
Guess a value, read values off a log by eye, stop at the first page of a capped query, call `integrate`,
`start_work`, `prepare_incident` or `submit_work`, touch a slot other than the one named, or message the
orchestrator while working.
