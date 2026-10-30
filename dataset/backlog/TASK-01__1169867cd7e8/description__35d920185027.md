# Trace a card position after reordering

## Context
Understand the existing board ordering behavior from the issued source. In an initially empty list on a board, a user creates cards A, B, C sequentially using the normal Create card action. They then drag C between A and B.

## Canonical scope
Use the issued source at commit 571c531681e672241f18842025c905e499a3641d. Follow normal card creation and the same-list drag-and-drop flow. Exclude templates, imported cards, concurrent changes, and previously existing cards.

## Canonical algorithm
Determine the positions assigned by normal creation in the given order. Follow the move operation with A immediately before C and B immediately after C. Apply any rebalance rule that this source would trigger. Report C's final persisted database position.

## Normalization
The answer is one unsigned decimal integer string, without whitespace, separators, units, or explanatory prose. Do not return a JSON number.

## Ordering
The initial visible order is A, B, C; the final visible order is A, C, B. There is only one answer field.

## Answer format
Set the position field in submit.json to the required string. Maximum practice score: 100 points. The answer is compared by exact string equality; no AI judgment is used.

## Submission

Create `answers/TASK-01/`, copy `challenge/TASK-01-submit.json` to `answers/TASK-01/submit.json`, and create its `evidence/` child directory. Record actual test results and relative evidence paths. Every PASS result must reference an existing evidence file. Commit source, tests, evidence, and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/TASK-01-submit.schema.json` (JSON Schema 2020-12), delivered with the submit template. Grading checks this schema first: a file that does not validate scores 0.

- Keep exactly the template fields: `schemaVersion`, `backlogId`, `status`, `evidenceFiles`, `position`. Do not add or rename fields.
- `position` is a JSON string of digits only, for example `"123"`, not a JSON number.
- Evidence paths are `evidence/<file name>`, for files directly inside `answers/TASK-01/evidence/`.
- Before submitting, set the top-level `status` to `DONE`, `PARTIAL` or `BLOCKED`.