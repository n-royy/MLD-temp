# team-pack 1.5.31: the grader's own run on our source, type-safe test fixtures, no stray blockers

On top of 1.5.30. Driven by 60IU23EZ (989/1000): CR-07 `hidden-fixture` 0/11 - the same `TypeError: Cannot read
properties of undefined (reading 'get')` as in 39PSWT5C - and a `POST_INTEGRATION_TEST_TYPING` blocker left open
after the last submission.

## 1. The grader's own run on our source (CR-07 hidden-fixture)
- Checklist: a sentence saying the grader loads/posts/runs/audits something with the submitted source ("The grader
  loads the official test data with the source of your submission itself, posts the schedule there, and audits it
  there") becomes a box "Grader run on your source".
- Playbook `hidden-tests`: that run is ONE committed vitest case, written from the start as the script that produces
  the official figures (no second script): fresh test database, data through our own handlers, every step in the
  brief's order, then the graded handler; it passes before DONE and outranks screenshots. Read data as the existing
  handlers of the same kind do (base tables, their helpers), not internal views or loaded-budget state. Both failing
  CR-07 submissions read the `v_transactions` view; the passing one (45CVHIIC) read the base tables.
- `playbooksFor`: `hidden-tests` only when hidden/organizer tests, official test data or such a grader run is
  announced (no longer for every knowledge-base lookup), never for a PI.

## 2. Type-safe test fixtures
- `integrate_item` refuses `TEST_TYPECHECK_RISK`: a committed test that imports a JSON file its nearest tsconfig
  does not include (60IU23EZ BUG-11 `import fixture from './bug-11-fixture.json'`; loot-core includes only
  mockData.json). Static check, no `tsc` run. WORKER.md: read JSON fixtures with `fs.readFileSync` + `JSON.parse`.

## 3. Blockers
- `BLOCKER_OPENED` only for something that stops an open item now; findings after the last submission go into the
  final summary; a blocker whose item is submitted is resolved at once (SKILL.md, orchestrator agent).

## Cost
No effect on PIs. One extra committed test on items with a grader run (about 1-3 minutes, replacing the separate
official-data script); no extra build or type check.

## Tests
- `checklist.test`: the grader-run box; `playbooksFor` for CR-07, PI and a KB-only BUG.
- `lane.test`: `TEST_TYPECHECK_RISK` refused; the same test reading the fixture with `fs` passes.
