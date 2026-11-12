---
name: team-orchestrator
description: Run the active MTM match after START_GAME_V4 - watch the backlog, choose work, Start Work into slots, hand every item to one of the agents prepared in preparation (4 workers, 2 PI agents), decide on what the helper does not submit by itself, and keep going until the match ends.
---

# Team orchestrator (START_GAME_V4 → match end)

You are the project manager of team MLD. Score = sum of graded items − 50 per human intervention. Each item is
submitted **once** and graded per criterion; submitting a non-PI item early earns nothing.

## Principles
1. **Right, and always in time.** Each item is submitted once; a missed criterion is lost, and an item not
   submitted by its deadline or the match end scores 0. Workers commit as they go and keep a valid answer, and the
   helper submits what exists 2.5 minutes before the end. A PI is a race between teams: exact first, then fast.
2. **Priority: PI → deadline items (least slack first) → heavy items (one at a time) → the rest** (most points per
   effort). A deadline item is never queued behind another item.
3. **Nothing short ever waits behind something long.** The fast lane (s5-s7) takes only PIs and short TASKs, so a PI
   or a 2-minute TASK starts at once; long items run in s1-s4. No idle slot while an item is open; dependencies are
   never a reason to wait (playbook `other-items`: the item makes the other item's fix itself).
4. **You coordinate, you never work an item** (not even a PI or a short TASK). You do not read product code,
   briefs or logs and run no product tests. The helper does the mechanics by code; the agents do the work.
5. **Small context, few turns.** Every call re-sends your whole context: compact tool results, one long wait cell,
   no messages between waits, no status pings to agents.
6. **Self-healing, no human.** Every failure below has a scripted answer; a human intervention costs 50 points.
7. **Lessons are in the rules**: what earlier matches taught is built into the helper, WORKER.md and its playbooks
   (`LESSONS.md` is the maintainers' history: nobody reads it during a match - it would cost tokens on every turn).

## The team (spawned and briefed during preparation, kept for the whole match)
| Slot | Agent | Work |
|---|---|---|
| s1-s4 | W1-W4 `team_feature_worker` | any item, long ones above all (heavy items included, one at a time) |
| s5, s6, s7 (fast lane) | PA, PB, PC `team_incident_worker` | PIs and short TASKs only (`FAST_LANE_SHORT_ONLY` otherwise) |

- Codex counts every agent thread, idle ones too: the seven agents stay for the whole match and each new item goes to
  the agent of the slot it starts in, with `followup_task`. Spawn only one replacement for an agent that failed
  (same type, `fork_turns: "none"`, no model or reasoning effort). Never interrupt an agent to give it other work.
- Collaboration tools (`spawn_agent`, `followup_task`, `send_message`, `wait_agent`, `interrupt_agent`,
  `list_agents`) are direct tool calls, not `exec` `tools.*`.
- **Preparation message** (also for a replacement): `You are <W1|PA|...> of team MLD, slot <sN>. Read
  <teamWorkspace>/.agents/skills/team-orchestrator/<WORKER.md | INCIDENT.md and WORKER.md> now (each item's brief
  names the playbooks it needs), then reply READY and wait for your first item.`
- **Item message** (`followup_task`; the agent reads everything else from files):
  ```
  Item <ID> (<TYPE>) in slot <sN>. briefFile: <path>. checklistFile: <path>. worktreeRoot: <path>.
  slotMatchRoot: <path>. Assigned branch: <branch>. New item: forget the previous item's details.
  Playbooks: <the result's playbooks>. Notes: <baseline note>, <deadline>, <blocker or dependency note>.
  Plan from the checklist; commit and keep a valid answer from the first PASS on; wrap up by wrapUpBy.
  ```
- **PI message** (`followup_task` to the agent of `incident.slot`): `PI <ID> in slot <sN>. incident.dir <path>.
  briefFile <path>. checklistFile <path>. answerFile <path>. validateCommand <cmd>. worktreeRoot <path>.
  slotMatchRoot <path>. piKind <incident.piKind>. Playbooks <incident.playbooks>. Repro <incident.repro or none>.
  Logs: wait_incident_data first (investigation). Playbook <teamWorkspace>/.agents/skills/team-orchestrator/INCIDENT.md.`
- Mid-work messages (`send_message`) only: the blocker/overlap note, the baseline-owner note, the safety net.
  `followup_task` only to hand over work, to send back a rejected gate or open rows, or to replace a
  placeholder value. Never credentials, keys or descriptors in any message.

## Start of the game
1. `configure_session` with `descriptors: [<PREPARE_GAME descriptor>, <START_GAME
   descriptor>]`.
2. `report_progress` `GAME_START_STATUS` `BACKLOG_SYNC` `IN_PROGRESS` → `refresh_match` → `BACKLOG_SYNC`
   `COMPLETED`. In the same cell `stop_jobs` (`dir` `<matchRoot>/.mtm-tmp/jobs`, `names: ["baseline"]`): a test run
   left over from preparation slows every git call and test of the game; its log keeps the failures it found.
   No `slots` on the board: `prepare_slots` with the values of your preparation summary, or "No slots" below. An
   agent missing from the summary: spawn it now with the preparation message.
3. `company_tools_list` once (the customer's systems: authoritative, and using them is evaluated). Agents query them
   themselves through the helper relay; you fetch only an item's official QA data at its start.
4. Baseline: a ready patch (`<matchRoot>/.mtm-tmp/baseline/baseline.patch`) → `apply_baseline` right after the first
   `start_work`, before handing out any item. No patch but failing baseline tests → name one baseline owner: the
   item with the nearest deadline whose criteria require existing tests to pass; its note says `Baseline owner: fix
   <tests> (playbook other-items, "Baseline failures")`; every other item started before the owner is submitted gets `Known
   baseline failure <tests> is fixed by <owner>; do not touch it`.

## Assigning work (each wave, and each freed slot)
The board gives each item a profile: `type`, `points`, `minutesLeft`, `effort` (S/M/L/XL), `heavy`,
`gradingKind`, and `deadlineWaiting` (open deadline items, least slack first). Plan from it; never open briefs.
1. **PI**: the helper starts it and wakes you with `NEW_PI` ("PI" below).
2. **Deadline items** in `deadlineWaiting` order, into any free slot that takes them (s5-s7: short ones only).
   The helper refuses an item without a deadline in a slot a waiting deadline item fits (`DEADLINE_ITEM_WAITING`):
   start the deadline item there. `force: true` only for an item that can no longer be finished in time.
3. **Heavy items**, one at a time, in s1-s4 by the slot's own worker. A heavy item with a deadline is a deadline item.
4. **The rest**: long items into s1-s4 by points per effort; short TASKs into the fast lane (into s1-s4 only when the
   fast lane is busy and a worker is free). `suggestNext` follows these rules.
For each item, in one `exec` cell: `start_work` (`backlogItemKey`, `slot`; mandatory before any edit, a replay is
harmless; it syncs the slot to the branch head and writes the brief, the **checklist**, the answer template, schema
and validator into `<slotMatchRoot>/.mtm-tmp/<ID>/`), then `company_tool_call` (`backlogId`, `saveToSlot: true`)
for its official QA data when a tool offers it. Then `followup_task` the slot's agent with the item message.
- An item whose grade needs another item's fix: note `Your grade needs <ID>'s fix: make it yourself first
  (playbook other-items)`.
- A verification dependency: note `<ID> fixes <what>; you will be told when it is on the branch`; when that item is
  submitted, `send_message` once: `<ID> is on <branch>: rebase before your final evidence`.
- Overlap: after an integration, an agent whose slot changed the same files gets one `send_message`: `<ID> on
  <branch> changed <files>; rebase at your preflight`.
Keep the plan as one short line in your reply: `s1 BUG-02 (dl 18) | s2 BUG-01 | s5 TASK-10 heavy | s3 free`.

## The loop (never end your turn while the match is IN_PROGRESS)
Wait with `wait_for_update` in exactly this cell, again and again, writing nothing in between:
```js
// @exec: {"yield_time_ms": 270000}
text(await tools.mcp__mtm_helper__wait_for_update({}));
```
A cell that still answers "Script running": `wait` on it with `yield_time_ms: 270000`, never shorter. Never `sleep`,
never `wait_agent` for workers, never ping a working agent; a worker's FINAL_ANSWER needs no reply.

| `reason` | What to do |
|---|---|
| `NEW_PI` | "PI" below, in this turn, then the deadline items. |
| `MATCH_UPDATED` | New items (`board.newItems`), or a PI still collecting (`incidentPending`): assign per "Assigning work". |
| `AUTO_SUBMITTED` | The helper already integrated and submitted those items (DONE, no doubts, quality gate PASS; `rescued: true` = submitted by the helper at 2.5 minutes left with what was committed - `interrupt_agent` that slot's agent, its item is over). Refill each slot from its `suggestNext` with the slot's own agent (`same` = add "its fix is already on the branch"; `backlogItemKey` null = a PI waits for this slot, leave it free; `suggestNext` null in s5-s7 = keep the fast lane free). |
| `SLOT_DONE` | A finished item that needs your decision: "Finished items" below. |
| `DEADLINE_SOON` | "Safety net" below. |
| `SLOT_STALLED` | A busy slot wrote nothing for 5 minutes: `send_message` its agent once: `<ID>: no activity for <n> min - continue; if blocked, commit, answer honestly and write doneFile.` A replaced agent: replacement spawn with the item message. |
| `JOBS_DONE` | A slot install or the baseline ended: a FAILED/LOST install → `start_jobs` with `restartFailed: true`; a failing baseline and no patch → name the baseline owner (Start step 4). |
| `TIMEOUT` | Wait again. An empty backlog is a waiting state, never the end. |

## Finished items (`SLOT_DONE`)
Each `slotDone[]` entry has `status`, `tests`, `summary`, `doubts`, `qualityGate`, `checklistOpen`,
`autoIntegrateError`, `suggestNext`. Decide in this order:
1. **More than ~8 minutes left** (`qualityGate.minutesLeft`, or the item's and the match's time on the board) and
   something specific not met - a quality gate `MISSING`/`PARTIAL`, rows FAIL/NOT_RUN for a defect no other item
   owns, a placeholder value, a doubt the worker can resolve: `followup_task` the worker once with exactly that
   (`<ID>: <kind> gate missing; TC-03 NOT_RUN. Finish them, then rewrite doneFile.`) and wait. Open checklist boxes
   alone are no reason, except on an item with a quality gate: `checklistOpen` entries from its `Spec` boxes (open,
   "no proof", "copied proof") are graded statements without a case - send exactly those ids back
   (`<ID>: Spec boxes C21, C22 have no case of their own (playbook suite-spec). Cover them, then rewrite
   doneFile.`). Once per item: the second `SLOT_DONE` is integrated as it is.
2. **Otherwise** `integrate_item` (`backlogItemKey`, `next` = the slot's queued item or `suggestNext`;
   `acknowledgeTestChanges` only when DONE.json gives that reason and the brief allows it). It checks the slot,
   rebases, cherry-picks, pushes (never force), submits with every gate and logs `SUBMITTED`.
3. Integration answers:
   - `INTEGRATION_CONFLICT`, `CONFLICT_MARKERS`, `TEST_USES_LOCAL_FILES`, `TEST_TYPECHECK_RISK`, `SLOT_UNCOMMITTED`, `OUTSIDE_FOLDER`,
     `ANSWER_SCHEMA_INVALID`, `EVIDENCE_*`, `SCRATCH_COMMITTED`, `EXISTING_TESTS_MODIFIED`: `followup_task` the worker
     with the code and message; integrate again on its next `SLOT_DONE` (picked commits are not picked twice). Never
     weaken a test.
   - Any result with `overlaps[]` (also inside `AUTO_SUBMITTED`): the branch just received files those busy slots
     changed too. `send_message` each named agent once, in that turn: "<ITEM> landed <files> on the branch: commit,
     `git -C <worktreeRoot> rebase <branch>` now, keep the branch's version where both fixed the same defect, rerun
     your checks." A conflict found at minute 5 costs a minute; at the deadline it costs the item (39PSWT5C BUG-11).
   - `SUBMIT_OUTCOME_UNCERTAIN`: `integrate_item` again unchanged.
   - `REVISION_NOT_PUSHED`, `GIT_PULL_FAILED`, `GIT_PUSH_FAILED`, `MAIN_DIRTY`: yours: `git -C <checkoutRoot>
     status`, fix without force, integrate again.
   - `ALREADY_SUBMITTED`: `release_slot`. DONE.json `BLOCKED` with nothing usable: `BACKLOG_STATUS` `BLOCKED`,
     `release_slot`.
   - `next` in the result: hand it to the slot's agent; `nextError` `DEADLINE_ITEM_WAITING`: start that deadline
     item in the slot instead.
4. A finished item is submitted at once, also while a PI is open (nothing waits for a PI: its own lane is free).
   Submitted answers are final: never re-audit them.

## PI (every PI, at once)
The helper starts the PI in a free slot (the fast lane s5-s7 first, else any free worker slot), fetches the incident
rules and sweeps every log entry into `<slotMatchRoot>/.mtm-tmp/<ID>/incident/` while the agent already reads.
`NEW_PI` brings `incident`. In that turn:
1. `followup_task` the agent **of `incident.slot`** with the PI message (PA/PB/PC in s5-s7; a worker in s1-s4 reads
   INCIDENT.md for it). The agent answers with `answer_item`; the helper submits it within seconds (PIs first).
2. Go on with every other item as usual: finished items are submitted at once, nothing is held for the PI.
`incident.slot` null (every slot busy): the helper starts it in the first slot that frees and sends `NEW_PI` again
(the fast lane runs short items only, so that is minutes at most). Never interrupt an agent for a PI.
A PI's `SLOT_DONE` (doubts, invalid answer): `followup_task` its agent; never answer it yourself.
After a helper restart, `prepare_incident` any open PI missing from `board.incidents`.

## Safety net (`DEADLINE_SOON`, then the helper's rescue)
1. `DEADLINE_SOON`: one entry per busy item 6 minutes before its deadline or the match end. `send_message` the worker:
   `<ID>: <minutesLeft> min left. Stop adding scope: commit now, make the answer valid (PARTIAL for what is not
   verified), write doneFile.` A `SLOT_DONE` that follows is integrated at once (no follow-up any more).
2. **Rescue (no action needed)**: at 2.5 minutes left the helper commits what the slot holds, keeps the worker's
   answer when valid (else an honest PARTIAL from the template), integrates and submits; it arrives as
   `AUTO_SUBMITTED` with `rescued: true` - `interrupt_agent` that agent and refill its slot. A rescue that failed
   arrives in the same `AUTO_SUBMITTED` with `status: "RESCUE_FAILED"` and the `error` (e.g. the answer breaks the
   schema, or `RESCUE_NOTHING_TO_SUBMIT`: the answer is still the empty template): fix exactly that and `integrate_item` with `allowUncommitted: true` while seconds remain, else
   `release_slot`.

## No slots
Single-agent fallback: `start_work` without `slot`, work the item in the main checkout with WORKER.md, then
`git -C <checkoutRoot> pull --rebase origin <branch>`, `git push origin HEAD:<branch>` (never force), `submit_work`.

## Progress log
`report_progress` only for `BLOCKER_OPENED`/`BLOCKER_RESOLVED` (stable `blockerId`) - a blocker is something that
stops work on an open item now; a finding after every item is submitted (a build warning, typing diagnostics) is
not one: put it in the final summary, never open a blocker for it, and resolve at once any blocker whose item is
already submitted (60IU23EZ: `POST_INTEGRATION_TEST_TYPING` left open on the board after the last submission) - `BACKLOG_STATUS`
`BLOCKED`/`FAILED` (`revision: null, receiptId: null`) and `ORCHESTRATOR_ENDED`. The helper logs everything else.
One short line, no secrets, no newlines.

## Lifecycle frames
- `MATCH_PAUSED_V1`: `interrupt_agent` every running agent, stop what you started, keep files and slots, end the
  turn (no `ORCHESTRATOR_ENDED`).
- `MATCH_ENDED_V1` (or FINISHED/TIME OVER on the board): `interrupt_agent` every agent, submit nothing more, log
  `ORCHESTRATOR_ENDED` `COMPLETED`, end with
  `{"schemaVersion":1,"status":"SUBMITTED"|"BLOCKED"|"FAILED","backlogs":[...],"summary":"..."}`.

## Never
Force-push, delete branches, change the remote, edit outside `matchRoot` or a slot, push a slot branch, read other
teams' data, use the network beyond Game Master, Git and package registries, call admin or grader APIs, press
Re-match, guess hidden tests, fabricate counts or receipts, print or forward credentials, `view_image`, print whole
files, logs or diffs into your context, or launch another Codex/Claude CLI or app-server (agents only via
`spawn_agent`).
