# MLD harness (MTM 2026)

Private harness of team MLD (Megalodon) for Master the Machine 2026.

**New teammate? Start with [SETUP.md](SETUP.md)** — machine setup, Player, pack install, joining a match,
troubleshooting and the post-match audit routine.

| Path | Content |
|---|---|
| `team-pack/` | `team-sdlc-pack` source: MCP helper, skills, lessons, product notes, installer, checker, mock tests |
| `tools/` | Operator scripts: environment checks, PostgreSQL setup, match watcher, redaction, audit metrics |
| `doc/ITERATIONS.md` | Round-by-round log: results, weaknesses, changes, discussion, next steps |
| `doc/practice-*/` | Per-match data: logs, backlog data, redacted transcripts, code bundle, report |

## Install the pack

```powershell
pwsh -NoProfile -File .\team-pack\install.ps1 -TeamWorkspace "D:\mtm\MLD"
node .\team-pack\scripts\check-distribution.mjs --team-workspace "D:\mtm\MLD"
```

## Tests

```powershell
node --test team-pack/tests/helper.test.mjs
```

Credentials never belong here: the portal password and team API key are entered in MTM Player only, and local
database passwords stay in `D:\mtm\MLD\.mtm-local\`.
