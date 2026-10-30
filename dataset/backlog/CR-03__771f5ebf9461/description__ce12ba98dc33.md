# Contact quick links that always work

## Context
Sales staff tap the WhatsApp, Telegram and phone buttons on a contact card to reach clients. Contacts are typed by hand, so numbers come as `0912.345.678`, `+84 912 345 678` or `(028) 3823 4567`, and Telegram as `@name` or a full link. Many buttons open a wrong chat, an empty chat or nothing at all.

## Expected outcome
Every quick link on a contact card works, or is not shown as a link at all, following Solova's standard for contact phone numbers and messenger links in the company's internal systems.

## Requirements
1. Implement the link rules as pure functions in `src/lib/contact-links.ts`:

   ```ts
   export function phoneUrl(value: string | null | undefined): string | null;     // phone and mobile
   export function whatsappUrl(value: string | null | undefined): string | null;
   export function telegramUrl(value: string | null | undefined): string | null;
   ```

   Each returns the full link, or `null` when the value is empty or invalid. Keep this module path and these names: organizer tests call them directly.
2. Normalisation of phone numbers, accepted Telegram forms and the exact link formats are defined by the current company standard. Follow it exactly.
3. The contact card (`src/components/contact/contact-card.tsx`) uses these functions for phone, mobile, WhatsApp and Telegram. When a function returns `null`, the value is shown as plain text without a link.
4. Add automated tests. Existing tests must keep passing; do not weaken, skip or delete them. Put new tests in new files under `src/tests/`. The grader runs the whole test suite and the type check itself on your submitted revision; before it does, it restores the original `vitest.config.ts`, `tsconfig.json`, `tests/global-setup.ts`, `tests/helpers.ts`, `tests/accounting.test.ts`, `tests/heatmap.test.ts` and `tests/move-card.test.ts`, so changes to those files are discarded and reported. `tests/cascade.test.ts` is the only original test you may correct.

Maximum practice score: 100 points.

## Acceptance criteria
1. The three functions follow the company standard for every input shape it describes.
2. The contact card shows working links and no link for invalid values.
3. `pnpm test` (with the new tests) and `pnpm typecheck` pass.

## Grading
About half of the points come from the Minimum Verification Scenarios: the contact card and test logs through your evidence, and the logic cases through a replay of `CR-03-mvs.test.ts` (provided at START) against your submitted source; a case scores only when you report it PASS with evidence and, for logic cases, the replay passes. The rest comes from organizer hidden tests that call the three functions with inputs you have not seen.

## Out of scope
Validating numbers when contacts are saved, Zalo links, changing stored contacts.

## Submission

Create `answers/CR-03/` with `submit.json` (copied from `challenge/CR-03-submit.json`) and an `evidence/` child folder. Follow `CR-03-minimum-verification-scenarios.md`. Every PASS result must reference existing evidence files. Commit source, tests, evidence and the completed submission together. Do not add a gitRevision field; give the pushed commit SHA to Game Master separately.

### submit.json contract

`submit.json` must validate against `challenge/CR-03-submit.schema.json` (JSON Schema 2020-12). Grading checks this schema first: a file that does not validate scores 0 and no test case is graded.

- Keep exactly the template rows `CR-03-TC-01` … `CR-03-TC-04` and the field names `id`, `result`, `evidence`, optionally `note`.
- `result` is `PASS`, `FAIL` or `NOT_RUN`. A `PASS` row lists at least one existing evidence path `evidence/<file name>`.
- Set the top-level `status` to `DONE`, `PARTIAL` or `BLOCKED` before submitting.

The engineering record describes the rules applied and the edge cases handled.