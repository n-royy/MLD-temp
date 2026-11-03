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
  your history). Do not set model or reasoning effort. Up to 4 agents run at once including you: at most 3 workers.
- **One worker per item, all worker slots (s1-s3) busy** (see "Wave planning"). A worker may get a second item in
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
- PI or a deadline TASK while all 3 worker slots are busy: do it yourself at once in your slot s4 ("Doing an item
  yourself"); you have the Company Tools directly and no spawn delay.
- No item may sit unstarted while a slot is free. From minute 25, start every remaining item that can still be
  finished; skip only what cannot.
- Keep all 3 worker slots busy from the first wave; dependencies never justify an idle slot ("Wave planning").
  Slot s4 never gets a worker: it is only for an item you do yourself.

## Wave planning: parallel by default, deadline items never wait
Rule of thumb from three real runs: one item per worker, all free slots busy. TDAY8RSF (1.5.1) queued BUG-02
(deadline 18 min) behind BUG-01 in one slot "because the sidebar bug blocks its UI checks" and left two slots
idle; BUG-01 alone takes 10-19 minutes, so BUG-02 would close before it started. 7GAZA14X showed the opposite
risk (a dependent item verified while the blocker was unfixed). Both are solved by running items in parallel and
syncing the dependent slot when the blocker lands, not by queueing.

When a wave appears (game start, or `newItems` on the board):
1. **Read once** `<matchRoot>/.mtm-tmp/repo-map.md` (first wave only) and the compact board entries. Do not open
   briefs or code.
2. **Order:** **PI first, immediately** (race 100/90/75/60 %, FAILED = 0); then deadline items, nearest deadline first (deadline
   minutes count from reveal; skip only an item that cannot be finished in time); then the highest points per
   expected effort (CR/BUG usually before TASK).
3. **Assign in that order, one item per free worker slot (s1-s3), until they are full.** Never leave a slot idle while an
   item is open. A deadline item or PI is never queued behind another item: if no worker slot is free, do it yourself
   in s4 ("Doing an item yourself") when it is a PI or a short TASK; otherwise it takes the next slot that frees.
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
   If a cell still answers "Script running", call `wait` on it with `yield_time_ms: 270000`, never a shorter value.
6. On `SLOT_DONE`: `integrate_item` with `backlogItemKey`, and `next` = the item queued for that slot, if any
   (test counts come from the answer's template rows; pass `acknowledgeTestChanges`
   only when DONE.json gives that reason and the brief allows the test change). It checks the slot is committed and
   stays inside the assigned folder, runs `git pull --rebase`, cherry-picks the slot commits, pushes (never force),
   then runs `submit_work` with every gate, logs `SUBMITTED` with the receipt and returns the refreshed `board`.
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
7. Refill the freed slot from the returned `board` (no `refresh_match` needed). When nothing is workable and no
   worker is busy, keep calling `wait_for_update`. An empty backlog is a waiting state, never the end of the match.

Every call costs a model turn over your whole context: use the fewest calls that satisfy the loop above.

## Baseline failures (only when no baseline patch was prepared)
The preparation summary names tests that fail before any change. A failing baseline test is a planted problem, and
most briefs make "existing tests pass" an acceptance criterion. Name one baseline owner: the first item whose
criteria require existing tests to pass. Its spawn message says `Baseline owner: fix <test> (WORKER.md "Baseline
failures")`; every other worker started before the owner is integrated gets `Known baseline failure <test> is fixed
by <owner ID>; do not touch it`. Integrate the owner first when several workers finish together. Items started after
the owner is integrated already contain the fix.

## Safety net (on `DEADLINE_SOON`)
`wait_for_update` returns `reason: "DEADLINE_SOON"` with `deadlineSoon[]` (`backlogItemKey`, `slot`, `kind`
DEADLINE or MATCH_END, `minutesLeft`) once per busy item, 3 minutes before it closes. For each entry:
1. `send_message` that worker: "<ID>: <minutesLeft> min left. Commit what you have now, fill the answer honestly
   (PARTIAL if a criterion is not met), validate, write doneFile."
2. `wait_for_update` with `timeoutMs: 60000` (honoured only right after DEADLINE_SOON). On `SLOT_DONE`, integrate.
3. Still no DONE.json: `integrate_item` with `allowUncommitted: true` and the honest test counts - an unsubmitted
   item scores 0 anyway. If the answer is not valid yet, the gate says so; then `release_slot` and move on.
For your own item in s4, the same steps apply to yourself: commit, answer, doneFile, `integrate_item`.

## Doing an item yourself (PI or short TASK while s1-s3 are busy)
Work in **your own slot s4**, never in the main checkout (`integrate_item` needs it clean for the workers):
`start_work` with `slot: "s4"` → read its `briefFile` and `.agents/skills/team-orchestrator/WORKER.md` (item kinds 2
and 3; keep big Company Tool answers in files and extract facts with a script, so they stay out of your context) →
work in `<s4 slotMatchRoot>` → answer (`apply_patch` or Node, never PowerShell `ConvertTo-Json`) → run its
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
Your context is re-sent on every call: keep tool results small (slot summaries, heads, boards), never read briefs or
code yourself, never echo what a worker did, and wait with `wait_for_update` instead of `wait_agent` polling. Workers
start with `fork_turns: "none"` so they never pay for your history. Fewer tokens is a tie-breaker.
