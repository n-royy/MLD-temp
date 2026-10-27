# tools/

Operator scripts used around a match. None of them touches the running agent or the checkout.

| Script | Use |
|---|---|
| `check-tools.ps1` | Print versions of git, node, pnpm, python, dotnet, java, mvn, psql from a fresh PATH |
| `codex-account.mjs <auth.json>` | Show which Codex account/plan is logged in (never prints tokens) |
| `install-postgres.ps1 -TeamWorkspace <ws>` | Install PostgreSQL 16 on port 5433 with generated local passwords in `<ws>\.mtm-local\` |
| `db-setup.ps1 -TeamWorkspace <ws> -SqlFile <db-setup.sql>` | Create the exam's role/database with the exam's SQL; writes `.mtm-local\README.md` |
| `verify-pack.mjs <player app dir> <ws>` | Run MTM Player's own installed-pack verification (`VERIFIED` expected) |
| `watch-match.mjs <progress.ndjson> [resume]` | Print preparation stages, items, test results, blockers and Player state while a match runs |
| `redact.py <src> <dst>` | Copy a transcript/log with passwords, API keys and DB URLs masked |
| `check-submitted.mjs <checkoutRoot> <folder> <schema.mjs>` | Validate every submitted answer (at its submitted revision) against its submit schema |
| `item-metrics.py <codex rollout> '<windows json>'` | Tokens per phase/item plus helper-call and failed-command counts |
| `analyze_session.py <codex rollout>` | Timeline: helper calls, errors, gaps, agent messages, turn ends |
| `waves.py <codex rollout>` | When new backlog items were first seen |

Python scripts expect `python -I -X utf8`. Paths on Windows: pass forward-slash or quoted backslash paths.
