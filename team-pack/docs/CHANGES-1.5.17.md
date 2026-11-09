# team-pack 1.5.17: SC0E8AV2 fixes (deadline items, PI data, TASK-08/TASK-07 method)

SC0E8AV2 (1.5.16): 731 points (HUB 522). PI-02 first but 76/120, PI-03 second 90/100, CR-07 not submitted,
TASK-08 80/100, TASK-07 35/50, BUG-09 submitted 34 s before the end (pending).

## What went wrong
| Item | Cause (helper timeline + Codex rollouts) |
|---|---|
| CR-07 (deadline 20) | `wait_for_update` held the wave-2 news 2.3 min waiting for PI-02's data; three `start_work` in one cell took 7.5 min (slot installs s3/s5/s6 starved by the 1.5.16 queue priority until minute 20); its worker started 10 min after reveal, waited for BUG-11's fix (ready at minute 16), had no commit at the deadline: `NOTHING_TO_INTEGRATE` |
| PI-02 | the orchestrator fired 80 and then 720 parallel log searches; 18 RATE_LIMITED; affectedTransactions / mispostedMinor from an incomplete set |
| PI-03 | wave 3 discovered 6 min late (no `wait_for_update` while the orchestrator worked PI-02); HUB first |
| TASK-08 | 10 mutants, all on T/A rules; I, R, S, M, B never mutated; submitted 2 min before the end |
| TASK-07 | started 9 min after reveal (no free slot), 2.5 min of work, manifest predicted by the generator, replay "pending" |

## Changes
Helper:
- `wait_for_update` never holds news for a PI still being collected when a deadline item appeared
  (`MATCH_UPDATED` with `incidentPending`; `NEW_PI` follows). Otherwise it waits at most 20 s (was 90 s, twice).
- Background feed watch every 10 s while the orchestrator is busy: new items are discovered and a new PI's
  collection starts at reveal.
- Company Tools: RATE_LIMITED answers are retried with back-off (1.5, 3, 6, 12 s).
- Safety net: `integrate_item` with `allowUncommitted` commits the worker's uncommitted files itself.
- Heavy job queue: slot installs keep their start order (only the baseline waits behind later jobs).

Orchestrator: one item per cell (`start_work` + spawn), deadline items first; at most 4 Company Tools calls per
cell, `prepare_incident refresh` for gaps; submit a PI only from a complete set.

Worker:
- A deadline item that depends on another item works as if it were fixed: it makes the part of the prerequisite's
  fix its grade needs itself, from the start, and never waits; the cherry-pick is optional.
- Deadline items commit after every passing row.
- SUITE_DETECTION: one mutant for every rule id before any second one; mutate each section as soon as it is written.
- DATA_REQUIREMENTS: the generator writes the manifest from the issued parser's and import's output.

Tests: 26, all passing (new: safety-net commit of uncommitted work, inside the slots test).
