#Requires -Version 7.0
<#
  MLD machine setup - run ONCE before match day (and again after a Windows reinstall), never during a match.
  Makes the machine-level prerequisites the organizer asks for ("Prepare the environment before the match"):
    - PostgreSQL 16 listening on 127.0.0.1:5433, persistent, started automatically at logon
      (Windows service when one is installed, otherwise the portable binaries in %LOCALAPPDATA%\Programs);
    - the application role/database from the match's env-require\db-setup.sql;
    - <TeamWorkspace>\.mtm-local\postgres.json + README.md (local passwords; never committed);
    - pnpm (version from the source's packageManager) and a warm pnpm store;
    - Playwright's Chromium for the project's Playwright version.
  Passwords are generated once, stored only in .mtm-local\postgres.json and never printed.

  Usage (PowerShell 7):
    pwsh -NoProfile -File machine-setup.ps1 -TeamWorkspace "D:\mtm\MLD"
  Options: -Postgres Auto|Service|Portable  -Port 5433  -SourceDir <app folder with package.json>  -SkipWarm
#>
param(
  [string]$TeamWorkspace = 'D:\mtm\MLD',
  [ValidateSet('Auto', 'Service', 'Portable')][string]$Postgres = 'Auto',
  [int]$Port = 5433,
  [string]$PortableBin = (Join-Path $env:LOCALAPPDATA 'Programs\PostgreSQL16\pgsql\bin'),
  [string]$DataDir = (Join-Path $env:LOCALAPPDATA 'MTM\pg16-data'),
  [string]$DbSetupSql,
  [string]$SourceDir,
  [switch]$SkipWarm,
  # Delete and recreate the portable cluster in -DataDir when its passwords were lost (it holds no team data).
  [switch]$ResetPortable
)
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
function Step($m) { Write-Host "== $m" -ForegroundColor Cyan }
function New-Secret { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
function Test-Port([int]$p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

# ---------- inputs ----------
if (-not (Test-Path $TeamWorkspace)) { throw "TeamWorkspace $TeamWorkspace does not exist." }
$matchesDir = Join-Path $TeamWorkspace 'matches'
$newest = Get-ChildItem $matchesDir -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
  ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'env-require') } } |
  Select-Object -First 1
if (-not $DbSetupSql -and $newest) { $DbSetupSql = Join-Path $newest.FullName 'env-require\db-setup.sql' }
if (-not $SourceDir -and $newest) { $SourceDir = Join-Path $newest.FullName 'src' }

$local = Join-Path $TeamWorkspace '.mtm-local'
New-Item -ItemType Directory -Force $local | Out-Null
$secretFile = Join-Path $local 'postgres.json'
$hadSecrets = Test-Path $secretFile
if ($hadSecrets) { $s = Get-Content $secretFile -Raw | ConvertFrom-Json }
else { $s = [pscustomobject]@{ superuser = 'postgres'; superPassword = (New-Secret); port = $Port; appRole = 'freelanceos'; appPassword = (New-Secret) } }
$s | Add-Member -Force -NotePropertyName port -NotePropertyValue $Port
# Persist the passwords BEFORE any cluster is created, so an interrupted run never leaves a cluster nobody can log in to.
$s | ConvertTo-Json | Set-Content -Encoding utf8 $secretFile

function Invoke-PgCtl([string]$bin, [string[]]$arguments) {
  # pg_ctl start leaves postgres.exe running as its child. A pipe (v1) and Start-Process -Wait (v2, which waits for
  # the whole process tree in PowerShell 7) both block forever. Start pg_ctl without redirection and wait for pg_ctl
  # itself only, with a timeout.
  $p = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $arguments -NoNewWindow -PassThru
  if (-not $p.WaitForExit(120000)) { throw 'pg_ctl did not finish within 120 s' }
  return $p.ExitCode
}

