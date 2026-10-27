param([Parameter(Mandatory = $true)][string]$TeamWorkspace, [Parameter(Mandatory = $true)][string]$SqlFile)
$ErrorActionPreference = 'Stop'
$s = Get-Content (Join-Path $TeamWorkspace '.mtm-local\postgres.json') -Raw | ConvertFrom-Json
$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$env:PGPASSWORD = $s.superPassword
try {
  & $psql -h 127.0.0.1 -p $s.port -U $s.superuser -v "app_password=$($s.appPassword)" -f $SqlFile 2>&1 | Select-Object -Last 4
  if ($LASTEXITCODE -ne 0) { throw "db-setup failed ($LASTEXITCODE)" }
} finally { Remove-Item Env:PGPASSWORD }
$readme = @"
# Local machine prerequisites (team MLD) - never commit these values

- PostgreSQL 16 service ``postgresql-x64-16`` listens on 127.0.0.1:$($s.port).
- psql: ``C:\Program Files\PostgreSQL\16\bin\psql.exe``
- Superuser ``$($s.superuser)`` and application role ``$($s.appRole)`` (database ``freelanceos``, CREATEDB,
  SET ON session_replication_role) were created with the match's env-require/db-setup.sql.
- Passwords are in ``postgres.json`` next to this file: ``appPassword`` for DATABASE_URL / TEST_DATABASE_URL in
  git-ignored ``src/.env``; ``superPassword`` only for re-running db-setup.sql (set it through PGPASSWORD, never on
  the command line output or in committed files).
- pnpm 10.12.3 is activated through corepack in %APPDATA%\npm.
"@
Set-Content -Encoding utf8 (Join-Path $TeamWorkspace '.mtm-local\README.md') $readme
'LOCAL_PREREQUISITES_READY'
