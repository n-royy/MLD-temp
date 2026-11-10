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
- **Long commands only as jobs, never by polling** (UV8P4HUS: 35 of 84 scout turns were log-tail polls, because an
  exec call returns after about 30 s whatever `yield_time_ms` says; each poll re-sent ~41k tokens). Start them with
  the helper tool `start_jobs` (`dir` = `<matchRoot>/.mtm-tmp/jobs`, each job `{name, cwd, command}`), then call
  `wait_jobs` once (it blocks up to 280 s inside the helper and returns states and log tails; call again only if
  `done` is false). Job names: `prep-*` for what READY needs (install, migrate-seed, build, doctor),
  `install-s1`..`install-s6` for the item slots (s7/s8 are PI slots: no install), `baseline` for the baseline test
  run. Run independent jobs together.
- **A job-runner problem never blocks preparation** (CVNXDTQY: the scout reported BLOCKED because jobs came back
  LOST). start_jobs already retries a lost job as a direct child (`mode: "direct"`). If a job is still LOST or exits
  127 with "start failed", run that command directly with exec_command instead (accept the ~30 s returns), and say so
  in your reply. BLOCKED is only for a real environment failure (database, install, build).
- **The main install is your FIRST action** (IPZ0U79E: 2 m 17 s passed between the clone and its start while the
  scout read documents). Before reading any README, detect the package manager from the lockfile in `matchRoot` and
  start job `prep-install` (cwd `matchRoot`):
  - `.yarn/releases/yarn-*.cjs` + `yarn.lock` (Yarn Berry): `<YARN_ENV> node .yarn/releases/<that file> install --immutable`
  - `pnpm-lock.yaml`: `pnpm install --frozen-lockfile --prefer-offline`
  - `package-lock.json`: `npm ci --prefer-offline --no-audit --no-fund`
  - anything else: read the README first, then start it.
  `<YARN_ENV>` (PowerShell) makes Yarn hard-link packages from one store on the same drive instead of copying
  ~230 MB of files into every working copy, and keeps its cache warm across matches:
  `$env:YARN_NM_MODE='hardlinks-global'; $env:YARN_ENABLE_GLOBAL_CACHE='true'; $env:YARN_GLOBAL_FOLDER='<teamWorkspace>\.mtm-cache\yarn'; `
  (`<teamWorkspace>` is on the same drive as the matches). If `prep-install` FAILS with it, run it once more without
  `<YARN_ENV>` and use no `<YARN_ENV>` for the slots either; say so in your reply.
- **Slot installs: two at a time, never six at once** (IPZ0U79E: five installs beside the build took 13 m 25 s
  each; the link step that took 1 m 17 s alone took 12 m 55 s, so preparation needed ~17.5 minutes). Item slots
  s1-s6 install in two chains started right after the main install, beside the build (part A); the PI slots s7/s8
  need no install. READY waits (bounded) only for s1-s4; s5/s6 may finish in the first game minutes.
- **Install with the warm store:** `pnpm install --frozen-lockfile --prefer-offline`; Yarn with `<YARN_ENV>`.
- **Cache by source tree.** `key = git -C <checkoutRoot> rev-parse HEAD:<folder>` (the exact content of the match
  folder). If `<teamWorkspace>/.mtm-cache/<key>/` exists (same seed as an earlier match), copy its `repo-map.md`,
  `tools/` and `baseline/` into `<matchRoot>/.mtm-tmp/` and only VERIFY them (patch `git apply --check`, one shot,
  one serve) instead of writing them again; a cached `shot.mjs` that still waits for `networkidle` is rewritten
  ("E" below). At the end of preparation copy those three into the cache. The cache
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
   - Job `prep-install` is already running (your first action, "0. Speed rules"); read the documents while it
     runs, then `wait_jobs` for it.
   - Then in parallel, in ONE `start_jobs` call: job `prep-build` (the documented build, e.g. `prepare-source.ps1`
     or `pnpm run build`), job `prep-db` (the provided migration and seed steps, then the `doctor`/check script) and
     the slot installs `install-s1`..`install-s6` (in each slot's app folder from your task, the same locked install
     command as `prep-install`, with `<YARN_ENV>` for Yarn), as two chains with the wait prefix of part B:
     `install-s1` and `install-s2` start at once, `install-s3` waits for `install-s1`, `install-s5` for `install-s3`,
     `install-s4` for `install-s2`, `install-s6` for `install-s4`.
     The orchestrator creates the slot worktrees while the main install runs; a slot folder still missing when you
     start the chains: wait for `<slot>\.git` in the same prefix (`Test-Path`), never skip the slot.
     Then one `wait_jobs` for `prep-build` and `prep-db` only: the slot installs keep running while you finish part A
     and s1-s4 are awaited by the orchestrator before READY.
     The build result belongs in your reply (BUILD gate); `COMPLETED` only if it succeeds. Then confirm
     `git status --porcelain` shows no tracked changes.
   - Missing toolchain or service: install it yourself, see "Toolchain installs" below. No human can help
     once the match starts, so never wait for one.

