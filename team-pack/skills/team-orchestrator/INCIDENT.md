# Answering a PI (playbook of the PI agents, `team_incident_worker`)

A PI (production incident) is a race: the first correct team gets 100 %, later ones 90/75/60 %, a FAILED answer 0.
So **exact first, then fast**. The helper has already done the slow, mechanical part before you get the PI: Start
Work in a PI slot (s7 or s8), every log page and the incident rules (plus every KB article they reference) collected
into `<slotMatchRoot>/.mtm-tmp/<ID>/incident/`. You only reason and compute.

## The follow-up you get
`PI <ID>. incident.dir <path>. briefFile <path>. answerFile <path>. validateCommand <cmd>. slotMatchRoot <path>.
complete <true|false>. <problems if any>.`

## Steps
1. Read `incident/digest.md` (coverage, services, releases, flags, entities, KB list), `incident/kb.md` **in full**
   (naming and scope rules decide the answer: which release counts as the cause, which component name, what an
   "affected" record is) and the brief (`briefFile`: description, answer fields, acceptance criteria).
2. `complete` false or `problems` not empty: page what is still missing yourself with
   `company_tool_call({ name, arguments, backlogId: "<ID>", slotMatchRoot })` until `returned` summed equals `total`
   (or narrow the query until it does), saved to a file. A set built from a first page is incomplete and scores 0
   (5APIQYXW: "total": 38, "returned": 20).
3. One Node script `<slotMatchRoot>/.mtm-tmp/<ID>/solve.mjs` (start from `incident/solve-starter.mjs`: data loaded and
   indexed; copy it to `../solve.mjs`) over `incident/logs.json` / `entities.json` computes **every** field the
   brief asks for, using the definitions in the KB articles and the brief, and prints each value with the log rows
   that prove it:
   - sets complete: every record that matches the definition, found by joining each record's events in time order,
     not only the records a ticket or alert names;
   - "first/earliest" by timestamp, never by file order;
   - causes and components as the KB defines them; strings exactly as logged (case, separators, version format);
   - a value the brief asks for but the data does not determine: say so in the record, never invent it.
   Never pick values by eye. Write the script output to `solve-output.json`.
4. **Check before answering** (this is where accuracy is won; it takes a minute):
   - every field of the template is filled from the script output, with the exact type the schema wants;
   - re-read the KB rules once against your values (scope of "affected", which release, flag names);
   - each set: its size matches the count the script printed; no record is listed that the definition excludes.
   If a check fails, fix the script and run it again; do not patch values by hand.
5. One call answers it: `answer_item` with `backlogItemKey`, `values` (the fields exactly as printed), `record` (a
   short incident record: impact, timeline, root cause, containment, recovery, prevention), `evidence`
   (`{"investigation.json": {"from": "<solve-output.json>"}}`) and **no** `integrate`. It fills the template,
   validates (INVALID returns the problems: fix and call again), commits in the PI slot and writes DONE.json. The
   orchestrator's helper submits it within seconds.
6. Final answer: one line (`<ID> answered: <the key values>`). Nothing else.

## After the PI
If the follow-up said "Pause <item>, PI first", go back to that item in your item slot (s5 or s6) and continue it
from where you stopped (WORKER.md). Otherwise wait for the next follow-up.

## Never
Guess a value, read values off a log by eye, stop at the first page of a paged query, call `integrate`,
`start_work`, `prepare_incident` or `submit_work`, touch another slot, or message the orchestrator while working.
