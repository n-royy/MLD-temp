---
name: team-orchestrator
description: Run the active MTM match after START_GAME_V4 - watch the backlog, choose work, Start Work into worker slots, delegate each item to a team_feature_worker subagent, integrate, push, submit once with evidence, and keep going until the match ends.
---

# Team orchestrator (START_GAME_V4 → match end)

You are the project manager of team MLD. Score = sum of graded items (max 1000) − 50 per human intervention.
Ties: earlier last completion and fewer Codex credits win, so be correct first, then fast and frugal.

**This skill explicitly asks for sub-agents.** You coordinate; `team_feature_worker` subagents implement, test and
write answers in their own slots, in parallel. You do not read product code or run product tests yourself (except
the fallback in "Doing an item yourself"). Every call you make re-sends your whole context, so your context must stay
small: never paste briefs, diffs or logs into it.

## Start of the game
0. Read `.agents/skills/team-orchestrator/LESSONS.md` once (rules learned from earlier matches; they override habits).
   Do not read WORKER.md or product notes now; workers read them.
1. `configure_session` with `descriptors: [<PREPARE_GAME descriptor from earlier in this conversation>, <START_GAME descriptor>]`
   (the second one carries the team API key; the first one carries the portal login).
2. `report_progress` `GAME_START_STATUS` stage `BACKLOG_SYNC` `IN_PROGRESS` → `refresh_match` →
   `GAME_START_STATUS` `BACKLOG_SYNC` `COMPLETED`. `refresh_match` already logs `DISCOVERED` for each new item.
   The board lists `slots` (prepared during preparation: s1..s3 for workers, s4 for you). If it has none, call
   `prepare_slots` with the values from your preparation summary, or work single-agent ("Doing an item yourself").
2b. **Background jobs from preparation** (slot installs `install-sN`, the `baseline` test run in
   `<matchRoot>/.mtm-tmp/jobs`) may still be running: do not wait for them. Spawn workers at once; each worker waits
   for its own slot install (`slotInstallState` in its brief). `wait_for_update` returns `reason: "JOBS_DONE"` with
   `jobs[]` when they end:
   - `install-sN` or `baseline` LOST (killed with the preparation turn), or `install-sN` FAILED: `start_jobs` with
     `restartFailed: true` for that job (same command as in its
     `<name>.cmd.txt`); the worker in that slot keeps waiting.
   - `baseline` FAILED and no baseline patch was applied: name one baseline owner ("Baseline failures" below) and
     `send_message` that worker once: `Baseline owner: <test names> fail at baseline (log <path>); WORKER.md
     "Baseline failures"`. Workers started later get the known-failure note in their spawn message.
3. `company_tools_list` once. These are the customer's internal systems (tickets, logs, docs, monitoring...).
   Their information is authoritative and using them is part of the evaluation. Workers query them themselves
   through your helper (relay); you call them only for an item's QA data at start (loop step 3) and for items you do
   yourself. Pass `backlogId` on each call.

## Sub-agents (Codex collaboration tools)
- Call `spawn_agent`, `followup_task`, `send_message`, `wait_agent`, `interrupt_agent`, `list_agents` as direct tool
  calls (they are not in the `exec` `tools.*` namespace). Read their tool definitions once for the field names.
- Spawn with the role/agent type `team_feature_worker` and `fork_turns: "none"` (a fresh, small context: never fork
  your history). Do not set model or reasoning effort. A heavy item gets agent type `team_heavy_worker`.
- **Agents are a pool, and a finished agent still holds its place.** Codex caps the agent threads (6QYJQAVJ:
  `collab spawn failed: agent thread limit reached` with 4 sub-agents: the idle preparation scout plus 3 workers; the
  heavy worker for TASK-10 was never created and you did 6 items yourself, one of them wrong). So:
  - **Reuse before spawning.** An agent whose item is done (its DONE.json integrated, or it answered) takes the next
    item with `followup_task` (new briefFile, slot): the preparation scout is the first such agent (its instructions
    allow it to work as a worker after preparation). `list_agents` shows who is idle.
  - Spawn only when no agent is idle. A spawn refused for the thread limit: note the limit (`poolSize` = agents you
    have), never retry it in this match, and from then on only reuse.
  - Slots are not tied to agent types: any free slot (s1-s3, s5, s6) takes any item; `heavy` only chooses
    `team_heavy_worker` when an agent is spawned (a reused agent reads WORKER.md "Heavy items" for a heavy brief).
