# CR-03 minimum verification scenarios

Evidence goes in `answers/CR-03/evidence/` with the exact names below. Cases TC-02 and TC-03 are also provided as an executable test file, `CR-03-mvs.test.ts`. Grading replays this same file against your submitted source: those cases score only when you report them PASS with their evidence **and** the replay passes. Hidden tests then check further inputs.

## Running the logic scenarios

1. Copy `CR-03-mvs.test.ts` to `src/tests/cr-03-mvs.test.ts` (do not change it).
2. From `src/`: `pnpm vitest run tests/cr-03-mvs.test.ts > ../answers/CR-03/evidence/mvs-tests.log 2>&1`

## CR-03-TC-01 – contact card links

Precondition: signed in; a company with one contact whose phone is `(028) 3823 4567`, mobile `0912.345.678`, WhatsApp `+84 912 345 678 ext 9` and Telegram `@solova_sales`.

1. Open the company and its contacts, and hover each quick link.

Expected: phone and mobile open `tel:` links in international form, Telegram opens the user's link, and the invalid WhatsApp value is shown as text without a link.

Evidence: `tc-01-contact-links.png` (desktop screenshot, at least 1280 px wide, landscape, showing the card).

## CR-03-TC-02 – phone and WhatsApp links

Data and expected:

| Input | Function | Expected |
|---|---|---|
| `0987 654 321` | `whatsappUrl` | `https://wa.me/84987654321` |
| `0987 654 321` | `phoneUrl` | `tel:+84987654321` |
| `+44 (20) 7946-0018` | `whatsappUrl` | `https://wa.me/442079460018` |
| `0987-654-321 x2` | `whatsappUrl`, `phoneUrl` | `null` |

Evidence: `mvs-tests.log`.

## CR-03-TC-03 – Telegram links

| Input | Expected |
|---|---|
| `@sales_team` | `https://t.me/sales_team` |
| `t.me/SalesTeam/` | `https://t.me/SalesTeam` |
| `@abc` | `null` |

Evidence: `mvs-tests.log`.

## CR-03-TC-04 – automated tests and type check

1. From the `src/` folder run `node <path>/CR-03-run-checks.mjs ../answers/CR-03/evidence`.

Expected: `pnpm test` exits 0 with more than the 12 existing tests passing (your new tests included), and `pnpm typecheck` exits 0. Grading does not read these logs: the grader runs the tests itself on your submitted revision (with the original test configuration restored) and needs at least 13 passing tests and none failing.

Evidence: `test.log`, `typecheck.log` (written by the script, unedited).
