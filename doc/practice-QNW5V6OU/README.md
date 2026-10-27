# Practice match QNW5V6OU (team MLD) — 26-Oct-2026, 18:12–19:17

Credentials (portal password, team API key) are masked in every file here.

| Folder | Content | Source |
|---|---|---|
| `logs/` | `QNW5V6OU.progress.ndjson` (101 team events), Player match-status polls, preparation receipt, `QNW5V6OU.dashboard.html` snapshot | `D:\mtm\MLD\team-sdlc-pack\logs` |
| `backlog/` | Per item: `<ID>.start.json` (Start Work response: instruction, submit template, files), `<ID>.mvs.json` (MVS), `<ID>/files/`; `submissions.json` (idempotency keys, receipts) | `<checkout>\.git\mtm` |
| `transcripts/` | `codex-session.jsonl`: full Codex rollout (reasoning, commands, tool calls incl. briefs and Company Tools answers, token counts); `player-transcript.ndjson`: Player's transcript | `%USERPROFILE%\.codex\sessions`, `%LOCALAPPDATA%\MTM PLAYER` |
| `code/` | `mtm-mld.bundle` (full repo history, `git clone mtm-mld.bundle`), `QNW5V6OU-final.zip` (final folder incl. answers/evidence), `commits.txt`, `full-diff.patch` (all team changes vs seed) | team repo |

## Outcome (local view)
- Submitted 5/5 revealed items, all receipts ACCEPTED: BUG-02, BUG-01, CR-01, TASK-02, TASK-01. Score status was PENDING at submit time; grader verdicts are only on Game Master (`/match/QNW5V6OU`).
- Blocker logged after submit: in BUG-02 and TASK-02 single evidence paths were written as strings where the template expected arrays (fixed in commit a71419a, but the accepted revisions keep the original answer).
- Codex usage: 22.81M input tokens (22.66M cached), 38k output, 3.2k reasoning.
