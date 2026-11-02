---
name: game-preparation
description: Prepare one MTM match from a PREPARE_GAME_V2 frame - clone the assigned repository, delegate environment setup, build, worker slots and a repo map to a team_repo_scout subagent, log in to the match page and report ENVIRONMENT_READY. No backlog work.
---

# Game preparation (PREPARE_GAME_V2)

The frame after `PREPARE_GAME_V2` is the descriptor. Keep every value exactly. There is **no team API key** yet and
the match clock has not started. Humans will not touch the machine: everything must be automatic.

This conversation continues into the game (START_GAME resumes it), so everything you read now is re-sent on every
game call. **This skill explicitly asks for a sub-agent**: the heavy reading and command output of environment setup
go to one `team_repo_scout` subagent; you keep only its short replies.

## Rules
- MTM Player already wrote `ORCHESTRATOR_STARTED`. Never write it again.
- All progress goes through the `mtm_helper` tool `report_progress` (it adds `schemaVersion` and `playerSessionId`).
  Every `PREPARATION_STATUS` has exactly `type, stage, status, summary`; status is `IN_PROGRESS|COMPLETED|BLOCKED|FAILED`
  (never `PASS`). Report `IN_PROGRESS` when a stage begins and `COMPLETED` only after it is verified.
  Only you write progress events; the scout reports to you.
- Do not push, do not commit, do not call Start Work. Do not change tracked files: the reported revision must be the
  clean checkout.
- Work only in `checkoutRoot` / `matchRoot` (and the slots `<checkoutRoot>.slots/sN`). Never print or write the
  password, and never put it or the descriptor object in a subagent message.
- Long commands: run them with a timeout and show only the tail of their output.
- Subagent calls (`spawn_agent`, `followup_task`, `wait_agent`) are direct tool calls, not inside `exec`. Spawn with the
  role/agent type `team_repo_scout` and `fork_turns: "none"`; do not set model or reasoning effort. Wait with
  `wait_agent` with `timeout_ms: 300000`; never ping the scout with `send_message` while it works. Never launch another Codex/Claude CLI or independent CLI process.

## Steps
1. `configure_session` with `descriptors: [<the PREPARE_GAME descriptor object>]`.
2. **GIT_AUTH** - `git ls-remote <repository.url> <repository.branch>`. If it needs credentials or fails with
   403/404, report `BLOCKED`, `report_progress` a `BLOCKER_OPENED` (`blockerId: GIT_AUTHENTICATION_REQUIRED`,
   `backlogId: null`) and stop with a short final answer: the operator owns Git login. Never type credentials.
3. **REPOSITORY** - if `checkoutRoot/.git` exists and its `origin` equals `repository.url`, `git fetch origin` and
   `git checkout <branch>` + `git merge --ff-only origin/<branch>`; otherwise
   `git clone --branch <branch> --single-branch <url> "<checkoutRoot>"`. Verify `matchRoot` exists.
   Set a local identity once: `git -C <checkoutRoot> config user.name "MLD Digital Cuder"` and
   `git -C <checkoutRoot> config user.email "mld-digital-cuder@users.noreply.github.com"`.
   Record `revision = git rev-parse HEAD` (full SHA).
4. **ENVIRONMENT** - `IN_PROGRESS`, then `spawn_agent` (team_repo_scout, `fork_turns: "none"`):
   ```
   Preparation specialist for match <matchId>. checkoutRoot: <path>. matchRoot: <path>. teamWorkspace: <path>.
   Follow <teamWorkspace>/.agents/skills/game-preparation/ENVIRONMENT.md "0. Speed rules" and part A only
   (environment of the main checkout; per-match database names; machine prerequisites from .mtm-local). Reply in at most 120 words: OK or BLOCKED (+ exact error); the git-ignored env
   file(s) relative to matchRoot that hold local values; the exact database-name and port strings in them.
   ```
   `wait_agent` until it answers. `COMPLETED` when it says OK; on BLOCKED report `BLOCKED` with its one-line error.
5. **Slots** - `prepare_slots` with `count: 4` (s1-s3 for workers, s4 for your own PI/TASK work) and `copyFiles` = the env file(s) from the reply, each with
   `replace` turning the TEST database name into `<name>_{slot}` (and the app database too only when the env-require
   README demands one per working copy) and the app port `<p>` into `<p + 10·n>` (write the port as text, e.g.
   `"PORT=3000": "PORT=30{n}0"` style). It does not change tracked files.
6. **BUILD** - `IN_PROGRESS`, then `followup_task` to the scout:
   ```
   Now ENVIRONMENT.md parts B, C, D, E and F, following "0. Speed rules" (B and C in parallel; cache by tree). Slots: <slot matchRoots from prepare_slots>. Reply in at most 150 words:
   build PASS/FAIL (+ error), slots ready yes/no, failing baseline tests by name with a one-line cause guess,
   repo map written yes/no, tools serve.mjs/shot.mjs verified yes/no, baseline patch ready yes/no (+ one-line
   summary), git status of the checkout clean yes/no.
   ```
   `wait_agent`. `COMPLETED` only if the build succeeded and the checkout has no tracked changes (check
   `git -C <checkoutRoot> status --porcelain --untracked-files=no` yourself: it must be empty). Slot problems are not
   a build failure: note them; the game falls back to fewer slots or single-agent work.
7. **MATCH_LOGIN** - `login_match`, then `refresh_match`. It must show this match ID and team `teamId`. Do not act on
   any backlog item even if some are visible.
8. Append readiness:
   `report_progress {"event":{"type":"ENVIRONMENT_READY","requestId":<descriptor.requestId>,"repository":<descriptor.repository exactly>,"revision":<full SHA from step 3>,"build":"PASS","matchLogin":"PASS"}}`
9. Finish the turn with a short plain summary (at most 8 lines): build result, slots ready, baseline failing tests
   with cause guess, baseline patch ready yes/no with its one-line summary, known risks. Player validates the log, tells Game Master the team is PREPARED, and later resumes
   this same conversation with `START_GAME_V4`. Do not start backlog work before that frame.

## If the scout cannot be used
If `spawn_agent` is unavailable or the scout fails twice, do parts A and B of
`.agents/skills/game-preparation/ENVIRONMENT.md` yourself (same rules), skip slots and the repo map, and say so in the
summary: the game then runs single-agent.
