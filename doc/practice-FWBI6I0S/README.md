# Practice match FWBI6I0S (team MLD) — 27-Oct-2026 09:51 → 10:59

Fourth run of the same Solova seed (identical to CTG2YCRL's), pack 1.2.1, Player 0.9.35. Credentials are masked.

| Folder | Content |
|---|---|
| `logs/` | Progress log, Player match-status polls, preparation receipt, dashboard snapshot |
| `backlog/` | Start Work responses, MVS, submit schemas; `submissions.json` (receipts) |
| `transcripts/` | `codex-session.jsonl` (orchestrator; no guardian session existed), Player transcript |
| `code/` | Git bundle, final folder zip, commit list, full diff vs seed `94d92ae` |

## Outcome (local view)
- 5/5 submitted and ACCEPTED: BUG-02, BUG-01, CR-01, TASK-02 `DONE`; TASK-01 `PARTIAL` (referenced commit unavailable).
- 0 guardian reviews, 0 failed model turns, 16.6M input tokens for the whole 62-minute session.
- Caveat: baseline tests passed only because the shared local database still carried the RESTRICT migration from
  CTG2YCRL; the committed code has no such migration, so the grader's fresh database will fail the cascade test.
  Fixed for later rounds by per-match databases (pack 1.2.2). See `../ITERATIONS.md`, round 3 → 4.
