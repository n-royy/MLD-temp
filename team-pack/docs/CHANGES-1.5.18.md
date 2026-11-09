# team-pack 1.5.18: three more cells for the SUITE_DETECTION matrix

Only guidance changed (WORKER.md, quality gate `SUITE_DETECTION`); the helper is the same as 1.5.17.

From an audit of SC0E8AV2's TASK-08 suite (31 cases, every rule id covered, 80/100; the application fixes were
complete), the open cells a broken build could pass through:
- **`or` lists alternatives**: each alternative gets its own case ("a date or recurrence" → a one-off AND a
  recurring schedule).
- **A move or replace is checked on both ends**: the new place has the result AND the old place no longer has it.
- **A rule about "every change" is checked after each kind of change the specification lists** (add, edit, delete,
  import, merge, schedule posting, transfer creation and removal).
