# team-pack 1.5.24: the orchestrator only coordinates; two PI agents; faster preparation

On top of 1.5.23. Priority unchanged: **PI first**, then deadline items (least slack), then heavy items (one at a
time), then the rest.

## Team (fixed for the whole match, spawned in preparation)
| Slot | Agent | Work |
|---|---|---|
| s1-s4 | W1-W4 `team_feature_worker` | items: deadline first, then heavy, then the rest |
| s5, s6 | PA, PB `team_incident_worker` (reasoning **medium**) | ordinary items while no PI is open |
| s7, s8 | PA / PB | PIs only (`PI_SLOT_RESERVED` for anything else; no dependency install) |
| - | orchestrator | coordinates only: never works an item, not even a PI or a short TASK |

- Agents are spawned once during preparation, read their playbooks there (WORKER.md, new INCIDENT.md) and get each
  item by `followup_task`. Codex counts every agent thread, idle ones too (6QYJQAVJ: "agent thread limit reached"
  with 4 sub-agents), so one agent per item is no longer possible. `config/codex.toml`: `[agents] max_threads = 12`
  (orchestrator, guardian, scout, 6 agents, up to 3 `team_heavy_worker` for heavy items in s1-s4).
- **PI**: the helper starts it in s7/s8 and collects all its data as before; `NEW_PI` carries `piAgents` (s5/s6:
  item, minutes left, slack). The orchestrator hands it over in one call: a free PI agent, else it interrupts the PI
  agent whose item has the most slack ("Pause <item>, PI first"); that item stays in its slot and continues after
  the PI. The PI agent answers with `answer_item` (no integrate) and the helper submits the PI within seconds
  (auto-integration now includes PIs, PIs first; tick 2 s instead of 5 s).
- Why not a fresh worker for a PI: 1.5.14 tried it and PI-02 took 20 minutes (data collection queued, a new agent
  reading from scratch, no slot for the next PI). All three causes are gone here.
- `suggestNext`: deadline item → heavy item (only when no other heavy item runs) → chain item (`includedFixes`) →
  most points per effort; `worker` is the agent type, `same`, or `pi_agent` for s5/s6; null for s7/s8.

## Preparation (IPZ0U79E, 1.5.21: ~17.5 minutes from the clone to installed slots)
| Step | Measured |
|---|---|
| clone → main install starts (scout spawn + reading) | 2 m 17 s |
| main install | 1 m 27 s |
| build (beside the slot installs) | 5 m 57 s |
| 5 slot installs at once | 13 m 25 s each (link step 12 m 55 s; alone 1 m 17 s) |

Changes:
1. The scout is spawned right after the clone and starts the main install as its **first** action (package manager
   detected from the lockfile); slots (8 worktrees) and the match team are created while it runs.
2. Yarn Berry installs hard-link packages from one store on the same drive (`YARN_NM_MODE=hardlinks-global`, global
   cache in `<teamWorkspace>\.mtm-cache\yarn`, warm across matches); a failing hard-linked install falls back to the
   classic one.
3. Slot installs run **two at a time** (chains s1→s3→s5, s2→s4→s6) instead of five at once; s7/s8 need none.
4. READY waits (bounded, 240 s) only for s1-s4; s5/s6 may finish in the first game minutes.
Expected: about 8-10 minutes instead of ~17.5 (to be measured in the next match).

## Tests
`deadline`, `incident`, `slots` follow the new slot layout. New: PI slots reserved, a PI never takes an item slot,
`piAgents` on `NEW_PI`, a PI agent's answer auto-submitted (`AUTO_SUBMITTED`), one heavy item at a time.

## Planned
Time budgets per item after measuring a match.
