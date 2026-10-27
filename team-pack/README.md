# team-sdlc-pack — MLD (Megalodon)

Team Orchestrator pack for MTM 2026, Codex provider, MTM Player protocol 4.

## Install

```powershell
pwsh -NoProfile -File .\install.ps1 -TeamWorkspace "D:\mtm\MLD"
node .\scripts\check-distribution.mjs --team-workspace "D:\mtm\MLD"
```

The checker must print `"status":"READY"`. Reinstall after every change; never reinstall while a match runs in that
workspace. Then open MTM Player `/manage`, enter the workspace and click **Load team pack**.

## Layout after install

```
<TeamWorkspace>/
  .mtm/team-runtime.json, team-pack-info.json   registrations read by MTM Player
  .codex/agents/*.toml                         team_orchestrator, team_repo_scout, team_feature_worker, team_quality_checker
  .codex/config.toml                           mtm_helper MCP server (absolute path)
  .agents/skills/                              game-preparation, team-orchestrator, team-recovery
  matches/<matchId>/<folder>/                  checkout (checkoutRoot) and matchRoot
  team-sdlc-pack/runtime/                      installed payload (do not edit)
  team-sdlc-pack/logs/<matchId>.progress.ndjson
```

## MCP Helper tools (`mtm_helper`)

`configure_session`, `login_match`, `refresh_match`, `get_backlog_item`, `wait_for_update`, `start_work`,
`submit_work`, `report_progress`, `company_tools_list`, `company_tool_call`. Credentials stay in helper memory.
Submission state (idempotency keys, receipts) is kept in `<checkoutRoot>/.git/mtm/` so a restarted session never
submits twice.

See `docs/README.md` for design notes.
