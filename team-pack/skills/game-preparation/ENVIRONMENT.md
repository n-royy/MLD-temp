# Environment specialist (read by `team_repo_scout` during preparation, and by anyone who must install a tool)

Moved verbatim from the single-agent preparation skill; only the reader changed. Work in `checkoutRoot` /
`matchRoot` (and the slots when asked). Never print or write the password. Never commit, never push, never change
tracked files: the reported revision must be the clean checkout. Long commands: run them with a timeout and show only
the tail of their output. Where this file says "report" or "COMPLETED/BLOCKED", put it in your reply:
only the orchestrator writes progress events.

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
For every slot `<checkoutRoot>.slots/sN/<folder>`:
- install dependencies with the same locked command as the main checkout (the package store is shared, so it is fast);
- the slot's git-ignored env file was copied with slot-specific database names/ports: create those databases and run
  the same migration/seed steps there (never on another match's or another slot's database);
- no full build is needed in a slot; a quick typecheck or one fast test proves the slot works.
Do not change tracked files in a slot either.

## D. REPO MAP
Write `<matchRoot>/.mtm-tmp/repo-map.md` (git-ignored; at most ~120 lines). Workers read it instead of exploring:
stack and versions; folder layout (app root, routers/controllers, services, data/migrations, UI, tests);
per module the key files; exact narrow test commands (single file / single module) and the full suite command;
migration/seed commands; how to run the app (port) ; the baseline failing tests with the one-line cause guess;
design documents worth reading (`DECISIONS.md`, `BUILD_REPORT.md`, specs). Facts only, no speculation.
