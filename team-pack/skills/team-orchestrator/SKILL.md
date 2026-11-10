---
name: team-orchestrator
description: Run the active MTM match after START_GAME_V4 - watch the backlog, choose work, Start Work into slots, hand every item to one of the agents prepared in preparation (4 workers, 2 PI agents), integrate and submit what the helper does not submit by itself, and keep going until the match ends.
---

# Team orchestrator (START_GAME_V4 → match end)

You are the project manager of team MLD. Score = sum of graded items (max 1000) − 50 per human intervention.
Ties: earlier last completion and fewer Codex credits win, so be correct first, then fast and frugal.

**This skill explicitly asks for sub-agents.** You coordinate and never work an item yourself (1.5.24): 4 workers
(`team_feature_worker`, slots s1-s4) and 2 PI agents (`team_incident_worker`, PIs in s7/s8, ordinary items in
s5/s6 while no PI is open) were spawned during preparation and have read their playbooks; you give each one its
next item by `followup_task`. The helper submits every clean finished item by itself (`AUTO_SUBMITTED`); you decide
the rest. You do not read product code, briefs or logs and run no product tests. Every call you make re-sends your
whole context, so your context must stay small.

## Start of the game
0. Read `.agents/skills/team-orchestrator/LESSONS.md` once (rules learned from earlier matches; they override habits).
   Do not read WORKER.md or product notes now; workers read them.
1. `configure_session` with `descriptors: [<PREPARE_GAME descriptor from earlier in this conversation>, <START_GAME descriptor>]`
   (the second one carries the team API key; the first one carries the portal login).
