# team-pack 1.5.30: a small worker core and playbooks by item kind; a verification budget

39PSWT5C: BAN used about 13 credits per submitted item, MLD about 20, and MLD ran out of tokens after 8 items. Every
agent carried WORKER.md (45 KB) and LESSONS.md (12.6 KB) in its context for the whole match, re-sent on every model
turn, and items spent minutes on verification that earned nothing.

## 1. Worker core + playbooks
- `WORKER.md` is now a ~10 KB core (inputs, always submittable, checklist, how to work, rules, Company Tools, speed).
- Everything specific to a kind of item moved to `skills/team-orchestrator/playbooks/`: `ui-evidence`,
  `hidden-tests`, `other-items` (another item's fix, blocking defects, baseline failures), `suite-spec`,
  `data-values`, `image`, `heavy` (each 1-3 KB).
- The helper puts `playbooks: [...]` in every brief and in the `start_work` result (`playbooksFor` in
  `src/checklist.mjs`: UI evidence, hidden tests or official data, other item keys named, quality gate kind, values or
  reports, input images, heavy). A worker reads the core once and only its item's playbooks.
- `LESSONS.md` is no longer read by any agent (orchestrator, workers, fast lane): its rules live in the helper, the
  core and the playbooks; it stays as the maintainers' history.
- Agents (`team_feature_worker`, `team_incident_worker`) and the orchestrator's preparation and item messages updated
  (`Playbooks: <...>` in the item message).

## 2. Verification budget
- The existing tests of the changed modules once at the end; the whole suite only when a criterion demands it,
  once, as a background job, never twice and never while code still changes.
- No self-invented mutants, extra viewports, pages or scripts; mutants only one per `Spec` box (suite items).
- No quality-gate report file any more (`qualityGate.reportFile` removed): DONE.json `qualityGate` is the record.

## Tests
- `checklist.test`: `playbooksFor` per item kind; `incident.test`: the brief carries `playbooks`.
