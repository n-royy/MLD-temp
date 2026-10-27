# Practice match CTG2YCRL (team MLD) — 26-Oct-2026 23:21 → 27-Oct 00:24

Third run of the same Solova exam, pack 1.2.0. Credentials are masked in every file here.

| Folder | Content |
|---|---|
| `logs/` | Progress log (team events), Player match-status polls, preparation receipt, dashboard snapshot |
| `backlog/` | Start Work responses, MVS, submit schemas per item; `submissions.json` (receipts) |
| `transcripts/` | `codex-session.jsonl` (orchestrator), `codex-guardian.jsonl` (the single approval review), Player transcript |
| `code/` | Git bundle, final folder zip, commit list, full diff vs seed `e1447ca` |

## Outcome (local view)
- Submitted 3/5: BUG-02, BUG-01, TASK-02, all `DONE`, schema-valid, existing tests green after the agent restored
  the documented RESTRICT rule with a new migration.
- At 23:42:16 the Codex account (ChatGPT Plus) hit its usage limit; every later turn failed instantly. CR-01 was
  started but not worked; TASK-01 never discovered. Player kept resending RESUME_GAME every 10 minutes until FINISHED.
- Guardian reviews: 1 (round 2: 110). Helper calls: 38. Main-session tokens until the failure: 8.6M input.
- Helper bug found: DISCOVERED missing for wave 1 when `configure_session` (START_GAME) came after `refresh_match`;
  fixed in pack 1.2.1.

Analysis and comparison with earlier rounds: `../ITERATIONS.md`.
