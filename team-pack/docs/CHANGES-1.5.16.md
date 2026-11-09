# team-pack 1.5.16: back to the 1.5.12 flow, with a machine that keeps up

UA9QF7DU (1.5.15) was stopped at minute 33 with one item submitted (BUG-11, minute 28) and 0 points.

## What went wrong in UA9QF7DU (helper timeline and Codex rollouts)
| Time (game min) | What happened |
|---|---|
| 1-4 | `start_work` for the first two items took 31 s + 112 s (git checkout under load); workers spawned at minute 4 |
| 7 | PI-02, CR-07 (deadline 20), BUG-11 (CR-07's prerequisite), TASK-10 revealed |
| 8-13 | one cell of three `start_work` calls took 4 min 9 s; BUG-11's `git checkout` was killed by the timeout ("git checkout failed: " with an empty message) |
| 14-19 | the orchestrator worked PI-02 by hand: ~15 Company Tools searches, then a source fix and a vitest run that hung |
| 17 | installs of s4/s5/s6 finished (the PI's own slot s4 had no dependencies until then); the baseline run FAILED |
| 22-25 | `answer_item` for PI-02: `git commit` killed by the timeout; PI never submitted |
| all | two Next.js servers of an earlier match (JTYYBXTL) still running; two 1 GB `vite build` processes (BUG-09 in s1, CR-07 in s6); each worker test run ~4 minutes |

The orchestration logic was not the main cause: the machine was. Six worktree installs, production builds, the
baseline suite and stale servers competed for one disk, so every git call, test run and build crawled, and the
helper's git timeouts turned slowness into failures.

## Changes
Rollback to the 1.5.12 flow (orchestrator does the PI at once; workers do ordinary and deadline items, deadline
first; a dedicated heavy worker), keeping 4 worker slots:
- Removed 1.5.14/1.5.15 behaviour: `DEADLINE_AT_RISK`, `WRAP_UP` preemption, `phase.json`, the 12-minute gate
  budget, the agent-pool rules and the scout reused as a worker. SKILL.md, the orchestrator and scout agent files
  and the preparation skill are the 1.5.12 text with s6 added.
- Kept: 4 workers (s1-s3, s6), `agents.max_threads = 10`, the s4 guard for items read from an image, the team
  answers index (`teamAnswersFile`), the SUITE_DETECTION steps for issued-source defects and non-ASCII text,
  the effort profile (heavy XL to s5; an L item takes s5 only when it has no deadline).

Machine load (new):
- **Heavy job queue**: installs, builds and full test runs started through `start_jobs` (any slot, any worker)
  queue machine-wide, at most 3 at once (`MTM_HEAVY_JOBS`), first started first served; a worker's build or test
  run goes before waiting slot installs and the baseline. Servers are not queued.
- **Install order**: s1, s2, s4 (the PI's slot), s3, s6, s5, then the baseline; no wait loops in commands.
- **Stale processes**: preparation stops processes left by earlier matches (only under `<teamWorkspace>\matches\`).
- **Git**: a timeout says so and is retried once with twice the time; a lock left by a killed git is removed when
  it is 60 s old; helper commits use `--no-verify`; checkout gets 5 minutes; the repository gets
  `core.untrackedCache`, `core.fscache`, `core.preloadIndex`, `gc.auto 0`.
- Workers run the narrowest proof (touched test files, dev server unless the evidence needs a build).

Deadline items that depend on another item (new): the prerequisite's worker commits its fix first, alone, and
writes the sha to `FIX_COMMIT`; `wait_for_update` returns `PREREQ_FIX_READY`; the orchestrator tells the dependent
worker to cherry-pick it. The dependent never waits for the prerequisite's submission, and `integrate_item` skips a
commit already on the branch (`git cherry`), so the two items integrate in either order.

PI: values first; no source change, build or test suite before the fields are computed, unless the grading scores
a code change.

SUITE_DETECTION (TASK-08 kind): every quantifier of a rule (`either`, `any number`, `however`, `at most`,
`otherwise`...) is a matrix dimension with one case per value; mutants are applied by a script (30+, one job, only
the survivors printed); the suite is run 3 times on HEAD so a correct build never fails.

Tests: 26 (new: prerequisite fix by cherry-pick and integration in either order; heavy job queue order; no
preemption events).