# A portable cluster whose passwords are unknown (created by an interrupted earlier run) cannot be used.
if ((Test-Path (Join-Path $DataDir 'PG_VERSION')) -and -not $hadSecrets) {
  if (-not $ResetPortable) {
    throw "The cluster in $DataDir was created by an earlier, interrupted run and its passwords are unknown. It holds no team data. Run again with -ResetPortable to recreate it."
  }
  Step "Recreating the portable cluster in $DataDir"
  if (Test-Path (Join-Path $DataDir 'postmaster.pid')) { [void](Invoke-PgCtl $PortableBin @('-D', "`"$DataDir`"", '-m', 'fast', '-w', 'stop')) }
  Remove-Item $DataDir -Recurse -Force
}

# ---------- PostgreSQL ----------
Step "PostgreSQL on 127.0.0.1:$Port"
$service = Get-Service -Name 'postgresql-x64-1*' -ErrorAction SilentlyContinue | Select-Object -First 1
$mode = $null; $bin = $null; $startCommand = $null
if (Test-Port $Port) {
  Write-Host "A server already listens on $Port."
  $owner = (Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -First 1).OwningProcess
  $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue).CommandLine
  if ($cmdline -match '-D\s+"?([^"]+?)"?(\s|$)' -and $Matches[1] -notlike "$DataDir*" -and $Matches[1] -like '*\MTM\*') {
    throw "Port $Port belongs to a temporary per-match cluster ($($Matches[1])) created by an earlier preparation. Stop it first: & `"$PortableBin\pg_ctl.exe`" -D `"$($Matches[1])`" stop  - then run this script again."
  }
  if ($service) { $mode = 'service'; $bin = Split-Path ((Get-CimInstance Win32_Service -Filter "Name='$($service.Name)'").PathName -replace '^"?([^"]+pg_ctl\.exe).*$', '$1') }
  elseif (Test-Path (Join-Path $PortableBin 'psql.exe')) {
    $mode = 'portable'; $bin = $PortableBin
    $log = Join-Path (Split-Path $DataDir) 'pg16.log'
    $startCommand = "`"$(Join-Path $bin 'pg_ctl.exe')`" -D `"$DataDir`" -l `"$log`" -w start"
    $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'mtm-postgres16.cmd'
    Set-Content -Encoding ascii $startup "@echo off`r`n$startCommand`r`n"
    Write-Host "Autostart: $startup"
  }
  else { $mode = 'existing'; $bin = 'C:\Program Files\PostgreSQL\16\bin' }
} elseif ($service -and $Postgres -ne 'Portable') {
  Start-Service $service.Name; Set-Service $service.Name -StartupType Automatic -ErrorAction SilentlyContinue
  $mode = 'service'; $bin = 'C:\Program Files\PostgreSQL\16\bin'
} elseif ((Test-Path (Join-Path $PortableBin 'initdb.exe')) -and $Postgres -ne 'Service') {
  $mode = 'portable'; $bin = $PortableBin
  if (-not (Test-Path (Join-Path $DataDir 'PG_VERSION'))) {
    New-Item -ItemType Directory -Force $DataDir | Out-Null
    $pw = New-TemporaryFile
    try {
      Set-Content -NoNewline -Encoding ascii $pw $s.superPassword
      & (Join-Path $bin 'initdb.exe') -D $DataDir -U $s.superuser --pwfile=$($pw.FullName) --auth-host=scram-sha-256 --auth-local=scram-sha-256 -E UTF8 --locale=C 2>&1 | Select-Object -Last 3
      if ($LASTEXITCODE -ne 0) { throw "initdb failed ($LASTEXITCODE)" }
    } finally { Remove-Item $pw -Force }
    Add-Content (Join-Path $DataDir 'postgresql.conf') "`nport = $Port`nlisten_addresses = '127.0.0.1'`n"
  }
  $log = Join-Path (Split-Path $DataDir) 'pg16.log'
  $rc = Invoke-PgCtl $bin @('-D', "`"$DataDir`"", '-l', "`"$log`"", '-w', 'start')
  if ($rc -ne 0) { throw "pg_ctl start failed ($rc); see $log" }
  $startCommand = "`"$(Join-Path $bin 'pg_ctl.exe')`" -D `"$DataDir`" -l `"$log`" -w start"
  # Start automatically at logon (no administrator rights needed).
  $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'mtm-postgres16.cmd'
  Set-Content -Encoding ascii $startup "@echo off`r`n$startCommand`r`n"
  Write-Host "Autostart: $startup"
} elseif ($Postgres -ne 'Portable') {
  Write-Host 'Installing the PostgreSQL 16 service with winget (one UAC prompt).'
  & winget install --id PostgreSQL.PostgreSQL.16 --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity `
    --override "--mode unattended --unattendedmodeui none --superpassword $($s.superPassword) --serverport $Port"
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL installation failed ($LASTEXITCODE)." }
  $mode = 'service'; $bin = 'C:\Program Files\PostgreSQL\16\bin'
} else { throw "No portable PostgreSQL in $PortableBin; run with -Postgres Auto or Service." }
if (-not (Test-Port $Port)) { Start-Sleep 3 }
if (-not (Test-Port $Port)) { throw "PostgreSQL is not listening on $Port." }
$s | Add-Member -Force -NotePropertyName mode -NotePropertyValue $mode
$s | Add-Member -Force -NotePropertyName bin -NotePropertyValue $bin
$s | ConvertTo-Json | Set-Content -Encoding utf8 $secretFile
$psql = Join-Path $bin 'psql.exe'

# ---------- application role ----------
Step 'Application role (env-require\db-setup.sql)'
if ($DbSetupSql -and (Test-Path $DbSetupSql)) {
  $env:PGPASSWORD = $s.superPassword
  try {
    $out = & $psql -w -h 127.0.0.1 -p $Port -U $s.superuser -v "app_password=$($s.appPassword)" -f $DbSetupSql 2>&1
    if ($LASTEXITCODE -ne 0) { $out | Select-Object -Last 4; throw "db-setup.sql failed ($LASTEXITCODE). If the superuser password is unknown (older cluster), reset it or use a new -DataDir." }
    $out | Select-Object -Last 3
  } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
} else { Write-Warning 'No db-setup.sql found (pass -DbSetupSql). Role not created.' }

# ---------- README for the agents ----------
$readme = @"
# Local machine prerequisites (team MLD) - never commit these values

- PostgreSQL ($mode) listens on 127.0.0.1:$Port and persists between matches. It is already prepared:
  do NOT install, download or initdb PostgreSQL during a match, and do NOT create a private cluster or another port.
- psql: ``$psql``
$(if ($startCommand) { "- If it is not running (after a reboot before logon scripts ran): $startCommand" })
- Superuser ``$($s.superuser)`` and application role ``$($s.appRole)`` (CREATEDB, SET ON session_replication_role) were
  created with the match's env-require/db-setup.sql. Re-run that file only if doctor.ps1 reports missing privileges.
- Passwords are in ``postgres.json`` next to this file: ``appPassword`` for DATABASE_URL / TEST_DATABASE_URL in the
  git-ignored ``src/.env``; ``superPassword`` only for re-running db-setup.sql (through PGPASSWORD, never printed).
- Per match: use match-specific database names (``..._<matchId lowercase>`` and ``..._<matchId lowercase>_test``).
- pnpm store and Playwright Chromium are pre-warmed; ``pnpm install --frozen-lockfile --prefer-offline`` is fast.
"@
Set-Content -Encoding utf8 (Join-Path $local 'README.md') $readme

# ---------- pnpm + warm store + Playwright ----------
if (-not $SkipWarm -and $SourceDir -and (Test-Path (Join-Path $SourceDir 'package.json'))) {
  Step 'pnpm, package store and Playwright Chromium'
  $pkg = Get-Content (Join-Path $SourceDir 'package.json') -Raw | ConvertFrom-Json
  $pm = if ($pkg.packageManager -match '^pnpm@(.+)$') { $Matches[1] } else { $null }
  & corepack enable pnpm --install-directory (Join-Path $env:APPDATA 'npm') 2>&1 | Select-Object -Last 1
  if ($pm) { & corepack prepare "pnpm@$pm" --activate 2>&1 | Select-Object -Last 1 }
  $warm = Join-Path $env:LOCALAPPDATA 'MTM\warm'
  New-Item -ItemType Directory -Force $warm | Out-Null
  foreach ($f in 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc') {
    $src = Join-Path $SourceDir $f; if (Test-Path $src) { Copy-Item $src $warm -Force }
  }
  Push-Location $warm
  try {
    & pnpm install --frozen-lockfile --ignore-scripts 2>&1 | Select-Object -Last 3
    if ($pkg.devDependencies.playwright -or $pkg.devDependencies.'@playwright/test' -or $pkg.dependencies.playwright) {
      & pnpm exec playwright install chromium 2>&1 | Select-Object -Last 2
    }
  } finally { Pop-Location }
}

# ---------- summary ----------
Step 'Summary'
$env:PGPASSWORD = $s.appPassword
try { $ok = & $psql -w -h 127.0.0.1 -p $Port -U $s.appRole -d postgres -At -c 'select 1' 2>&1 } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
[pscustomobject]@{
  postgres   = "$mode on 127.0.0.1:$Port"
  appRoleLogin = if ("$ok" -eq '1') { 'OK' } else { "FAILED: $ok" }
  node       = (node --version)
  pnpm       = (pnpm --version 2>$null)
  git        = (git --version)
  codex      = (codex --version 2>$null)
  playwright = (Test-Path (Join-Path $env:LOCALAPPDATA 'ms-playwright'))
  readme     = (Join-Path $local 'README.md')
} | Format-List
if ("$ok" -eq '1') { 'MACHINE_READY' } else { 'MACHINE_NOT_READY' }