- **One worker per item, all worker slots (s1-s3, s6) busy** (see "Wave planning"). A worker may get a second item in
  the same slot (`integrate_item` with `next`, then `followup_task`) only for a queued no-deadline item when that
  slot is the first to free; it keeps its running server and knowledge of the code. Otherwise spawn a fresh worker.
- Spawn message (keep it this short; the worker reads everything else from files):
  ```
  Item <ID> (<TYPE>) in slot <sN> (index <n>). briefFile: <path>. worktreeRoot: <path>. slotMatchRoot: <path>.
  Assigned branch: <branch>. Playbook: <teamWorkspace>/.agents/skills/team-orchestrator/WORKER.md and LESSONS.md.
  Notes: <baseline repaired in <sha> | baseline owner | known failure>, <deadline>, <blocker note if any>. Finish by writing doneFile.
  ```
- Follow-up message for a queued item in the same slot (after `integrate_item` returned `next`):
  `Next item <ID> (<TYPE>): briefFile <path>. Your slot was reset to the branch head, which includes <previous ID>. <deadline>.`
- Messages to a working worker: only the blocker note ("Wave planning" step 4), the baseline-owner note (2b) and
  the safety net. `followup_task`
  only to fix a rejected gate, to hand over the `next` item, or to replace a placeholder value.
- Never put credentials, the API key or descriptor objects in a message.

## The official format (warm-up 5APIQYXW)
10 items worth 1000 points in 40 minutes, revealed in 4 waves (minutes 0, 8, 12 and 20). Several items close at a
deadline counted from their reveal (8, 15, 15, 18 minutes; a closed item accepts nothing), and the PI is a race.
In that warm-up two items were never submitted (CR-02 not started, TASK-04 still running at the end: 190 points).
So capacity and order matter as much as quality:
- Start a deadline item as soon as it appears: it takes the next free slot before any queued non-deadline item,
  and it is never queued behind another item.
- A PI is always yours, never a worker's: the helper prepares it by code and wakes you with `NEW_PI` ("Incident
  fast path"). A value TASK (the answer is a value, no source change) while all 4 worker slots are busy: do it
  yourself in your slot s4 ("Doing an item yourself"). A BUG or CR never goes to s4 (the helper refuses it with
  `OWN_SLOT_RESERVED`): it takes the first worker slot that frees.
- No item may sit unstarted while a slot is free. From minute 25, start every remaining item that can still be
  finished; skip only what cannot.
- Keep all 4 worker slots busy from the first wave; dependencies never justify an idle slot ("Wave planning").
  Slot s4 never gets a worker: it is only for an item you do yourself.

## Wave planning: parallel by default, deadline items never wait
Rule of thumb from three real runs: one item per worker, all free slots busy. TDAY8RSF (1.5.1) queued BUG-02
(deadline 18 min) behind BUG-01 in one slot "because the sidebar bug blocks its UI checks" and left two slots
idle; BUG-01 alone takes 10-19 minutes, so BUG-02 would close before it started. 7GAZA14X showed the opposite
risk (a dependent item verified while the blocker was unfixed). Both are solved by running items in parallel and
syncing the dependent slot when the blocker lands, not by queueing.

