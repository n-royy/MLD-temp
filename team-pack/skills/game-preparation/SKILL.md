---
name: game-preparation
description: Prepare one MTM match from a PREPARE_GAME_V2 frame - clone the assigned repository, delegate environment setup, build, slot installs and a repo map to a team_repo_scout subagent, spawn the match team (4 workers, 2 PI agents) so they read their playbooks before the game, log in to the match page and report ENVIRONMENT_READY. No backlog work.
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
**Time matters here** (UV8P4HUS 1.5.3: 26 minutes, and the match clock was already running at ENVIRONMENT_READY).
READY needs: doctor READY, build PASS, match login and **all seven slots installed** (1.5.25). The slot installs
start as soon as the main install is done and run one at a time beside the build; READY waits for every one of them
(step 7b). YH6OAYMZ (1.5.24): installs that ran on into the game (22 and 34 minutes each, with hard links and two at a
time) made every git call take minutes; nothing was submitted in 32 minutes. Only the baseline test run may still be
running at READY, and the game stops it at its start.
**Order for speed** (IPZ0U79E 1.5.21: ~17.5 minutes from the clone to installed slots, 2 m 17 s of it before the
main install started): the scout is spawned right after the clone and starts the main install as its first action;
slots and the match team are created while it runs.

3b. **ENVIRONMENT + BUILD** - right after the clone: report `ENVIRONMENT` `IN_PROGRESS` and `BUILD` `IN_PROGRESS`,
   then `spawn_agent` (team_repo_scout, `fork_turns: "none"`):
   ```
   Preparation specialist for match <matchId>. checkoutRoot: <path>. matchRoot: <path>. teamWorkspace: <path>.
   Slots (worktrees, being created now, ready before the main install ends): s1-s7 at
   <checkoutRoot>.slots/s1/<folder> .. s7/<folder> (all seven get the install).
   FIRST start the main install job (ENVIRONMENT.md "0. Speed rules"), then follow "0. Speed rules" and part A
   (environment and build of the main checkout, per-match database names, machine prerequisites from .mtm-local;
   the slot installs s1-s7 start right after the main install, beside the build, ONE at a time; no Yarn hard-link
   options; long commands only through start_jobs/wait_jobs). Reply in at most 120 words: OK or BLOCKED (+ exact
   error); build PASS/FAIL; the git-ignored env file(s) relative to matchRoot that hold local values; the
   exact database-name and port strings in them.
   ```
3c. **Slots** - then at once `prepare_slots` with `count: 7` and no `copyFiles` (worktrees only, under a minute).
3d. **Match team** - then spawn the seven match agents (all with `fork_turns: "none"`, no model or reasoning effort),
   in one go, each with the preparation message of the team-orchestrator SKILL.md "The team":
   W1-W4 = `team_feature_worker` for s1-s4 (playbook WORKER.md), PA, PB and PC = `team_incident_worker` for s5, s6 and s7
   (playbook INCIDENT.md and WORKER.md; a PI first, items while no PI is open). Keep their agent ids for the summary. Do not wait for their
   READY (they need no reply). A spawn refused ("agent thread limit"): note which agent is missing in the summary;
   the game spawns it later.
4. `wait_agent` (the scout) until it answers. `ENVIRONMENT` `COMPLETED` when it says OK (BLOCKED: report `BLOCKED` with its
   one-line error); `BUILD` `COMPLETED` when the build passed and `git -C <checkoutRoot> status --porcelain
   --untracked-files=no` is empty (check it yourself).
5. **Slot env files** - `prepare_slots` again with `count: 7` (the worktrees of step 3c are kept) and `copyFiles` = the env file(s) from the reply, each with
   `replace` turning the TEST database name into `<name>_{slot}` (and the app database too only when the env-require
   README demands one per working copy) and the app port `<p>` into `<p + 10·n>` (write the port as text, e.g.
   `"PORT=3000": "PORT=30{n}0"` style). It does not change tracked files.
6. **Background jobs, repo map, tools** - `followup_task` to the scout:
   ```
   Now ENVIRONMENT.md parts B (start the baseline job after the installs, do NOT wait for it; the slot installs already run), D, E,
   and F only if its condition holds. Reply in at most 120 words: jobs started (names), repo map
   written yes/no, serve.mjs/shot.mjs verified yes/no, baseline result if already finished (failing tests by name),
   baseline patch ready yes/no (+ one line), checkout clean yes/no.
   ```
   `wait_agent`. The baseline run keeps running; it never blocks READY.
7. **MATCH_LOGIN** - `login_match`, then `refresh_match`. It must show this match ID and team `teamId`. Do not act on
   any backlog item even if some are visible.
7b. **Slot installs: all seven before READY** - `wait_jobs` (`dir` = `<matchRoot>/.mtm-tmp/jobs`, `names`:
   `install-s1` .. `install-s7`, `timeoutMs: 280000`), again while `done` is false, at most 5 calls (seven installs). A FAILED one:
   `start_jobs` with `restartFailed: true` for it (same command, no wait prefix) and wait for it the same way. Only an
   install still failing after that restart goes into the summary as a risk (its slot is then not used for items).
8. Append readiness:
   `report_progress {"event":{"type":"ENVIRONMENT_READY","requestId":<descriptor.requestId>,"repository":<descriptor.repository exactly>,"revision":<full SHA from step 3>,"build":"PASS","matchLogin":"PASS"}}`
9. Finish the turn with a short plain summary (at most 9 lines): build result, slots created and installed (or the
   installs that failed), the match team (W1-W4, PA, PB, PC with their agent ids; any missing), background jobs still running (names; jobs dir `<matchRoot>/.mtm-tmp/jobs`), baseline result if known, baseline patch ready yes/no,
   known risks. Player validates the log, tells Game Master the team is PREPARED, and later resumes
   this same conversation with `START_GAME_V4`. Do not start backlog work before that frame.

## If the scout cannot be used
If `spawn_agent` is unavailable or the scout fails twice, do parts A and B of
`.agents/skills/game-preparation/ENVIRONMENT.md` yourself (same rules), skip slots and the repo map, and say so in the
summary: the game then runs single-agent. The match team (step 3d) is spawned all the same.
