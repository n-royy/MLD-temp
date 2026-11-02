# Environment preparation

Prepare the environment before the match; the clock does not stop for setup problems. Supported: Windows x64, macOS and Linux. You need Node.js 20+ (24 recommended), Git, pnpm and PostgreSQL 15+ reachable on `127.0.0.1:5433` (the port in src/.env.example), installed natively or run with Docker. The environment is ready only when the doctor (`doctor.ps1` on Windows, `doctor.sh` on macOS/Linux) reports `Environment status: READY`. Never use a production database.

## Windows

1. Run `setup.ps1 -PostgresPassword <password>`. It installs Git, Node.js and pnpm, and PostgreSQL 16 listening on **port 5433**. If PostgreSQL 15 or later is already installed, make sure it listens on 5433; the password is then not needed. (Docker works too: see "PostgreSQL with Docker" below, then skip step 2.)
2. Create the application role and database, once, as the postgres superuser:

   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -v app_password=<app password> -f db-setup.sql
   ```

   The last line must show `freelanceos | f | t | t`. Safe to re-run.
3. Copy src/.env.example to src/.env and replace `CHANGE_ME` in `DATABASE_URL` and `TEST_DATABASE_URL` with the app password from step 2. Keep the host, port 5433 and the database names. Set the remaining values as described in src/.env.example.
4. Run `prepare-source.ps1` (installs dependencies and checks the build), then from src/: `pnpm prisma migrate deploy` and `pnpm db:seed`.
5. Run `doctor.ps1`. It must report `READY`.

## macOS and Linux

1. Install Node.js 20+ (24 recommended; macOS: `brew install node`, Linux: NodeSource or nvm, because some distributions ship an older Node) and Git. Then enable pnpm with `corepack enable` (the project pins its pnpm version in src/package.json).
2. PostgreSQL on port 5433, one of:
   - **Docker** (simplest, same on every machine): see "PostgreSQL with Docker" below. No db-setup.sql is needed.
   - **Native** PostgreSQL 15+ (macOS: `brew install postgresql@16`; Linux: the distribution package), configured with `port = 5433` in its `postgresql.conf` and restarted. Then create the role and database once as a superuser (Homebrew's superuser is your macOS user; on Linux use `sudo -u postgres`):

     ```bash
     psql -h 127.0.0.1 -p 5433 -d postgres -v app_password=<app password> -f db-setup.sql
     ```

     The last line must show `freelanceos | f | t | t`.
3. Copy src/.env.example to src/.env and set the passwords in `DATABASE_URL` and `TEST_DATABASE_URL` (the app password from step 2, or the Docker password). Keep the host, port 5433 and the database names. Set the remaining values as described in src/.env.example.
4. From src/: `pnpm install --frozen-lockfile`, `pnpm exec prisma generate`, `pnpm build`, `pnpm prisma migrate deploy`, `pnpm db:seed`.
5. Run `bash doctor.sh` (options: `--source-dir <app folder>`, default `../src`; `--skip-database`). It must report `READY`.

If `pnpm install --frozen-lockfile` stalls or times out fetching packages, the machine cannot reach the npm registry: check `pnpm config get registry` (expected `https://registry.npmjs.org/`), proxy and VPN settings, or try another network. Fix this before the match; agents cannot work around it.

## Browser for verification scripts

Some verification scripts drive a real browser through the app's Playwright dev dependency. Before the match, from src/, run `pnpm exec playwright install chromium` once. If that is not possible, an installed Microsoft Edge or Google Chrome is used instead.

## PostgreSQL with Docker

src/docker-compose.yml has a `db` service (PostgreSQL 16 on `127.0.0.1:5433`, user `freelanceos`, password in the file). Start only that service, from src/:

```bash
docker compose up -d db
```

Wait until `docker compose ps db` shows `healthy`, and keep Docker running during the match. The compose user is a superuser, so it already has the test privileges below; use its password in src/.env. Do not run a native PostgreSQL on port 5433 at the same time.

## Working copies

Every working copy, including agent worktrees, uses the same `DATABASE_URL`. `TEST_DATABASE_URL` must differ per working copy whenever tests can run at the same time: the tests empty the test database before every case, so two runs sharing one test database delete each other's data and fail at random. Change only the database name, for example `.../freelanceos_test_task02`, in that copy's src/.env or in the `TEST_DATABASE_URL` environment variable (it takes precedence over src/.env). The tests create a missing test database themselves (the role has `CREATEDB`), so no other setup is needed.

## Test database privileges

The existing tests need two privileges, which db-setup.sql grants to the `freelanceos` role without making it a superuser (the Docker `db` user already has them):

- `CREATEDB`: src/tests/global-setup.ts creates the `freelanceos_test` database when it is missing.
- `SET ON PARAMETER session_replication_role` (PostgreSQL 15+): src/tests/helpers.ts empties the test database between cases with `SET session_replication_role = replica`, because the append-only accounting ledger refuses deletes. Without it every database test fails with `permission denied to set parameter "session_replication_role"`.

This is environment setup: do not change the tests to work around it.

The doctor checks both through `TEST_DATABASE_URL` (from the environment or src/.env), after `pnpm install` has run in src. The check `test-database-privileges` fails if a privilege is missing; if it cannot run yet (no `TEST_DATABASE_URL`, no `node_modules`), the status is `NOT_READY` too. `doctor.ps1` options: `-SourceDir <app folder>` (default `..\src`), `-SkipDatabase` (skips the database check; do not use it to prepare for the match).

## Prisma "Update available" notice

Prisma commands may print a box such as `Update available 6.19.3 -> 8.0.0-rc.27 ... This is a major update`. It is an informational version check, not an error: the command still runs and its exit code is unchanged. Do not follow it. It suggests a pre-release major version with breaking configuration changes, and upgrading Prisma is not needed to run, test or build the application. To hide the notice, set `PRISMA_HIDE_UPDATE_MESSAGE=1` (PowerShell: `$env:PRISMA_HIDE_UPDATE_MESSAGE = "1"`), or `CHECKPOINT_DISABLE=1` to also skip the online version check.
