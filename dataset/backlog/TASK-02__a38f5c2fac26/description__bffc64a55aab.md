# Resolve production dependency vulnerabilities

## Context
A production dependency security report identifies high and critical findings in the issued application. Resolve them while keeping the application usable, especially its existing credentials login.

## Expected outcome
No high or critical findings remain in production dependencies. Existing application features still work.

## Requirements
Use the locked dependency graph as the starting point. Limit changes to package.json, pnpm-lock.yaml, pnpm-workspace.yaml, compatibility code required by changed APIs, and existing tests that contradict intended behavior. Do not remove features or required packages, suppress audit findings, disable security checks, or add unrelated dependencies. Development-only moderate findings are outside the mandatory target. No particular package version is mandated.

## Acceptance criteria
1. pnpm install --frozen-lockfile succeeds with the submitted manifests.
2. pnpm audit --prod --audit-level=high reports no high or critical production findings.
3. pnpm typecheck and all existing pnpm test cases pass. Do not weaken, skip or delete existing tests. If an existing test contradicts the application's intended behavior, fix the test and explain why in the engineering record.
4. A valid seeded user can log in, open Dashboard and Accounting, refresh while remaining authenticated, and log out; a signed-out browser cannot access Accounting data.
5. The engineering record lists upgraded packages with old/new versions, transitive dependency handling, compatibility changes, and remaining lower-severity findings with reasons.

## Canonical scope
Production dependencies reachable from the issued lockfile, required API compatibility changes, and the existing login flow.

## Canonical algorithm
Inspect the production audit report, fix the reported high/critical findings, install with the frozen lockfile, run typecheck and existing tests, and replay login and signed-out checks. Submit changes and actual results. This is an implementation task, not an exact-JSON source-analysis question.

## Normalization
Keep machine-produced logs intact. Record installed package versions rather than only manifest ranges. Explain infrastructure failures instead of reporting PASS.

## Ordering
Verification order: frozen installation, production audit, typecheck, tests, authentication smoke checks.

## Answer format
Complete submit.json with changes and evidence. Maximum practice score: 250 points. Functional checks determine points; engineering prose is supporting evidence only.

## Out of scope
Unrelated refactoring and removing lower-severity development-only findings.

## Submission

Create `answers/TASK-02/`, copy `challenge/TASK-02-submit.json` to `answers/TASK-02/submit.json`, and create its `evidence/` child directory. Record actual test results and relative evidence paths. Every PASS result must reference an existing evidence file. Commit source, tests, evidence, and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

`testResults` rows follow the verification order above: `TASK-02-TC-01` frozen installation, `TASK-02-TC-02` production audit, `TASK-02-TC-03` typecheck, `TASK-02-TC-04` existing tests, `TASK-02-TC-05` authentication smoke checks (login, Dashboard, Accounting, refresh, logout, signed-out access).

### Evidence

After your changes, run the provided check runner from the `src/` folder: `node <path>/TASK-02-run-checks.mjs ../answers/TASK-02/evidence`. It runs the first four checks in order and writes `install.log`, `audit.log`, `typecheck.log` and `test.log`. Keep them unedited. Add two screenshots for the authentication smoke checks: `tc-05-login-dashboard.png` (signed in on Dashboard after a refresh) and `tc-05-signed-out.png` (a fresh private window opening `/accounting`).

| Test case | Evidence |
|---|---|
| `TASK-02-TC-01` | `evidence/install.log` |
| `TASK-02-TC-02` | `evidence/audit.log` |
| `TASK-02-TC-03` | `evidence/typecheck.log` |
| `TASK-02-TC-04` | `evidence/test.log` |
| `TASK-02-TC-05` | `evidence/tc-05-login-dashboard.png`, `evidence/tc-05-signed-out.png` |

Grading also reads `src/package.json`, `src/pnpm-lock.yaml`, `src/pnpm-workspace.yaml` and the original test files at the commit you submit.

### submit.json contract

`submit.json` must validate against `challenge/TASK-02-submit.schema.json` (JSON Schema 2020-12), delivered with the submit template. Grading checks this schema first: a file that does not validate scores 0 and no test case is graded.

- Start from the template. It already lists one `testResults` row per test case, in the required order: `TASK-02-TC-01`, `TASK-02-TC-02`, `TASK-02-TC-03`, `TASK-02-TC-04`, `TASK-02-TC-05`. Keep exactly these rows and these field names: `id`, `result`, `evidence`, and optionally `note`. Do not rename, add or remove fields or rows.
- `result` is `PASS`, `FAIL` or `NOT_RUN` (upper case). A `PASS` row lists at least one evidence path.
- Evidence paths are `evidence/<file name>`, for files directly inside `answers/TASK-02/evidence/`.
- Before submitting, set the top-level `status` to `DONE` (all requirements met), `PARTIAL` or `BLOCKED`.

Example row:

```json
{ "id": "TASK-02-TC-01", "result": "PASS", "evidence": ["evidence/<file name>"] }
```