# team-pack 1.5.33: a third fast lane (s7, agent PC)

Harder match rhythm (afternoon set): wave 1 brings a PI with a deadline, wave 2 six minutes later two more PIs with
deadlines (and two deadline items) while the first PI may still be open. With two fast lanes the third PI waited for
a lane or took a worker slot the deadline items needed.

- Seven slots: s1-s4 workers (W1-W4, `team_feature_worker`), **s5, s6, s7 the fast lane** (PA, PB, PC,
  `team_incident_worker`): PIs first, short TASKs while no PI is open (`FAST_LANE_SHORT_ONLY` for long items).
- Helper: slot names s1-s7, `prepare_slots` count up to 7, PIs start in s5-s7 first, `piAgents` lists the three lanes;
  tool schemas accept s7.
- Preparation: seven worktrees, `install-s1` .. `install-s7` one at a time (chain unchanged), all seven before READY;
  the install wait allows one more 280 s call; seven match agents spawned (PA, PB, PC for s5-s7). Recovery spawns
  the same seven.
- Codex thread budget: orchestrator + scout + 7 agents stays under `max_threads = 12`.

## Tests
- `lane.test`: seven slots with three fast lanes; s7 refuses a long item. `deadline.test`: seven slots, roles.
