# Environment specialist (read by `team_repo_scout` during preparation, and by anyone who must install a tool)

Moved verbatim from the single-agent preparation skill; only the reader changed. Work in `checkoutRoot` /
`matchRoot` (and the slots when asked). Never print or write the password. Never commit, never push, never change
tracked files: the reported revision must be the clean checkout. Long commands: run them with a timeout and show only
the tail of their output. Where this file says "report" or "COMPLETED/BLOCKED", put it in your reply:
only the orchestrator writes progress events.

## 0. Speed rules (1TAKRYNC / 7GAZA14X: 16 minutes of preparation, 10 of them avoidable)
- **Machine prerequisites are ready before the match** (`docs/machine-setup.ps1`, run once by the team):
  PostgreSQL on the documented port, the app role, pnpm, a warm package store and Playwright Chromium, described in
  `<teamWorkspace>/.mtm-local/README.md`. Use them. Never download or install PostgreSQL, never `initdb` a private
  cluster and never start a server on another port during a match: if the database is not reachable, run only the
  start command that README gives; if it still fails, reply `BLOCKED MACHINE_PREREQUISITE_MISSING <error>`.
  Only when `.mtm-local/README.md` does not exist at all (machine never prepared) fall back to "Toolchain installs"
  below, reuse anything already on disk (e.g. `%LOCALAPPDATA%\Programs\PostgreSQL16`), and start the reply with
  `MACHINE_NOT_PREPARED` so the team runs machine-setup.ps1 before the next match.
- **Run independent work at the same time.** Start long jobs in the background (`Start-Process pwsh -ArgumentList
  '-NoProfile','-Command',"<cmd> *> <log>" -PassThru`, or several jobs in one command), keep their PIDs and logs in
  `.mtm-tmp/`, and wait for all of them in ONE call with a long `yield_time_ms`. Example for B+C: production build,
  baseline test run and the slot installs all run together.
- **Install with the warm store:** `pnpm install --frozen-lockfile --prefer-offline` (also in slots, in parallel).
- **Cache by source tree.** `key = git -C <checkoutRoot> rev-parse HEAD:<folder>` (the exact content of the match
  folder). If `<teamWorkspace>/.mtm-cache/<key>/` exists (same seed as an earlier match), copy its `repo-map.md`,
  `tools/` and `baseline/` into `<matchRoot>/.mtm-tmp/` and only VERIFY them (patch `git apply --check`, one shot,
  one serve) instead of writing them again. At the end of preparation copy those three into the cache. The cache
  holds no secrets (no env files, no auth.json).

## A. ENVIRONMENT (main checkout)
Read `matchRoot/README.md`, then any `env-require/README.md`, `env-require/requirements.json`,
   `exam-info.json` and `src/.env.example`. Follow them literally (ports, database names, package manager versions).
   If the README names a product with notes in `.agents/skills/team-orchestrator/products/` (e.g. Solova), read them.
   - Machine-level prerequisites prepared by the team before the match are described in
     `<teamSdlcPackWorkspace>/../.mtm-local/README.md` (the team workspace is the PARENT folder of `team-sdlc-pack`; `.mtm-local` is never inside `team-sdlc-pack`) (local database ports, local dev passwords). Read it if it exists and
     use those local values; never commit them (they belong in git-ignored files such as `src/.env`).
   - Shared local services must be isolated per match. A database that an earlier match migrated makes baseline
     tests lie (a fix applied last match hides a planted defect in this seed). Use match-specific database names in
     the checkout's git-ignored env file (e.g. `..._<matchId>` and `..._<matchId>_test`); the application role has
     CREATEDB. Before baseline tests, confirm the database's recorded migrations equal the checkout's migration
     folder; if the tool warns about migrations missing from the folder, you are on a stale database: switch names.
   - Install dependencies with the locked command (`pnpm install --frozen-lockfile`, `npm ci`, ...).
   - Run the provided setup/migration/seed steps and any `doctor`/check script until it reports ready.
   - Missing toolchain or service: install it yourself, see "Toolchain installs" below. No human can help
     once the match starts, so never wait for one.

## Machine inventory (pre-installed, check before installing anything)
First refresh PATH in your shell (the Player process may predate recent installs):
`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME','User'); $env:DOTNET_ROOT = [Environment]::GetEnvironmentVariable('DOTNET_ROOT','User')`
- Git 2.55, Node.js 24, Python 3.14, Docker Desktop CLI.
- pnpm via corepack (shims in `%APPDATA%\npm`; it follows `packageManager` in package.json, e.g. 10.12.3).
- .NET SDK 8.0.427 in `%LOCALAPPDATA%\Microsoft\dotnet` (`DOTNET_ROOT`).
- Temurin JDK 21 (`JAVA_HOME`) and Maven 3.9.16 (`MAVEN_HOME`) in `%LOCALAPPDATA%\Programs`.
- PostgreSQL 16 service on 127.0.0.1:5433, psql at `C:\Program Files\PostgreSQL\16\bin\psql.exe`.

## Toolchain installs (always allowed, no approval needed)
Any runtime, SDK, package manager, CLI or service the source needs may be installed without asking and without
it being declared in the README, as long as it needs **no administrator rights**:
- `corepack enable <pm> --install-directory "$env:APPDATA\npm"` then `corepack prepare <pm>@<version> --activate`
  (pnpm, yarn), using the version in `package.json` `packageManager` when present.
- `winget install --id <Id> --exact --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements`
  (add `--version <v>` when the project pins one).
