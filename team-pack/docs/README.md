# Design notes

## Lifecycle (as implemented by MTM Player 0.9.33)
- Player runs `codex exec --json --dangerously-bypass-approvals-and-sandbox -C <TeamWorkspace> -` through `pwsh`
  and writes the frame to stdin. PREPARE is the first turn; START_GAME resumes the same Codex session
  (`codex exec resume`), so the MCP helper restarts between phases: `configure_session` receives both descriptors.
- Player writes `ORCHESTRATOR_STARTED` itself, validates `ENVIRONMENT_READY` from the progress log, calls
  Preparation Complete, waits for IN_PROGRESS and sends `START_GAME_V4`.
- If the game turn exits while the match is IN_PROGRESS, Player starts a replacement with `RESUME_GAME_V1`.
- PAUSED/FINISHED stop the process tree.
- Player renders the dashboard only while the progress log is under 256 KiB: the helper does not log the
  lightweight feed polls of `wait_for_update`, and optional events are skipped above 200 KiB.

## Game Master endpoints used
- `POST /api/v1/auth/login` `{username,password}` (cookie session; requires a same-origin `Origin` header).
- `GET /api/v1/match/<matchId>` match projection: `match`, `team`, `backlog[]`, `api.startEndpoint`,
  `api.submissionEndpoint`, `api.feedEndpoint`.
- `GET <feedEndpoint>?afterSequence=<n>` change feed (409 = reload).
- `POST /api/v1/matches/<matchUuid>/backlogs/start` and `/submissions` with the team bearer key.
- Company Tools MCP: `POST /api/v1/mcp/<matchId>` (Streamable HTTP, bearer key; content only after start).
The rematch endpoint is never called.

## Submission contract enforced by `submit_work`
- revision is a full SHA reachable from `origin/<branch>` (pushed);
- `<folder>/answers/<ID>/submit.json` exists in that revision and is the answer sent;
- every `evidence/<file>` string in the answer exists at `<folder>/answers/<ID>/evidence/<file>` in that revision;
- one `clientSubmissionId` per item, reused as `Idempotency-Key` for retries.

## Multi-agent layout (1.3.0)
- Root `team_orchestrator` coordinates only. Codex native collaboration tools (`spawn_agent`, `followup_task`,
  `send_message`, `wait_agent`, `interrupt_agent`) start subagents inside the same `codex exec` process; no other CLI is
  launched. Multi-agent mode is `explicitRequestOnly`, so the skills ask for subagents explicitly. Spawns use
  `fork_turns: "none"` so a subagent never re-pays the orchestrator's history. 4 concurrent agents including root.
- Preparation: one `team_repo_scout` does environment, build, slot setup and `<matchRoot>/.mtm-tmp/repo-map.md`
  (`skills/game-preparation/ENVIRONMENT.md`). The orchestrator keeps only its short replies, which matters because
  START_GAME resumes the same conversation.
- Slots: `prepare_slots` creates Git worktrees `<checkoutRoot>.slots/sN` on local-only branches `mtm-slot/sN`
  (never pushed) and copies git-ignored env files with per-slot database names/ports. State:
  `<checkoutRoot>/.git/mtm/slots.json`.
- `start_work {slot}` resets the slot to the checkout HEAD and writes brief, organizer files, schema and a stand-alone
  validator to `<slotMatchRoot>/.mtm-tmp/<ID>/`; the orchestrator receives a short summary only.
  `company_tool_call {saveToSlot}` stores Company Tool answers there too.
- One `team_feature_worker` per item (`skills/team-orchestrator/WORKER.md`) implements, tests, writes answer and
  evidence, commits on the slot branch and writes `DONE.json`. `wait_for_update` returns `SLOT_DONE` when it appears.
- `integrate_item` checks the slot (committed, assigned folder only, no credential in the diff), `git pull --rebase`,
  cherry-picks the slot commits onto the assigned branch, pushes without force and runs `submit_work` unchanged, so
  every submit gate of 1.2.2 still applies. Conflicts abort cleanly (nothing pushed or sent).