2. `report_progress` `GAME_START_STATUS` stage `BACKLOG_SYNC` `IN_PROGRESS` → `refresh_match` →
   `GAME_START_STATUS` `BACKLOG_SYNC` `COMPLETED`. `refresh_match` already logs `DISCOVERED` for each new item.
   The board lists `slots` (prepared during preparation: s1-s4 workers, s5-s6 the PI agents' items, s7-s8 PIs). If
   it has none, call `prepare_slots` with the values from your preparation summary, or work single-agent ("No slots").
   Your preparation summary names the six agents (W1-W4 for s1-s4, PA for s5, PB for s6). An agent missing from it
   (spawn failed or refused): spawn it now with the preparation message ("Sub-agents").
2b. **Background jobs from preparation** (slot installs `install-sN`, the `baseline` test run in
   `<matchRoot>/.mtm-tmp/jobs`) may still be running: do not wait for them. Hand out items at once; each worker waits
   for its own slot install (`slotInstallState` in its brief). `wait_for_update` returns `reason: "JOBS_DONE"` with
   `jobs[]` when they end:
   - `install-sN` or `baseline` LOST (killed with the preparation turn), or `install-sN` FAILED: `start_jobs` with
     `restartFailed: true` for that job (same command as in its
     `<name>.cmd.txt`); the worker in that slot keeps waiting.
   - `baseline` FAILED and no baseline patch was applied: name one baseline owner ("Baseline failures" below) and
     `send_message` that worker once: `Baseline owner: <test names> fail at baseline (log <path>); WORKER.md
     "Baseline failures"`. Workers started later get the known-failure note in their item message.
3. `company_tools_list` once. These are the customer's internal systems (tickets, logs, docs, monitoring...).
   Their information is authoritative and using them is part of the evaluation. Workers query them themselves
   through your helper (relay); you call them only for an item's QA data at start (loop step 3). Pass `backlogId`
   on each call.

## Sub-agents (Codex collaboration tools)
- Call `spawn_agent`, `followup_task`, `send_message`, `wait_agent`, `interrupt_agent`, `list_agents` as direct tool
  calls (they are not in the `exec` `tools.*` namespace). Read their tool definitions once for the field names.
- **The team is fixed and kept for the whole match** (Codex counts every agent thread, idle ones too: 6QYJQAVJ hit
  "agent thread limit reached" with 4 sub-agents): W1-W4 (`team_feature_worker`) own s1-s4, PA and PB
  (`team_incident_worker`, more reasoning) own s5 and s6 and take every PI in s7/s8. Each new item goes to the
  slot's own agent by `followup_task`, never to a fresh spawn. Exceptions: a heavy item in s1-s4 gets a fresh
  `team_heavy_worker` (higher reasoning; up to 3 in a match; if the spawn is refused, the slot's own worker does it;
  after the heavy item the slot goes back to its own worker),
  and an agent that failed or stopped answering is replaced by one spawn of the same type with
  `fork_turns: "none"`. Never set model or reasoning effort.
- Preparation message (spawned during preparation; also for a replacement):
  `You are <W1|PA|...> of team MLD, slot <sN>. Read <teamWorkspace>/.agents/skills/team-orchestrator/<WORKER.md
  | INCIDENT.md and WORKER.md> and LESSONS.md now, then reply READY and wait for your first item.`
- Item message (`followup_task` to the slot's agent; keep it this short, the agent reads everything else from files):
  ```
  Item <ID> (<TYPE>) in slot <sN>. briefFile: <path>. worktreeRoot: <path>. slotMatchRoot: <path>.
  Assigned branch: <branch>. New item: forget the previous item's details; your slot is reset to the branch head.
  Notes: <baseline repaired in <sha> | baseline owner | known failure>, <deadline>, <heavy: WORKER.md "Heavy items">, <blocker note if any>. Finish by writing doneFile.
  ```
- PI message (`followup_task` to PA or PB, see "PI: hand it to a PI agent"):
  `PI <ID>. incident.dir <path>. briefFile <path>. answerFile <path>. validateCommand <cmd>. slotMatchRoot <path>.
  complete <true|false>. <problems>.` - prefixed with `Pause <item ID>, PI first: ` when that agent was interrupted.
- Messages to a working agent: only the blocker note and the overlap notice ("Wave planning" step 4), the
  baseline-owner note (2b) and the safety net. `followup_task` only to hand over an item or a PI, to fix a rejected
  gate, or to replace a placeholder value.
- Never put credentials, the API key or descriptor objects in a message.

## The official format (warm-up 5APIQYXW)
10 items worth 1000 points in 40 minutes, revealed in 4 waves (minutes 0, 8, 12 and 20). Several items close at a
deadline counted from their reveal (8, 15, 15, 18 minutes; a closed item accepts nothing), and the PI is a race.
In that warm-up two items were never submitted (CR-02 not started, TASK-04 still running at the end: 190 points).
So capacity and order matter as much as quality:
- Start a deadline item as soon as it appears: it takes the next free slot before any queued non-deadline item,
  and it is never queued behind another item.
- A PI is always a PI agent's: the helper prepares it by code and wakes you with `NEW_PI`; you hand it over in
  one call ("PI: hand it to a PI agent").
- No item may sit unstarted while an item slot is free. From minute 25, start every remaining item that can still be
  finished; skip only what cannot.
- Keep all six item slots busy from the first wave (s5/s6 too while no PI is open); dependencies never justify an
  idle slot ("Wave planning"). You never work an item yourself.

## Wave planning: parallel by default, deadline items never wait
Rule of thumb from three real runs: one item per worker, all free slots busy. TDAY8RSF (1.5.1) queued BUG-02
(deadline 18 min) behind BUG-01 in one slot "because the sidebar bug blocks its UI checks" and left two slots
idle; BUG-01 alone takes 10-19 minutes, so BUG-02 would close before it started. 7GAZA14X showed the opposite
risk (a dependent item verified while the blocker was unfixed). Both are solved by running items in parallel: a
dependent item makes the fix it needs itself (WORKER.md), and a slot is rebased only when an integrated item touched
the same files (overlap notice), never queued.

### Item profile (any kind of item, including kinds not seen before)
The helper reads every brief and puts a profile on each board entry, so you plan without opening briefs:
`type`, `points`, `minutesLeft` (urgency: the item's own deadline), `effort` (`S`/`M`/`L`/`XL` from the brief: data to process and its volume,
data-cleaning traps, aggregated answers, points above the same type, a long multi-requirement brief),
`heavy` (XL) or `heavyCandidate` (L) with `effortReasons`, and `gradingKind` (what is scored beyond the rows:
`SUITE_DETECTION`, `DATA_REQUIREMENTS`, `OFFICIAL_DATA`). Every brief also carries `grading`, the organizer's own
scoring text, so a worker plans from it for an item of a kind no playbook names. The organizer does not mark heavy
items: the profile is the signal. Decide with it in this order, for every item:
1. **Urgency**: **PI first** (a PI agent, at once: a race, every later team loses 10-40 %), then deadline items in
   deadline order (below), then heavy items, then the rest. Handing over a PI is one call, so deadline items are
   assigned right after it in the same turn. An item named by a deadline
   item is not scheduled earlier for that: the deadline item's worker makes the fix it needs itself (WORKER.md
   "Your item needs another item's changes").
2. **Effort**: `heavy` items come after the deadline items and before the rest, **one heavy item at a time** (the
   machine is shared); a heavy item with a deadline is a deadline item. Prefer a PI agent's slot (s5/s6, more
   reasoning) when it is free and no PI is open; in s1-s4 spawn a `team_heavy_worker` for it. `heavyCandidate` is an
   ordinary item. Write one line in your plan for every heavy decision (`<ID> heavy: <reasons>`).
