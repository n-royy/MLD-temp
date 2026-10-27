param([Parameter(Mandatory = $true)][string]$TeamWorkspace)
# Shows which Prisma migrations are recorded and the delete rule of invoices.company_id in the local
# freelanceos / freelanceos_test databases. Read-only; passwords never printed.
$ErrorActionPreference = 'Stop'
$s = Get-Content (Join-Path $TeamWorkspace '.mtm-local\postgres.json') -Raw | ConvertFrom-Json
$psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$env:PGPASSWORD = $s.appPassword
try {
  foreach ($db in 'freelanceos', 'freelanceos_test') {
    "== $db"
    & $psql -h 127.0.0.1 -p $s.port -U $s.appRole -d $db -At -c "select migration_name from _prisma_migrations order by started_at" 2>&1 | Select-Object -Last 4
    & $psql -h 127.0.0.1 -p $s.port -U $s.appRole -d $db -At -c "select conname, confdeltype from pg_constraint where conname in ('invoices_company_id_fkey','payments_company_id_fkey')" 2>&1
  }
} finally { Remove-Item Env:PGPASSWORD }
