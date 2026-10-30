# Desktop sidebar obscures the main content

## Context
After login, the left sidebar overlaps content on Dashboard and other administration pages on desktop. Statistics, charts, or tables at the left edge cannot be read. The small-screen mobile interface remains usable.

## Expected outcome
On desktop, the main content and top bar sit beside the sidebar and remain fully readable.

## Requirements
Fix the shared administration layout in both development and production. Preserve mobile navigation and existing page controls. Maximum practice score: 200 points.

Desktop wireframe:

```text
| Sidebar | Top bar                         |
| Sidebar | Dashboard / administration page |
| Sidebar | Cards, charts, tables           |
```

## Acceptance criteria
1. The sidebar does not cover main content or the top bar on any administration page at desktop widths, including 1024px and 1440px.
2. The result holds with pnpm dev and the production pnpm build / pnpm start flow.
3. At 390px viewport width, mobile navigation and content remain usable without a new overlapping desktop sidebar.
4. Existing pnpm test cases and pnpm typecheck pass.

## Out of scope
Redesigning the navigation, replacing charts, or unrelated refactoring.

## Submission

Create `answers/BUG-01/`, copy `challenge/BUG-01-submit.json` to `answers/BUG-01/submit.json`, and create its `evidence/` child directory. Capture screenshot of Dashboard before fixing as dashboard_before_fixing.png and commit to `evidence/` folder. Record actual test results and relative evidence paths. Every PASS result must reference an existing evidence file. Commit source, tests, evidence, and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/BUG-01-submit.schema.json` (JSON Schema 2020-12), delivered with the submit template. Grading checks this schema first: a file that does not validate scores 0 and no test case is graded.

- Start from the template. It already lists one `testResults` row per test case, in the required order: `BUG-01-TC-01`, `BUG-01-TC-02`, `BUG-01-TC-03`. Keep exactly these rows and these field names: `id`, `result`, `evidence`, and optionally `note`. Do not rename, add or remove fields or rows.
- `result` is `PASS`, `FAIL` or `NOT_RUN` (upper case). A `PASS` row lists at least one evidence path.
- Evidence paths are `evidence/<file name>`, for files directly inside `answers/BUG-01/evidence/`.
- Before submitting, set the top-level `status` to `DONE` (all requirements met), `PARTIAL` or `BLOCKED`.

Example row:

```json
{ "id": "BUG-01-TC-01", "result": "PASS", "evidence": ["evidence/<file name>"] }
```

Complete the engineering record with observed/expected behavior, diagnosis, affected files, changes, and verification. Its prose supports review; functional behavior determines points.