# Product notes: Solova (project manager + CRM + accounting)

Read only when the match README or brief names Solova. Knowledge about the product, not answers to any item.

## Layout and commands (app root is `<matchRoot>/src`)
- Next.js 15 App Router, React 19, TypeScript, tRPC 11 (`src/server/api/routers/*`), Prisma 6 (`prisma/schema/*.prisma`),
  Auth.js v5 beta, Tailwind CSS 4, Zod 3, Vitest 3, Playwright (devDependency).
- `packageManager` pins pnpm 11.9.0 (corepack follows it). Commands: `pnpm install --frozen-lockfile`, `pnpm run build`,
  `pnpm test`, `pnpm typecheck`, `pnpm prisma migrate deploy`, `pnpm db:seed`; `env-require/doctor.ps1` must say READY.
- Set `PRISMA_HIDE_UPDATE_MESSAGE=1`; never upgrade Prisma because of its "Update available" notice.

## Database
- PostgreSQL 16 on 127.0.0.1:5433, role `freelanceos` with CREATEDB (password in `<teamWorkspace>/.mtm-local/`).
- **One database pair per match.** In `src/.env` set `DATABASE_URL` to `.../freelanceos_<matchId lowercase>` and
  `TEST_DATABASE_URL` to `.../freelanceos_<matchId lowercase>_test` (keep host 127.0.0.1, port 5433, the app
  password). `pnpm prisma migrate deploy` creates the database when it is missing. Reusing `freelanceos` from an
  earlier match keeps that match's migrations (practice FWBI6I0S: the cascade test "passed" at baseline only because
  the previous match's RESTRICT migration was still applied; the seed itself was unchanged).
- Tests empty the test database before each case: every working copy needs its own `TEST_DATABASE_URL` name.
- The accounting ledger is append-only (triggers); tests clear it with `SET session_replication_role = replica`.

## Domain rules seen so far
- Money is stored as integer minor units. The number of minor units depends on the currency (USD 2 decimals,
  VND and JPY 0). Each client has its own currency, which can differ from the workspace currency.
- Accounting standards for files and money formats are in the Company Tool `kb_search`; official QA data per item
  in `get_test_data`.
- Deletion rules: `DECISIONS.md` ("Invoices/payments use RESTRICT - deleting a company with financial docs fails
  loudly instead of destroying history") and `BUILD_REPORT.md` ("invoice RESTRICT" test green) document the intended
  behaviour. A later migration, `prisma/schema/migrations/20260702093140_company_delete_cascades_financials`, switched
  invoices, payments and expenses to `ON DELETE CASCADE`, so `tests/cascade.test.ts` ("deleting a company with
  invoices is RESTRICTED") fails at baseline. The test matches the design; the code drifted. Resolve it per the
  "Baseline failures" procedure (a new migration restoring the documented rule for those foreign keys, never by
  editing the old migration or the test), then re-run the suite. Check the migration folder, not only the test
  result: if `..._company_delete_cascades_financials` is present and no later migration restores RESTRICT, the
  defect is in this seed even when a stale local database makes the test pass.
- Kanban card positions are sparse numbers stored as strings and computed by position helpers; read the helpers and
  the move service instead of assuming.

## UI
- Tailwind 4 is configured in CSS (`src/styles/globals.css`, `@theme`, `@custom-variant`). A class such as
  `md:ms-sidebar` generates no CSS unless the token exists; check the built CSS in `.next/static` when a layout
  change "does nothing".
- The dev server uses port 3000; production is `pnpm build` then `pnpm start`. Before starting either, check the
  port is free (`Get-NetTCPConnection -LocalPort 3000`) and stop servers you started when the item is done.
- Layout checks (the costliest item in both practice runs): the shared admin layout is `src/app/(app)/layout.tsx` +
  `src/components/layout/topbar.tsx`; the sidebar is 240px (`w-60`). Verify geometry once per environment with one
  Playwright script that measures `main`/top bar bounding boxes at 1024, 1440 and 390px and saves the screenshots
  the brief asks for, instead of repeated manual screenshots.
