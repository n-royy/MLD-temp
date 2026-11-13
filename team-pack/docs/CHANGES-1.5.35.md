# team-pack 1.5.35: investigation PIs without tests of our own

PIs are ranked by submission time. For an investigation PI (figures from the logs, usually a fix) the figures come
from our script over all the data and the fix is judged by the organizer's hidden tests: no test file of ours earns a
point there. So the fast-lane agents now spend that time on reading:

- INCIDENT.md (`piKind: investigation`): read the brief, the rules and the code thoroughly; write `plan.md` as the
  list of every task (each field with its definition, the repro script, the fix) before computing; values from the
  script; check them against the list by reading; the fix goes straight to the root cause, re-read once against the
  rule, committed - no new test, no test run, never touching an existing test; the answer carries no test evidence.
- `team_incident_worker` instructions say the same.
- Unchanged: `piKind: fix` PIs and short TASKs keep their tests - there the MVS rows (PASS with their test log), the
  team test suite and its detection of broken versions are what is graded (8COFCHVS PI-23: 21 of 75 points, PI-24:
  23 of 70).