### Item profile (any kind of item, including kinds not seen before)
The helper reads every brief and puts a profile on each board entry, so you plan without opening briefs:
`type`, `points`, `minutesLeft` / `effectiveMinutesLeft` (urgency, own deadline or as a prerequisite),
`dependsOn` / `prerequisiteOf`, `effort` (`S`/`M`/`L`/`XL` from the brief: data to process and its volume,
data-cleaning traps, aggregated answers, points above the same type, a long multi-requirement brief; for code work
the parts to build (server, screen...), the files, routes and test ids it names, several causes, many acceptance
criteria or scenarios, hidden tests beyond the scenarios),
`heavy` (XL) or `heavyCandidate` (L) with `effortReasons`, and `gradingKind` (what is scored beyond the rows:
`SUITE_DETECTION`, `DATA_REQUIREMENTS`, `OFFICIAL_DATA`). Every brief also carries `grading`, the organizer's own
scoring text, so a worker plans from it for an item of a kind no playbook names. The organizer does not mark heavy
items: the profile is the signal. Decide with it in this order, for every item:
1. **Urgency**: deadline items and their prerequisites, nearest first, then the PI (by you). Assigning a deadline
   item takes seconds (start_work + followup_task/spawn); do it **before** you start working a PI, never after
   (6QYJQAVJ: two PIs took you 12 minutes while CR-07, due in 20, waited and was lost).
2. **Effort**: `heavy` gets a `team_heavy_worker` (spawned, or an idle agent reused) in any free slot, s5 first;
   `heavyCandidate` likewise when an agent is free, otherwise it is an ordinary item. Effort never keeps a slot
   empty: s5 takes any item when no heavy item waits. Write one line in your plan for every heavy or candidate decision (`<ID> heavy: <reasons>`).
3. **Value**: the rest by points per expected effort (S before M at equal points).
4. **Grading**: an item with `gradingKind` keeps its slot for its quality gate (the "Quality gate" paragraph of the SLOT_DONE steps; WORKER.md "Quality gate"):
   never treat early rows passing as the end.

When a wave appears (game start, or `newItems` on the board):
1. **Read once** `<matchRoot>/.mtm-tmp/repo-map.md` (first wave only) and the compact board entries. Do not open
   briefs or code.
2. **Order:** **PI first, immediately, by you** ("Incident fast path"; race 100/90/75/60 %, FAILED = 0); then deadline items, nearest deadline first (deadline
   minutes count from reveal; skip only an item that cannot be finished in time); then the highest points per
   expected effort (CR/BUG usually before TASK).
   **Prerequisites count as deadline items.** The helper reads every brief: an item whose brief names another open
   item shows `dependsOn: [<key>]`, and the named item shows `prerequisiteOf: [<key>]` with `effectiveMinutesLeft`
   (the nearest deadline among the items that need it). Order by `minutesLeft`, or `effectiveMinutesLeft` when it is
   smaller: a prerequisite starts no later than the deadline item that needs it, ideally first (32PTEO8K: BUG-11 had
   no deadline but CR-07's grade needed its fixes; it started 18 minutes late, after CR-07 was submitted, and CR-07
   lost 27 points). A prerequisite also gets `DEADLINE_SOON` (kind `PREREQUISITE_DEADLINE`) and a `stopBy`. **Heavy items** (board `heavy: true`) start as soon as an agent is
   free, s5 first (see "Heavy items" below), but never before a deadline item that waits.
3. **Assign in that order, one item per free slot (s1, s2, s3, s6, and s5 when no heavy item waits), until the
   slots or the agents run out.** Never leave a slot idle while an
   item is open. A deadline item or PI is never queued behind another item: a PI is yours ("Incident fast path");
   a value TASK with no free worker slot you do in s4 ("Doing an item yourself"); a BUG/CR takes the next worker
   slot that frees (`integrate_item` with `next` on the slot whose item finishes first), never s4.
   **Heavy items** (`heavy: true`: the helper's effort profile from the brief says XL: large data to process,
   traps, aggregated answers; `heavyCandidate: true` (L) when an agent is free) go to slot s5 first (any free slot
   otherwise) with an agent of type **`team_heavy_worker`** when one can be spawned (higher reasoning effort,
   quality-first instructions), or an idle agent reused with the same note. As soon as a heavy item appears and the
   deadline items of its wave are assigned: `start_work` and spawn or reuse. Spawn
   note: `Heavy item: WORKER.md "Heavy items" (plan.md and progress.md, rows one by one with a
   valid answer committed after each PASS, self-review, sync with the branch before the final checks; work until
   done or until stopBy)`. It works the item through to the end; integrate it on
   `SLOT_DONE` like any item. Its final call is `DEADLINE_SOON` with `heavy: true` about 1.5 minutes before its
   deadline or the match end ("Safety net"): integrate its last commit then.
   - A `heavyCandidate` takes s5 only when s5 is free and no `heavy` item waits; otherwise it is an ordinary item.
     Late signal: a worker's DONE.json or a DEADLINE_SOON shows an ordinary item was much larger than its profile
     (rows still open at stopBy): note it in LESSONS candidates after the match, nothing to do in the match.
   - One heavy item at a time in s5. A second heavy item while s5 is busy waits for s5 (`integrate_item` with `next`
     when the first one is submitted); if a worker slot (s1-s3, s6) is free and no other open item waits for one, it may
     take that slot instead (same spawn note).
   - No agent can be spawned and none is idle: the heavy item waits for the first agent that finishes. Only when
     its deadline is near and every agent is busy may you work it in s4 (short steps, `wait_for_update` with
     `noWait: true` after each row, events first).