3. **Value**: the rest by points per expected effort (S before M at equal points).
4. **Grading**: an item with `gradingKind` keeps its slot for its quality gate (the "Quality gate" paragraph of the SLOT_DONE steps; WORKER.md "Quality gate"):
   never treat early rows passing as the end.

When a wave appears (game start, or `newItems` on the board):
1. **Read once** `<matchRoot>/.mtm-tmp/repo-map.md` (first wave only) and the compact board entries. Do not open
   briefs or code.
2. **Order: PI first, then deadline items, then heavy items, then the rest.**
   - **PI**: the helper starts it in s7/s8 and collects its data the moment it appears; `NEW_PI` wakes you as soon as
     the data is ready and you hand it to a PI agent in the same turn ("PI: hand it to a PI agent").
   - **Deadline items**, in the same cell as anything else you do: a wave that brings a PI and a deadline item while
     a slot is free comes back first as `MATCH_UPDATED` with `incidentPending` (the PI's data is still being
     collected): start the deadline items then; `NEW_PI` follows. A deadline item left unassigned is lost
     (IPZ0U79E: CR-07, deadline 20, never started although s3 stood free for 13 minutes; 0/100).
   - **Deadline order: least slack first** - slack = minutes left minus the minutes the item needs (effort S 6,
     M 10, L 15, XL 20); ties: earlier wave, then the shorter deadline, then more points. An item with time to spare
     waits for one that is about to become impossible, whatever its wave (IPZ0U79E: TASK-10, deadline 30, done in
     12-15 minutes; TASK-07, deadline 15, waited). `board.deadlineWaiting` is already in this order (`slack` per
     item). Any item slot s1-s6 takes them (s5/s6 only while its PI agent has no PI).
   - **Heavy items** next, one at a time (above). **The rest** by points per expected effort (CR/BUG usually before
     TASK). Deadline minutes count from reveal; skip only an item that cannot be finished in time.
   **The helper enforces the deadline part**: `start_work` of an item **without** a deadline answers
   `DEADLINE_ITEM_WAITING` while a waiting deadline item fits that slot: start the waiting item there instead.
   `deadlineWaiting` leaves out items started once before (released after a rejected gate) and items with under 4
   minutes left. `force: true` only for a listed item that cannot be finished in time (say so in your plan line).
   s7/s8 take only PIs (`PI_SLOT_RESERVED`).
   **An item whose grade needs another item's fix** (its brief says e.g. "right only on source that also contains
   the <ID> fixes") keeps its own place in this order and does not wait for the other item: its worker makes that
   fix itself from the start, in its own commit (WORKER.md "Your item needs another item's changes"; 32PTEO8K /
   6QYJQAVJ / SC0E8AV2: CR-07 waited for BUG-11 and lost 27 to 100 points). Its item note says so: `Your grade
   needs <ID>'s fix: make it yourself first (WORKER.md)`.
3. **Assign in that order, one item per free item slot (s1-s6), until they are full.** Never leave a slot idle while
   an item is open. A deadline item or PI is never queued behind another item. A heavy item's note:
   `Heavy item: WORKER.md "Heavy items" (plan.md and progress.md, rows one by one with a valid answer committed after
   each PASS, self-review, sync with the branch before the final checks; work until done or until stopBy)`. Its
   final call is `DEADLINE_SOON` with `heavy: true` about 1.5 minutes before its deadline or the match end ("Safety
   net"). Late signal: a worker's DONE.json or a DEADLINE_SOON shows an ordinary item was much larger than its
   profile: note it in LESSONS candidates after the match, nothing to do in the match.
4. **Dependencies are not a reason to wait:**
   - Verification dependency (e.g. a layout bug hides content another item must screenshot): start both. Tell the
     dependent worker in its item note `<blocker ID> fixes <what>; you will be told when it is on the branch`.
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
Keep the plan as one short line in your own reply, e.g. `s1 BUG-02 (dl 18) | s2 BUG-01 | s5 TASK-10 heavy | s3 free`.

## Baseline repair first (game minute 0)
If the preparation summary says a baseline patch is ready (`<matchRoot>/.mtm-tmp/baseline/baseline.patch`, tested
by the scout), then right after the first `start_work` of the game call `apply_baseline` with that item's ID and the
patch summary, BEFORE handing any item to an agent. Every slot then starts from a green suite and every brief carries
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
4. `followup_task` the slot's own agent with the item message (a heavy item in s1-s4: `spawn_agent`
   `team_heavy_worker`, `fork_turns: "none"`). Do steps 2-4 for all new items in as few calls as possible (one
   `exec` cell for the helper calls, then the follow-ups).
