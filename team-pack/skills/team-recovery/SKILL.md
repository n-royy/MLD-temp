---
name: team-recovery
description: Resume a stopped MTM round from RESUME_PREPARATION_V1 or RESUME_GAME_V1 without losing completed work or submitting twice.
---

# Team recovery (RESUME_PREPARATION_V1 / RESUME_GAME_V1)

MTM Player started a replacement orchestrator with fresh access. The previous session may have died mid-step.

## Always first
1. `configure_session` with `descriptors: [<this RESUME descriptor>]` (it carries the login and, for GAME, the API key).
2. `report_progress` `ORCHESTRATOR_RESTARTED` with `attempt = restartAttempt`, `phase` = `PREPARATION` or `GAME`,
   `reason` = descriptor `reason`, and a short summary.
3. Read the existing progress log (`progressLogFile`): which gates completed, which items are DISCOVERED /
   IN_PROGRESS / SUBMITTED, and receipts. Never clear, reclone or reset an existing checkout.

## RESUME_PREPARATION_V1
- `prepare_slots` is idempotent: existing slots are kept.
- Keep the checkout if `checkoutRoot/.git` exists with the right `origin` and branch; only fetch/fast-forward.
- Rerun only the gates that are not `COMPLETED` in the log (or whose result is no longer true), following
  `.agents/skills/game-preparation/SKILL.md`.
- Append `ENVIRONMENT_READY` with this descriptor's `requestId` and the current clean revision, then end the turn.

## RESUME_GAME_V1
- `refresh_match` to reconcile with Game Master (server state wins over local notes).
- `<checkoutRoot>/.git/mtm/submissions.json` holds each submission's idempotency key and receipt:
  - receipt present → the item is submitted; never submit it again;
  - outcome `SENDING`/`UNCERTAIN` → call `submit_work` again unchanged (the same key is reused);
- For items you had started: `git status` / `git log origin/<branch>..HEAD` in the checkout; keep valid local work,
  push unpushed commits, then finish and submit them. `start_work` again is a harmless replay that returns the template.
- Queued items live only in the previous orchestrator's context: re-plan the remaining items ("Wave planning") after
  handling the busy slots below. `<checkoutRoot>/.git/mtm/baseline.json` tells whether the baseline repair is in.
- Slots: the board's `slots` (from `<checkoutRoot>/.git/mtm/slots.json`) survive the restart, workers do not.
  First spawn the match team again (`fork_turns: "none"`): W1-W4 `team_feature_worker` for s1-s4, PA and PB
  `team_incident_worker` for s5/s6, who take every PI (team-orchestrator SKILL.md "Sub-agents").
  For each slot with an item: if `<slotMatchRoot>/.mtm-tmp/<ID>/DONE.json` exists and the slot is committed, call
  `integrate_item`; otherwise `start_work` with the same `slot` (a replay that keeps the slot's work) and give it to
  that slot's agent (a PI: PA or PB, with the PI message after `prepare_incident`) with a message that adds:
  "Resume: inspect `git -C <worktreeRoot> log` and `status`, keep valid work, finish the item." Never reset a slot
  that holds unintegrated work. You never work an item yourself.
- Then continue with `.agents/skills/team-orchestrator/SKILL.md` (the loop). Do not end the turn while the match is
  IN_PROGRESS.