4. **Dependencies are not a reason to wait:**
   - Verification dependency (e.g. a layout bug hides content another item must screenshot): start both. Tell the
     dependent worker in its spawn note `<blocker ID> fixes <what>; you will be told when it is on the branch`.
     When the blocker is submitted, `send_message` that worker once: `<blocker ID> is on <branch>: run
     git -C <worktreeRoot> rebase <branch> before your final evidence`. (This is one of the two allowed mid-work
     messages; the other is the overlap notice below.)
   - Overlap notice: after each successful integration, for every other running worker slot run
     `git -C <slot path> diff --name-only <branch>...HEAD` (plus `status --porcelain`) and compare it with the
     integrated item's files (`git -C <checkoutRoot> diff --name-only <previous tip> <new tip>`). On an overlap, `send_message` that worker once: `<ID> on <branch> changed <files>; rebase at your
     preflight`. At most one overlap notice per running item; no notice when nothing overlaps.
   - Code dependency (two items rewrite the same function or file): still run both; the second integration may
     need a rebase (`INTEGRATION_CONFLICT` flow). Queue an item behind another (`integrate_item` with `next`) only
     when it has NO deadline and no slot is free anyway.
5. Later waves: new items take free slots in the same order; a queued (no-deadline) item is chained with `next`
   only when that is the earliest free slot.
Keep the plan as one short line in your own reply, e.g. `s1 BUG-02 (dl 18) | s2 BUG-01 | s3 free`.

## Baseline repair first (game minute 0)
If the preparation summary says a baseline patch is ready (`<matchRoot>/.mtm-tmp/baseline/baseline.patch`, tested
by the scout), then right after the first `start_work` of the game call `apply_baseline` with that item's ID and the
patch summary, BEFORE spawning any worker. Every slot then starts from a green suite and every brief carries
`baselineRepair`; no worker owns, waits for or rebases onto a baseline fix. The first item's engineering record
mentions the repair; the other items mention that existing tests pass on the branch that includes it.
Without a patch, use the baseline-owner rule below.

## The loop (never end your turn while the match is IN_PROGRESS)
Repeat until a `MATCH_ENDED`/`MATCH_PAUSED` frame arrives or `refresh_match` shows FINISHED/CANCELLED/TIME OVER:
1. Plan the wave ("Wave planning"): one item per free slot, in priority order.
2. For each such item: `start_work` with `backlogItemKey` and `slot` (mandatory before any edit; a second call is a
   harmless replay). It resets the slot to the current branch head, creates the answer from the template in the slot,
   writes the full brief, organizer files, submit schema and a validator to `<slotMatchRoot>/.mtm-tmp/<ID>/`, and
   returns only a short summary (`briefFile`, `doneFile`, `worktreeRoot`, `slotMatchRoot`). Do not call
   `get_backlog_item`. The helper logs IN_PROGRESS and `BACKLOG_TESTS NOT_RUN`.
3. Company Tools for the item: workers call them themselves through your helper
   (`slotMatchRoot` relay), so fetch only what helps the worker start at once - usually the item's official QA data -
   with `company_tool_call`, `backlogId` and `saveToSlot: true`; the worker queries standards, logs and tickets
   itself. You get a 300-character head. Pick tools by name/description
   (tickets/logs/monitoring for PI/BUG, `get_test_data` / `kb_search` style tools for formats and expected values).
4. `spawn_agent` (team_feature_worker, `fork_turns: "none"`) with the short spawn message, one per item. Do steps 2-4
   for all new items in as few calls as possible (one `exec` cell for the helper calls, then the spawns).
5. Wait with `wait_for_update` (blocks up to 4 minutes; returns early on a new item, a status change, pause/end, or
   `reason: "SLOT_DONE"` with `slotDone[]` when a worker wrote its DONE.json, or `reason: "DEADLINE_SOON"` when a busy
   item is 3 minutes from its deadline or the match end: go to "Safety net"). Call it again and again **without
   writing any message in between** - no status lines, no "still waiting", nothing (7GAZA14X: a line every minute
   while workers ran). `wait_for_update` always blocks the full 240 s and returns within seconds of any change. A worker's FINAL_ANSWER message needs no reply, and neither does any other
   worker message. Never `send_message` a working worker to ask for status: every ping costs both of you a turn and
   interrupts its work (BCYRV9M9: 20+ pings, the items got slower, not faster).
   When tools run inside an `exec` cell, use exactly this cell so it is not handed back after 30 s:
   ```js
   // @exec: {"yield_time_ms": 270000}
   text(await tools.mcp__mtm_helper__wait_for_update({}));
   ```
   If a cell still answers "Script running", call `wait` on it with `yield_time_ms: 270000`, never a shorter value:
   `wait` returns as soon as the cell ends, so a long yield costs no time, while every short one (1000, 10000,
   60000) is a full model turn over your whole context (5FLQMNAA: 168 orchestrator turns, ~41 % of all tokens,
   mostly re-checks). Never use the `sleep` tool and never `wait_agent` to wait for workers.
6. On `SLOT_DONE`: `integrate_item` with `backlogItemKey`, and `next` = the item queued for that slot, if any
   (test counts come from the answer's template rows; pass `acknowledgeTestChanges`
   only when DONE.json gives that reason and the brief allows the test change). It checks the slot is committed and
   stays inside the assigned folder, runs `git pull --rebase`, cherry-picks the slot commits, pushes (never force),
   then runs `submit_work` with every gate, logs `SUBMITTED` with the receipt and returns the refreshed `board`.
   - A DONE.json (or answer note) that leaves rows FAIL / NOT_RUN because of a defect outside the change ("blocked
     by", "separate defect", "fix that separately") while more than ~4 minutes remain: if no other item owns that
     defect, `followup_task` the worker once: "No item owns <defect>: it is part of your item. Make the smallest fix
     that lets your verification run (own commit, existing tests again, engineering record), then rerun the rows."
     If another item owns it, the usual blocker note applies ("Wave planning" step 4).
   - Before integrating a TASK whose answer is a value, check only that value field in `answerFile` (one small read):
     if it is empty, `0` or described as a placeholder, `followup_task` the worker: "compute the best answer on the issued checkout, keep PARTIAL, never a
     placeholder", and wait for the next `SLOT_DONE`.
   - `INTEGRATION_CONFLICT`, `SLOT_UNCOMMITTED`, `OUTSIDE_FOLDER`, `ANSWER_SCHEMA_INVALID`, `EVIDENCE_*`,
     `SCRATCH_COMMITTED`: `followup_task` to that worker with the error code and message (one or two lines); wait for
     the next `SLOT_DONE`; integrate again (already integrated commits are not picked twice).
   - `EXISTING_TESTS_MODIFIED`: see "Existing tests" in WORKER.md; follow up with the worker, never weaken a test.
   - `SUBMIT_OUTCOME_UNCERTAIN`: call `integrate_item` again unchanged (same idempotency key).
   - `REVISION_NOT_PUSHED`, `GIT_PULL_FAILED`, `GIT_PUSH_FAILED`, `MAIN_DIRTY`: yours, not the worker's - check
     `git -C <checkoutRoot> status`, fix (never force), call `integrate_item` again.
   - `ALREADY_SUBMITTED`: `release_slot` and move on. An ACCEPTED receipt is not a pass.
   - DONE.json status `BLOCKED` with no usable work: `report_progress` `BACKLOG_STATUS` `BLOCKED`, `release_slot`.
   When the result has `next`, call `company_tool_call` (`saveToSlot`) for that item if needed, then `followup_task`
   the same worker with the follow-up message; on `nextError` start that item in any free slot instead.
   Submitted answers are final: do not re-audit them afterwards.
   **Quality gate:** a `slotDone` entry with `qualityGate.status: "MISSING"` (the brief named a gate: suite scored
   by broken builds, data requirements, official data / hidden tests) and `qualityGate.minutesLeft` above 8: do not
   integrate yet; `followup_task` once: `<ID>: run the quality gate for <kind> (WORKER.md "Quality gate") before
   submitting; stop at stopBy minus 5 minutes`. With 8 minutes or less, or after that one follow-up, integrate
   (32PTEO8K: TASK-08 and TASK-07 were submitted early with defects left; 31 points).
   A board whose `slots` show a worker slot `DONE` means a DONE.json waits: integrate it before anything else of
   yours (5FLQMNAA: a finished BUG-01 waited ~4 minutes behind the orchestrator's own item). A slot in state
   `DONE_HELD_FOR_PI` waits for the open PI ("Incident fast path"): leave it until the PI is submitted.
7. Refill the freed slot from the returned `board` (no `refresh_match` needed). When nothing is workable and no
   worker is busy, keep calling `wait_for_update`. An empty backlog is a waiting state, never the end of the match.

Every call costs a model turn over your whole context: use the fewest calls that satisfy the loop above.

## Baseline failures (only when no baseline patch was prepared)
The preparation summary names tests that fail before any change. A failing baseline test is a planted problem, and
most briefs make "existing tests pass" an acceptance criterion. Name one baseline owner: among the items whose
criteria require existing tests to pass, the one with the **nearest deadline** (a no-deadline item only when no
deadline item needs it), because the owner's fix must land before every item that depends on it is submitted. When
the scout's `<matchRoot>/.mtm-tmp/baseline/README.md` names a cause, put its path in the owner's note. Its spawn message says `Baseline owner: fix <test> (WORKER.md "Baseline
failures")`; every other worker started before the owner is integrated gets `Known baseline failure <test> is fixed
by <owner ID>; do not touch it`. Integrate the owner first when several workers finish together. Items started after
the owner is integrated already contain the fix.

## Deadline item without a slot (on `DEADLINE_AT_RISK`)
The helper reports each unstarted deadline item (own deadline or as a prerequisite) once, when 15 minutes or less
remain, with `freeSlots` (any slot but s4) and `preemptable` (slots whose items have no deadline). Act at once:
1. `freeSlots` not empty: `start_work` there and give it to an idle agent (`followup_task`) or spawn one.
2. Otherwise preempt: pick the `preemptable` slot whose item is furthest along (rows done, in its quality gate) and
   `send_message` its worker: `WRAP_UP: commit what passes as a valid PARTIAL answer now, write DONE.json now, then
   stop (no quality gate)`. On its SLOT_DONE, `integrate_item` with `next: <deadline item>` and `followup_task` the
   same agent with the deadline item. The preempted item is submitted as it stands; never leave it uncommitted.
3. `NO_SLOT` (every slot holds a deadline item): leave it queued; it starts on the first SLOT_DONE.
A no-deadline item's quality gate always yields to a deadline item that waits.

## Safety net (on `DEADLINE_SOON`)
`wait_for_update` returns `reason: "DEADLINE_SOON"` with `deadlineSoon[]` (`backlogItemKey`, `slot`, `kind`
DEADLINE or MATCH_END, `minutesLeft`) once per busy item, 3 minutes before it closes (heavy items: about 1.5 minutes, with `heavy: true`). For each entry:
1. `send_message` that worker: "<ID>: <minutesLeft> min left. Commit what you have now, fill the answer honestly
   (PARTIAL if a criterion is not met), validate, write doneFile."
2. `wait_for_update` with `timeoutMs: 60000` (honoured only right after DEADLINE_SOON). On `SLOT_DONE`, integrate.
3. Still no DONE.json: `integrate_item` with `allowUncommitted: true` and the honest test counts - an unsubmitted
   item scores 0 anyway. If the answer is not valid yet, the gate says so; then `release_slot` and move on.
For your own item in s4, the same steps apply to yourself: commit, answer, doneFile, `integrate_item`.
An entry with `heavy: true` (`action: INTEGRATE_LAST_COMMIT_NOW`, about 1.5 minutes left) skips steps 1-2: call
`integrate_item` with `allowUncommitted: true` at once. The heavy worker commits a valid PARTIAL answer after every
passing row, so its last commit submits those rows. A rejected gate means no valid answer was committed:
`release_slot` and move on.

## Incident fast path (every PI: you, at once, never a worker)
A PI is a race: points depend on submission order. Waiting behind other work, spawning a worker and paging logs one
call at a time cost minutes, so the helper does the mechanical part the moment the PI appears: Start Work in a free slot (s4 first) and every log page
plus the incident rules into `<slotMatchRoot>/.mtm-tmp/<ID>/incident/`. `wait_for_update` returns `reason: "NEW_PI"`
with `incident` before any other reason. From then on the PI comes first: integrations and spawns of items
**without a deadline** wait until it is submitted. Only these may go before it: a `DEADLINE_SOON` safety net and a
`SLOT_DONE` of a deadline item or of a prerequisite of one (board `minutesLeft` or `effectiveMinutesLeft`). The helper
enforces it: while a PI is open, `wait_for_update` reports `SLOT_DONE` only for those; any other finished slot shows
`DONE_HELD_FOR_PI` (listed in `board.heldForPi`) and is reported right after the PI is submitted (at most 8 minutes
after the PI appeared).
1. No worker, no WORKER.md. Read `incident.files.digest` (coverage, services, releases, flags, entities, KB list),
   `incident.files.kb` in full (naming and scope rules decide the answer) and the brief (`incident.briefFile`,
   `item.description`). `incident.complete` false, `problems` not empty, or a service the brief names
   has no rows in the digest: `prepare_incident` with `refresh: true` once (it queries the services the brief names),
   then fetch what is still missing yourself with single `company_tool_call`s, one per tool call. Never call Company
   Tools from a loop or a script in an exec cell (the match README: "Call them one at a time, never from a script or
   loop").
2. One Node script `<slotMatchRoot>/.mtm-tmp/<ID>/solve.mjs` over `incident/logs.json` / `entities.json` computes every
   field the brief asks for, using the definitions in the KB articles and the brief, and prints each value with the
   log rows that prove it: sets complete (every record that matches the definition, found by joining each record's
   events in time order, not only the reported ones), "first/earliest" by timestamp, causes as the KB defines them,
   strings exactly as logged. Never pick values by eye.
   Start from `incident/solve-starter.mjs` (data loaded and indexed; copy it to `../solve.mjs`).
3. One call submits it: `answer_item` with `backlogItemKey`, `values` (the fields exactly as printed), `record` (a
   short incident record: impact, timeline, root cause, containment, recovery, prevention), `evidence`
   (`{"investigation.json": {"from": "<the script output file>"}}`) and `integrate: true`. It fills the template,
   validates (INVALID returns the problems; fix and call again), commits, writes DONE.json, integrates and submits.
   Then handle what waited.
`incident.slot` null (every slot was busy, the PI is not started yet): integrate the first SLOT_DONE, then
`prepare_incident` (no slot) starts the PI in the freed slot and collects again within seconds. A helper restarted
after the PI appeared does not prepare it by itself: call `prepare_incident` for any open PI on the board that is
not in `board.incidents`.

## Doing an item yourself (value TASK while every worker slot is busy)
Only the PI and short value questions answered from source or one small computation (effort S or M, no image);
never a BUG or CR, which change source and need a server, tests and evidence for many minutes while nobody
integrates, and never an answer read from an image or drawing (brief `needsVision`: a digit misread in a 2-minute
rush cost 16 points in 6QYJQAVJ TASK-11). `start_work` refuses both in s4 with `OWN_SLOT_RESERVED`; a heavy or
multi-step item waits for an agent rather than for you, unless the pool is exhausted and its deadline is near. Keep it short: one script that computes the value, then `answer_item` with
`integrate: true`. Between steps call `wait_for_update` with `noWait: true` and integrate any `SLOT_DONE` first.
Work in **your own slot s4**, never in the main checkout (`integrate_item` needs it clean for the workers):
`start_work` with `slot: "s4"` → read its `briefFile` and `.agents/skills/team-orchestrator/WORKER.md` (item kinds 2
and 3; keep big Company Tool answers in files and extract facts with a script, so they stay out of your context) →
work in `<s4 slotMatchRoot>` → answer (a value answer: `answer_item` with `integrate: true` does the rest in one
call; otherwise `apply_patch` or Node, never PowerShell `ConvertTo-Json`) → run its
`validateCommand` until valid → `git -C <s4 worktreeRoot> add -- <folder>` and commit → write `doneFile` →
`integrate_item` (it pushes and submits with every gate). Workers that finish meanwhile are integrated right after.
Only when no slots exist at all (preparation could not create them): same steps in the main checkout with
`start_work` without `slot`, then `git -C <checkoutRoot> pull --rebase origin <branch>`, `git push origin HEAD:<branch>` (never force) and
`submit_work` with the real `tests` counts.

## Progress log rules
Use `report_progress` only for: `BLOCKER_OPENED`/`BLOCKER_RESOLVED` (stable `blockerId`), `BACKLOG_STATUS`
`BLOCKED`/`FAILED` (with `revision: null, receiptId: null`), and `ORCHESTRATOR_ENDED`.
The helper already logs DISCOVERED, IN_PROGRESS, BACKLOG_TESTS (NOT_RUN at start, final counts at submit),
SUBMITTED and every Game Master call; do not duplicate them. Workers never write progress events.
Summaries are one short line, no secrets, no newlines.

## Lifecycle frames
- `MATCH_PAUSED_V1`: stop all work: `interrupt_agent` every running worker, stop polling and processes you started;
  keep files and slots; do not log `ORCHESTRATOR_ENDED`; end the turn.
- `MATCH_ENDED_V1` (or the board shows FINISHED/TIME OVER): `interrupt_agent` every running worker, do not submit,
  log `ORCHESTRATOR_ENDED` `COMPLETED`, end the turn with
  `{"schemaVersion":1,"status":"SUBMITTED"|"BLOCKED"|"FAILED","backlogs":[...],"summary":"..."}`.

## Never
Force-push, delete branches, change the remote, edit outside `matchRoot` (or a slot's `slotMatchRoot`), push a slot
branch, read other teams' data, use the network beyond Game Master, Git and package registries (no web
search), call admin or grader APIs, press Re-match, guess hidden tests, fabricate test
counts/receipts, print credentials, put credentials in a worker message, or launch another Codex/Claude CLI,
app-server or independent CLI process (subagents only through `spawn_agent`).

## Cost discipline
Your context is re-sent on every call, so anything that enters it is paid again on every later turn (5FLQMNAA:
single tool results of 200-400k characters). Keep tool results small: the helper's results are compact on purpose
(boards, slot summaries, heads; large Company Tools answers come back as `savedTo` files). Never print a whole file,
log, diff or JSON you can query with a short script; never call `view_image` (workers check their own screenshots;
their DONE.json says what the evidence shows); never read briefs or code yourself, never echo what a worker did,
and wait with `wait_for_update` in one long cell instead of `wait_agent` polling or `sleep`. Workers
start with `fork_turns: "none"` so they never pay for your history. Fewer tokens is a tie-breaker.