## Machine inventory (pre-installed, check before installing anything)
First refresh PATH in your shell (the Player process may predate recent installs):
`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME','User'); $env:DOTNET_ROOT = [Environment]::GetEnvironmentVariable('DOTNET_ROOT','User')`
- Git 2.55, Node.js 24, Python 3.14, Docker Desktop CLI.
- pnpm via corepack (shims in `%APPDATA%\npm`; it follows `packageManager` in package.json, e.g. 10.12.3).
- .NET SDK 8.0.427 in `%LOCALAPPDATA%\Microsoft\dotnet` (`DOTNET_ROOT`).
- Temurin JDK 21 (`JAVA_HOME`) and Maven 3.9.16 (`MAVEN_HOME`) in `%LOCALAPPDATA%\Programs`.
- PostgreSQL 16 on 127.0.0.1:5433 as prepared by `machine-setup.ps1` (portable cluster or service; the exact psql
  path and start command are in `<teamWorkspace>/.mtm-local/README.md`).
- pnpm store on the same drive as the workspace (see `.mtm-local/README.md`); never change it.

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

## B. BACKGROUND JOBS (the baseline run; start it, do not wait)
The slot installs were started in part A. Start the `baseline` job now (the full test suite in the main checkout,
output to its log), plus the slot databases of part C when the env-require README needs one per working copy (the
orchestrator has copied the slot env files by now), and go on with D and E while they run.
**Two installs at a time.** Installs share the disk: five at once all finished after 12-13 minutes (5FLQMNAA,
IPZ0U79E). Each chained install (started in part A) first waits, at most 10 minutes, until the job before it in its
chain has an exit file, then installs. PowerShell prefix (`<jobsDir>` = the jobs `dir`, `<prev>` = that job's name):
`$t=0; while (-not (Test-Path "<jobsDir>\<prev>.exit") -and $t -lt 600) { Start-Sleep 3; $t+=3 }; ` The game reads
their results (`JOBS_DONE`); workers wait for their own slot's install.
If the `baseline` job has finished when you reply, note every failing baseline test by name with a one-line cause
guess from the design documents.
Do not change tracked files.

## C. SLOT DATABASES (rules for the slot jobs; installs in part A, databases in part B)
- databases: follow the env-require README. If it says working copies share the app database and only the TEST
  database must differ (Solova does), the slot env already has its own test database name and the tests create it:
  nothing to migrate or seed. If each copy needs its own app database, clone the main one instead of migrating and
  seeding again (PostgreSQL: `CREATE DATABASE <slot db> TEMPLATE <main db>` while nothing is connected to it);
- no build in a slot and no extra check: the first test a worker runs proves the slot.
Do not change tracked files in a slot either.

## D. REPO MAP
Write `<matchRoot>/.mtm-tmp/repo-map.md` (git-ignored; at most ~120 lines). Workers read it instead of exploring:
stack and versions; folder layout (app root, routers/controllers, services, data/migrations, UI, tests);
per module the key files; exact narrow test commands (single file / single module) and the full suite command;
migration/seed commands; how to run the app (port) ; the baseline failing tests with the one-line cause guess;
design documents worth reading (`DECISIONS.md`, `BUILD_REPORT.md`, specs). Facts only, no speculation.

## F. BASELINE PATCH (only when the `baseline` job already finished with failures before you reply)
The game commits this patch at minute 0, before any worker starts (`apply_baseline`), so it must be right.
Scope: only a database schema / migration / configuration drift that contradicts the design documents (for
example a later migration that undoes a documented rule). **Never patch product logic** (functions, services, UI):
a failing test there is usually the planted defect of a backlog item that is not revealed yet, and patching it
takes that item's work and time. Report such a failure as "probably a backlog item" instead. Time-box: 3 minutes; if not done, prepare nothing. If the baseline is
still running, skip F: the orchestrator handles the result in the game.
1. Decide the wrong side from the design documents (`DECISIONS.md`, specs, original migrations, `BUILD_REPORT.md`),
   exactly as WORKER.md "Baseline failures" says. Prepare a patch only when the code drifted from the documented
   design and the fix is clear (e.g. a later migration contradicts a documented rule: add a NEW migration that
   restores it; never edit old migrations). Never change a test in this patch. If unsure, prepare nothing.
2. Make the fix in slot s1 (`<checkoutRoot>.slots/s1/<folder>`; a patch file is not a tracked edit of the checkout),
   run the migration on s1's database and the whole suite there. Required: the test you repair passes and no test
   that passed before fails. Baseline failures in product logic may stay red (they belong to backlog items), so a
   suite that is not fully green is never a reason to skip a clear configuration fix.
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
  (cache the session in `.mtm-tmp/tools/auth.json`), open the page with `waitUntil: 'domcontentloaded'`, then wait
  (bounded, about 15 s each) for `--wait` if given (else the main content), and for loading skeletons/spinners to
  disappear; save the screenshot, print the main element boxes as one JSON line. Never wait for `networkidle`: a
  page that polls or refetches never goes idle (WXNDA4AW: 30 s goto timeouts on Accounting). On a timeout exit
  nonzero, save nothing and print which wait failed (`goto`, `wait`, `loading`) with the page URL. Prefer role/text
  selectors over product-specific CSS.
Verify each tool with one short command (a job if it takes longer than ~20 s). If the project has no browser automation, write only
`serve.mjs` and say so in the reply.
