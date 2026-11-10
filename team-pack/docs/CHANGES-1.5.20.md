# team-pack 1.5.20: slot installs in preparation (on top of 1.5.19 = 1.5.12)

Only the preparation guidance changed (game-preparation SKILL.md, ENVIRONMENT.md, team-repo-scout.toml); the
helper, the orchestrator and worker skills are 1.5.12's.

## Why
Slot installs started late in preparation: clone, main install, build, slot worktrees with env files, the
orchestrator's follow-up, and only then the installs. When preparation was short they ran into the game
(UA9QF7DU / SC0E8AV2: slots installing until game minute 4 to 20; git calls, test runs and the PI slowed down).

## Changes
1. `prepare_slots` (count 5, worktrees only) right after the clone (new step 3b); the second call after the scout's
   reply only copies the env files (step 5).
2. The scout gets the slot paths in its first task and starts `install-s1`..`install-s5` in the same `start_jobs`
   as the build and the database job, right after the main install. s4/s5 keep 1.5.12's wait for s1-s3.
3. Before READY the orchestrator waits once, at most 4 minutes, for the slot installs (step 7b); a failed install is
   restarted; one still running does not hold READY longer (named in the summary, the worker waits in the game).
4. Part B now starts only the baseline run (and per-slot databases when the README needs them, after the env files
   are copied).

Earlier history (1.5.12 notes, the 1.5.19 rollback) is in git.
