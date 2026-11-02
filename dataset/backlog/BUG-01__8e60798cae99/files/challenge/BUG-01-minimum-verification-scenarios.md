# BUG-01 minimum verification scenarios

Grading measures the layout, not only the screenshots: each case is scored from the layout report written by the provided script, and a case scores only when it is reported PASS with its evidence.

## Files provided with this item

| File | Use |
|---|---|
| `BUG-01-submit.json` | Submission template, copy to `answers/BUG-01/submit.json` |
| `BUG-01-submit.schema.json` | JSON Schema that `submit.json` must satisfy |
| `BUG-01-layout-check.mjs` | Signs in, opens Dashboard, Accounting and Boards at 1440×900, 1024×768 and 390×844, and writes the layout report |

## Running the layout check

From the `src/` folder, with the app running and signed-in credentials in `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults: the seed values):

```text
node <path>/BUG-01-layout-check.mjs http://localhost:3000 development ../answers/BUG-01/evidence/layout-report-dev.json
node <path>/BUG-01-layout-check.mjs http://localhost:3000 production  ../answers/BUG-01/evidence/layout-report-prod.json
```

Run the second command against the production server (`pnpm build`, then `pnpm start`). The script uses Playwright's Chromium if installed (`pnpm exec playwright install chromium`), otherwise the installed Edge or Chrome. Do not edit the reports.

## BUG-01-TC-01 – desktop layout (development)

Precondition: signed in; `pnpm dev` running; Dashboard statistics present.

1. Run the layout check in `development` mode.
2. Open Dashboard at 1440 px and take a screenshot.

Expected, for Dashboard, Accounting and Boards at 1440 px and at 1024 px: the sidebar is visible, and the main content and the top bar both start at or right of the sidebar's right edge and use the space beside it.

Required evidence: `layout-report-dev.json`, `tc-01-desktop-dashboard.png`.

## BUG-01-TC-02 – desktop layout (production)

Precondition: signed in; production build running (`pnpm build`, `pnpm start`).

1. Run the layout check in `production` mode.
2. Open Accounting at 1024 px and take a screenshot.

Expected: the same conditions as TC-01, measured on the production build.

Required evidence: `layout-report-prod.json`, `tc-02-production-layout.png`.

## BUG-01-TC-03 – mobile layout

Precondition: as TC-01.

1. Use `layout-report-dev.json` from TC-01 (it includes 390×844).
2. Open Dashboard and Accounting at 390 px wide and take screenshots.

Expected, for Dashboard, Accounting and Boards at 390 px: no desktop sidebar is shown, the mobile navigation is visible, and the main content uses the full width.

Required evidence: `layout-report-dev.json`, `tc-03-mobile-dashboard.png`, `tc-03-mobile-accounting.png`.