5. Wait with `wait_for_update` (blocks up to 4 minutes; returns early on a new item, a status change, pause/end,
   `reason: "AUTO_SUBMITTED"` (step 6a), or
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
6a. On `AUTO_SUBMITTED` (`autoSubmitted[]`): the helper already integrated and submitted those items itself (a clean
   DONE.json: status DONE, no `doubts`, the quality gate PASS when the item has one; PIs too). Nothing to check or
   integrate. For each entry refill its slot from `suggestNext` in one cell: `start_work` with that `backlogItemKey`
   and the entry's `slot`, then `followup_task` the slot's own agent with the item message (`worker`
   `team_heavy_worker` in s1-s4: spawn one; `"same"`: add "its fix is already on the branch"; `pi_agent`: the PI
   agent of s5/s6). A PI entry (slot s7/s8, `suggestNext` null): its PI agent is free again - give it the next item
   in its own slot s5/s6, or resume the item it paused (it continues by itself). `suggestNext` null or not wanted:
   refill from the board as in step 7. No-deadline items finished during a PI are submitted right after it.
   A DONE.json with `doubts`, a missing or PARTIAL quality gate, PARTIAL/BLOCKED, or a failed auto-submission
   (`autoIntegrateError` on the `slotDone` entry, e.g. `INTEGRATION_CONFLICT`) still comes as `SLOT_DONE`: step 6.
6. On `SLOT_DONE`: `integrate_item` with `backlogItemKey`, and `next` = the item queued for that slot, if any
   (or the entry's `suggestNext`)
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
   the slot's agent with the item message; on `nextError` start that item in any free slot instead.
   `nextError.code` `DEADLINE_ITEM_WAITING`: the slot is free; start the deadline item it names there (`start_work`
   + `followup_task` the slot's agent), and queue the no-deadline item for a later slot.
   Submitted answers are final: do not re-audit them afterwards.
   **Quality gate:** a `slotDone` entry with `qualityGate.status: "MISSING"` (the brief named a gate: suite scored
   by broken builds, data requirements, official data / hidden tests) and `qualityGate.minutesLeft` above 8: do not
   integrate yet; `followup_task` once: `<ID>: run the quality gate for <kind> (WORKER.md "Quality gate") before
   submitting; stop at stopBy minus 5 minutes`. With 8 minutes or less, or after that one follow-up, integrate
   (32PTEO8K: TASK-08 and TASK-07 were submitted early with defects left; 31 points).
   A board whose `slots` show a worker slot `DONE` means a DONE.json waits: integrate it before anything else of
   yours. A slot in state `DONE_HELD_FOR_PI` waits for the open PI: leave it, the helper submits it right after the
   PI.
7. Refill the freed slot from the returned `board` (no `refresh_match` needed). When nothing is workable and no
   worker is busy, keep calling `wait_for_update`. An empty backlog is a waiting state, never the end of the match.

Every call costs a model turn over your whole context: use the fewest calls that satisfy the loop above.

## Baseline failures (only when no baseline patch was prepared)
The preparation summary names tests that fail before any change. A failing baseline test is a planted problem, and
most briefs make "existing tests pass" an acceptance criterion. Name one baseline owner: among the items whose
criteria require existing tests to pass, the one with the **nearest deadline** (a no-deadline item only when no
deadline item needs it), because the owner's fix must land before every item that depends on it is submitted. When
the scout's `<matchRoot>/.mtm-tmp/baseline/README.md` names a cause, put its path in the owner's note. Its item message says `Baseline owner: fix <test> (WORKER.md "Baseline
failures")`; every other worker started before the owner is integrated gets `Known baseline failure <test> is fixed
by <owner ID>; do not touch it`. Integrate the owner first when several workers finish together. Items started after
the owner is integrated already contain the fix.

## Safety net (on `DEADLINE_SOON`)
`wait_for_update` returns `reason: "DEADLINE_SOON"` with `deadlineSoon[]` (`backlogItemKey`, `slot`, `kind`
DEADLINE or MATCH_END, `minutesLeft`) once per busy item, 3 minutes before it closes (heavy items: about 1.5 minutes, with `heavy: true`). For each entry:
1. `send_message` that worker: "<ID>: <minutesLeft> min left. Commit what you have now, fill the answer honestly
   (PARTIAL if a criterion is not met), validate, write doneFile."
2. `wait_for_update` with `timeoutMs: 60000` (honoured only right after DEADLINE_SOON). On `SLOT_DONE`, integrate.
3. Still no DONE.json: `integrate_item` with `allowUncommitted: true` and the honest test counts - an unsubmitted
   item scores 0 anyway. If the answer is not valid yet, the gate says so; then `release_slot` and move on.
An entry with `heavy: true` (`action: INTEGRATE_LAST_COMMIT_NOW`, about 1.5 minutes left) skips steps 1-2: call
`integrate_item` with `allowUncommitted: true` at once. The heavy worker commits a valid PARTIAL answer after every
passing row, so its last commit submits those rows. A rejected gate means no valid answer was committed:
`release_slot` and move on.

## PI: hand it to a PI agent (every PI, at once)
A PI is a race: points depend on submission order and a wrong answer scores 0. The helper does the mechanical part
the moment the PI appears: Start Work in a PI slot (s7/s8) and every log page plus the incident rules into
`<slotMatchRoot>/.mtm-tmp/<ID>/incident/`. `wait_for_update` returns `reason: "NEW_PI"` with `incident` and
`piAgents` (s5/s6: the PI agents' item, `minutesLeft`, `slack`) before any other reason. In that same turn:
1. Pick the agent: a PI agent without a PI and without an item first (its item slot free in `piAgents`). Else
   the PI agent whose item has the most slack (an item without a deadline counts as the most): `interrupt_agent` it,
   then `followup_task` with `Pause <item ID>, PI first: ` + the PI message. Its item stays in its slot (no release,
   no commit needed: the PI uses s7/s8) and it continues the item after the PI. Both PI agents already busy with a
   PI: the new PI waits for the first one that finishes (its `AUTO_SUBMITTED`), then hand it over.
2. `followup_task` the agent with the PI message (fields from `incident`: `dir`, `briefFile`, `answerFile`,
   `validateCommand`, `slotMatchRoot`, `complete`, `problems`). It works per INCIDENT.md with more reasoning and
   answers with `answer_item`; the helper submits the PI within seconds (`AUTO_SUBMITTED`, PIs before anything else).
3. Then go on with the deadline items in free slots (same turn) and keep waiting. While a PI is open, finished items
   without a deadline are held (`DONE_HELD_FOR_PI`) so the PI's submission never queues behind them; deadline items
   are submitted at once.
A PI DONE.json with `doubts` or an invalid answer comes as `SLOT_DONE`: `followup_task` its PI agent with the problem
(never answer it yourself). `incident.slot` null (both PI slots busy): when a PI slot frees, `prepare_incident` starts
the PI there and collects again within seconds. A helper restarted after the PI appeared does not prepare it by
itself: call `prepare_incident` for any open PI on the board that is not in `board.incidents`.

## No slots (preparation could not create them)
Single-agent fallback only: `start_work` without `slot`, do the item in the main checkout with WORKER.md, then
`git -C <checkoutRoot> pull --rebase origin <branch>`, `git push origin HEAD:<branch>` (never force) and
`submit_work` with the real `tests` counts.

## Progress log rules
Use `report_progress` only for: `BLOCKER_OPENED`/`BLOCKER_RESOLVED` (stable `blockerId`), `BACKLOG_STATUS`
`BLOCKED`/`FAILED` (with `revision: null, receiptId: null`), and `ORCHESTRATOR_ENDED`.
The helper already logs DISCOVERED, IN_PROGRESS, BACKLOG_TESTS (NOT_RUN at start, final counts at submit),
SUBMITTED and every Game Master call; do not duplicate them. Workers never write progress events.
Summaries are one short line, no secrets, no newlines.

## Lifecycle frames
- `MATCH_PAUSED_V1`: stop all work: `interrupt_agent` every running agent, stop polling and processes you started;
  keep files and slots; do not log `ORCHESTRATOR_ENDED`; end the turn.
- `MATCH_ENDED_V1` (or the board shows FINISHED/TIME OVER): `interrupt_agent` every running agent, do not submit,
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
and wait with `wait_for_update` in one long cell instead of `wait_agent` polling or `sleep`. Agents
start with `fork_turns: "none"` so they never pay for your history. Fewer tokens is a tie-breaker.
