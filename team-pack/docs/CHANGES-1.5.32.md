# team-pack 1.5.32: not tied to one stack

On top of 1.5.31 (PR #24, merged before this change was pushed).

- The checklist box "Grader run on your source" and playbook `hidden-tests` say "a test case in the project's own
  test runner (the one the existing tests and the MVS use)" instead of "vitest"; the MVS test is `<ID>-mvs.*`.
- WORKER.md: tests in the project's own runner and language; data fixtures loaded at run time (TS/JS `fs` +
  `JSON.parse`, Python `json.load`), never a static import of a data file the build/type config does not include.
- Playbook `suite-spec`: volume sizing searches stack-neutral names (`page_size`, `batch_size`, `limit`, `offset`,
  `max_rows`, slices).
- Helper: the test-file pattern also covers Go (`_test.go`), Python `_test.py`, Kotlin/PHP `*Test`, Ruby `_spec.rb`
  (used by the scratch, local-file and typing gates).
