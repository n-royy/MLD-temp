#Requires -Version 5.1
# Installs PostgreSQL 16 on port 5433 (as the match's env-require/setup.ps1 does) with generated local
# passwords stored under <TeamWorkspace>\.mtm-local\ (never committed).
param([Parameter(Mandatory = $true)][string]$TeamWorkspace)
$ErrorActionPreference = 'Stop'
$local = Join-Path $TeamWorkspace '.mtm-local'
New-Item -ItemType Directory -Force $local | Out-Null
$secretFile = Join-Path $local 'postgres.json'
function New-Secret { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
if (Test-Path $secretFile) { $s = Get-Content $secretFile -Raw | ConvertFrom-Json }
else {
  $s = [pscustomobject]@{ superuser = 'postgres'; superPassword = (New-Secret); port = 5433; appRole = 'freelanceos'; appPassword = (New-Secret) }
  $s | ConvertTo-Json | Set-Content -Encoding utf8 $secretFile
}
if (Get-Service -Name 'postgresql-x64-16' -ErrorAction SilentlyContinue) {
  Write-Output 'PostgreSQL 16 service already installed.'
} else {
  & winget install --id PostgreSQL.PostgreSQL.16 --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity `
    --override "--mode unattended --unattendedmodeui none --superpassword $($s.superPassword) --serverport 5433"
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL installation failed ($LASTEXITCODE)." }
}
Get-Service -Name 'postgresql-x64-16' | Select-Object Name, Status