- Official per-user installers or portable archives into `%LOCALAPPDATA%\Programs\<tool>` when winget has no
  user-scope package, e.g. `dotnet-install.ps1 -Channel <x> -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet"`,
  Temurin JDK / Maven / Gradle / Go zip archives, Python from winget user scope.
- A database or service that normally installs as a Windows service can run as a user process instead: portable
  binaries in `%LOCALAPPDATA%\Programs`, data dir under `%LOCALAPPDATA%`, started on the port the project expects
  (e.g. PostgreSQL `initdb` + `pg_ctl start -o "-p <port>"`). Check first whether it is already installed.
- After installing, refresh PATH in the current shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
  and add the new tool's bin folder to the user PATH if the installer did not.

Rules for installs:
- Never anything that triggers UAC/administrator rights (machine-scope MSI, `choco install`, Windows services,
  editing machine settings). Pick the user-scope or portable route instead.
- Official sources only (winget, vendor download sites, corepack, the language's package registry).
- Prefer the version the project pins; otherwise the current LTS. Do not upgrade versions the project already pins.
- Do not change the user's global tool configuration beyond what the install itself needs (PATH entries are fine).
- Keep installer output short (`| Select-Object -Last 5`), and time-box each install to ~10 minutes.
- If every non-admin route fails, report `BLOCKED` with the exact package and error.

## B. BUILD (main checkout)
Run the documented build (for example `prepare-source.ps1` or `pnpm run build`) and a fast baseline
   test run if one exists (time-box ~10 minutes). Note every failing baseline test by name in your final answer, with
   a one-line guess of the cause from the design documents: during the game the orchestrator must resolve it in the
   first item whose criteria require existing tests to pass. Do not change tracked files now. `COMPLETED` only if the build succeeds. Then confirm `git status --porcelain` shows no tracked changes
   (untracked/ignored env files are fine; if a tracked file changed, restore it with `git checkout -- <file>`).

## C. SLOTS (after the orchestrator ran `prepare_slots`)
For every slot `<checkoutRoot>.slots/sN/<folder>`, all slots in parallel and in parallel with B:
- install dependencies with the same locked command as the main checkout plus `--prefer-offline`;
- databases: follow the env-require README. If it says working copies share the app database and only the TEST
  database must differ (Solova does), the slot env already has its own test database name and the tests create it:
  nothing to migrate or seed. If each copy needs its own app database, clone the main one instead of migrating and
  seeding again (PostgreSQL: `CREATE DATABASE <slot db> TEMPLATE <main db>` while nothing is connected to it);
- no build in a slot; one fast test (or a typecheck) proves the slot works.
Do not change tracked files in a slot either.

## D. REPO MAP
Write `<matchRoot>/.mtm-tmp/repo-map.md` (git-ignored; at most ~120 lines). Workers read it instead of exploring:
stack and versions; folder layout (app root, routers/controllers, services, data/migrations, UI, tests);
per module the key files; exact narrow test commands (single file / single module) and the full suite command;
migration/seed commands; how to run the app (port) ; the baseline failing tests with the one-line cause guess;
design documents worth reading (`DECISIONS.md`, `BUILD_REPORT.md`, specs). Facts only, no speculation.

## F. BASELINE PATCH (when B found failing baseline tests)
The game commits this patch at minute 0, before any worker starts (`apply_baseline`), so it must be right.
1. Decide the wrong side from the design documents (`DECISIONS.md`, specs, original migrations, `BUILD_REPORT.md`),
   exactly as WORKER.md "Baseline failures" says. Prepare a patch only when the code drifted from the documented
   design and the fix is clear (e.g. a later migration contradicts a documented rule: add a NEW migration that
   restores it; never edit old migrations). Never change a test in this patch. If unsure, prepare nothing.
2. Make the fix in slot s1 (`<checkoutRoot>.slots/s1/<folder>`), run the migration on s1's database and the whole
   suite there; it must be green.
3. Save it: `git -C <s1 worktree> diff --binary > <matchRoot>/.mtm-tmp/baseline/baseline.patch` (include new files:
   `git add -N` them first), and write `<matchRoot>/.mtm-tmp/baseline/README.md`: failing test, cause with the
   document line that proves it, fix, suite result (one short paragraph).
4. Restore s1: `git -C <s1 worktree> checkout -- .` and `git clean -fd` (ignored files stay). Never commit.

## E. RUN AND EVIDENCE TOOLS
Write two small Node scripts into `<matchRoot>/.mtm-tmp/tools/` (git-ignored; start_work copies them into every
slot) and verify both once on the main checkout. Workers otherwise rebuild them per item (BCYRV9M9: up to 14
reruns of a home-made screenshot script and 60 one-second polls in one item).
- `serve.mjs --mode dev|prod --port <p>`: run from the app folder; if the port already answers, return at once;
  otherwise start the documented dev server (or `start` after a build for prod) detached, poll the URL until HTTP
  200/302 (max ~120 s) and print `READY <url>` or the last 30 log lines. `--stop` frees the port.
- `shot.mjs --url <path> --width <w> [--height <h>] --out <file> [--wait <selector or text>]`: with the project's
  browser automation (Playwright when present), sign in once with the seeded test user from the README or seed
  (cache the session in `.mtm-tmp/tools/auth.json`), open the page, wait for network idle and for loading
  skeletons/spinners to disappear (and for `--wait` if given), save the screenshot, print the main element boxes
  as one JSON line. Prefer role/text selectors over product-specific CSS.
Use run commands with a large `yield_time_ms` here too. If the project has no browser automation, write only
`serve.mjs` and say so in the reply.
