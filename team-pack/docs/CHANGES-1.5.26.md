# team-pack 1.5.26: the brief as a checklist; the orchestrator skill as general principles

On top of 1.5.25. Driven by the contest rules: each item is submitted once, graded per criterion, and a non-PI item
earns nothing for being early, so a submission must meet every criterion.

## 1. The brief as a checklist
- `start_work` now also writes `<slotMatchRoot>/.mtm-tmp/<ID>/checklist.md` (new `src/checklist.mjs`), built only
  from the organizer's text, for any kind of item:
  - every ask of the description (list items and asking sentences; context and out-of-scope are not boxes, out of
    scope is noted);
  - every answer row (`<ID>-TC-nn`) with its scenario's expected result and required evidence;
  - every answer field with its schema type and description, plus the engineering/incident record;
  - every required evidence file;
  - every sentence about how it is graded (hidden tests, replays, official data, exact comparison, schema first);
  - the test files the organizer provides (run unchanged);
  - a final box (all ticked, diff reviewed, validator valid, honest status).
- Workers, heavy workers and PI agents tick each box with its proof (WORKER.md "The checklist is your definition of
  done", INCIDENT.md step 6). A replay keeps the ticks.
- The helper submits by itself only a DONE whose checklist has no open box; otherwise `SLOT_DONE` carries
  `checklistOpen` and the orchestrator sends exactly those boxes back while more than ~6 minutes remain.
- `start_work`, `NEW_PI` and the brief carry `checklistFile`.

## 2. The orchestrator skill rewritten as general principles
`skills/team-orchestrator/SKILL.md`: 340 → ~180 lines. Seven principles (right first, priority, no idle slot, never
work an item, small context, self-healing, lessons), the team, start, assigning work, one table for every
`wait_for_update` reason, finished items, PI, safety net, frames. Match-specific stories moved to LESSONS.md;
every tool, message and error code of the previous version kept.

## Tests
New `tests/checklist.test.mjs`; the auto-submit tests tick the checklist first and check that open boxes are
reported (`checklistOpen`) instead of submitted.
