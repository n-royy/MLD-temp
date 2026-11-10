# team-pack 1.5.25: no installs in the game, PI agents in installed slots, complete PI logs, quality first

On top of 1.5.24. Priority unchanged: **PI first**, then deadline items (least slack), then heavy items, then the rest.

## What went wrong in YH6OAYMZ (1.5.24, stopped at minute 32 with nothing submitted)
| Measured | 1.5.21 (IPZ0U79E) | 1.5.24 (YH6OAYMZ) |
|---|---|---|
| Yarn link step, main install | 1 m 17 s | 2 m 4 s (hard links) |
| Slot install s3 / s4 | 13 m 25 s | 22 m / 34 m, into the game until 14:59 |
| Preparation | ~17.5 min | ~19 min |
| start_work (slot checkout) | seconds | 2-3 min, timeouts, orphaned `index.lock` |
| `git commit` (CR-07) | seconds | 3 min |

- The disk was saturated during the game: slot installs, the full baseline test run (34 min), builds, a PI agent
  installing dependencies in its PI slot. Every git call took minutes; s2's checkout timed out and left
  `index.lock`, so BUG-11 was started four times (`BLOCKER_OPENED S2_GIT_CHECKOUT_TIMEOUT`). CR-07 (deadline 20)
  was finished but could not be integrated in time.
- PI-02 asked for "Then fix the fault in the application source": the PI slot had no dependencies.
- The log search returns the newest 20 entries and a total, without paging; the helper collected 20 of 755
  rule-engine entries and the PI agent made ~600 calls by hand.

## Changes
1. **Preparation**: no Yarn hard-link options; the six slot installs run **one at a time** beside the build and
   READY waits for **all six** (a failed one is restarted once). The baseline test run starts after the installs and
   the orchestrator stops it at game start (`stop_jobs`, new helper tool).
2. **Six slots**: s1-s4 for W1-W4, s5/s6 for the PI agents PA/PB. A PI starts in a free PI-agent slot first, else in
   any free slot; with every slot busy it starts by itself in the first slot that frees (`NEW_PI` again). While no
   PI is open the PI agents take items in their own slot (deadline, then heavy, then the rest). Every slot is
   installed, so a PI fix can be built and tested.
3. **Slot sync before Start Work**: the helper resets the slot's tree first (stale `index.lock` older than 90 s
   removed, 5-minute checkout, one retry) and sends Start Work only when that worked: no item is started on Game
   Master without a slot any more.
4. **Complete PI logs**: a capped search without paging is swept with time prefixes (days walked back from the newest
   entry until the totals add up, crowded days split into hours, ten minutes, minutes; verified per prefix).
   Services the brief or the rules name are collected first and in full; the services the tool lists come from its
   description. Budget 600 calls / 4 minutes.
5. **NEW_PI in two phases**: reported as soon as the rules are in (`logsComplete: false`); the PI agent reads the
   brief, rules and code meanwhile and waits for the logs with `wait_incident_data` (new helper tool, works without
   a key).
6. **Quality first** (tokens do not matter): PI agents reason `high`, workers `medium` (heavy workers stay `high`).
   INCIDENT.md: every field by script, a second independent check, and the fix reproduced with a test, made at the
   root cause and verified before the answer. WORKER.md: "Definition of done" (every defect at its root cause in
   every place, every criterion ticked, rows, hidden-test boundaries, regressions, self-review); no fixed limit on
   fix/test rounds while time remains.

## Tests
New: the time sweep of a capped search (129 entries, complete, under 200 calls), phase 1 before the logs, a PI with
every slot busy starting by itself when a slot frees, `stop_jobs`. Updated for six slots.
