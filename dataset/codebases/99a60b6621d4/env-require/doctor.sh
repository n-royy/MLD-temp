#!/usr/bin/env bash
# Environment check for macOS and Linux (doctor.ps1 is the Windows equivalent).
# Usage: bash doctor.sh [--source-dir <app folder>] [--output <report.json>] [--skip-database]
# Writes environment-report.json and prints "Environment status: READY" or "NOT_READY" (exit 2).
set -u

here="$(cd "$(dirname "$0")" && pwd)"
source_dir="$here/../src"
output="$here/environment-report.json"
skip_db=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source-dir) source_dir="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    --skip-database) skip_db=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 64 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node: missing. Install Node.js 20+ (24 recommended), then run doctor.sh again."
  echo "Environment status: NOT_READY"
  exit 2
fi

rows=""
add() { rows="${rows}$1	$2	$3	$4
"; }

for cmd in git node pnpm; do
  if location="$(command -v "$cmd" 2>/dev/null)"; then add "$cmd" true "$location" ""; else add "$cmd" false "" "not found in PATH"; fi
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -ge 20 ]; then add "node-version" true "" "v$(node -p 'process.versions.node')"; else add "node-version" false "" "Node.js $node_major; 20+ required"; fi

# The existing tests clean the database with `SET session_replication_role = replica`
# (tests/helpers.ts), which needs a superuser or, on PostgreSQL 15+,
# `GRANT SET ON PARAMETER session_replication_role TO <role>`, and create the test
# database when it is missing (tests/global-setup.ts), which needs CREATEDB.
# db-setup.sql grants both; the db service in src/docker-compose.yml is a superuser.
if [ "$skip_db" -eq 0 ]; then
  url="${TEST_DATABASE_URL:-}"
  if [ -z "$url" ] && [ -f "$source_dir/.env" ]; then
    url="$(sed -n 's/^[[:space:]]*TEST_DATABASE_URL[[:space:]]*=[[:space:]]*//p' "$source_dir/.env" | head -n 1 | tr -d '"'"'"'\r')"
  fi
  if [ -z "$url" ]; then
    add "test-database-privileges" false "" "TEST_DATABASE_URL is not set (environment or src/.env)"
  elif [ ! -d "$source_dir/node_modules/.bin" ]; then
    add "test-database-privileges" false "" "run pnpm install in src first"
  else
    masked="$(printf '%s' "$url" | sed -E 's#//([^:/@]+):[^@]*@#//\1:***@#')"
    # Connect to the maintenance database, as tests/global-setup.ts does, so the check also
    # works before the test database exists.
    admin_url="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/postgres"; console.log(u.toString())' "$url")"
    # Test database name, with single quotes doubled for the SQL literal below.
    test_db="$(node -e 'const q = String.fromCharCode(39); console.log(decodeURIComponent(new URL(process.argv[1]).pathname.slice(1)).split(q).join(q + q))' "$url")"
    sql="SET session_replication_role = replica; SET session_replication_role = DEFAULT;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreatedb OR rolsuper))
     AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$test_db') THEN
    RAISE EXCEPTION 'missing CREATEDB';
  END IF;
END \$\$;"
    result="$(cd "$source_dir" && printf '%s' "$sql" | pnpm exec prisma db execute --stdin --url "$admin_url" 2>&1)"
    code=$?
    if [ "$code" -eq 0 ]; then
      add "test-database-privileges" true "$masked" "TEST_DATABASE_URL role can set session_replication_role and create the test database"
    elif printf '%s' "$result" | grep -q "permission denied to set parameter"; then
      add "test-database-privileges" false "$masked" "role cannot set session_replication_role; pnpm test will fail. Run db-setup.sql as a superuser (PostgreSQL 15+), or use the db service in src/docker-compose.yml."
    elif printf '%s' "$result" | grep -q "missing CREATEDB"; then
      add "test-database-privileges" false "$masked" "role cannot create the test database; pnpm test will fail. Run db-setup.sql as a superuser."
    else
      add "test-database-privileges" false "$masked" "could not run the check: $(printf '%s' "$result" | grep -v '^[[:space:]]*$' | tail -n 2 | tr '\n' ' ')"
    fi
  fi
fi

printf '%s' "$rows" | node -e '
const fs = require("fs");
const checks = fs.readFileSync(0, "utf8").split("\n").filter(Boolean).map((line) => {
  const [name, pass, location, detail] = line.split("\t");
  return { name, pass: pass === "true", location: location || null, detail: detail || null };
});
const status = checks.every((c) => c.pass) ? "READY" : "NOT_READY";
fs.writeFileSync(process.argv[1], JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), status, checks }, null, 2) + "\n");
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.location ? "  " + c.location : ""}${c.detail ? "  " + c.detail : ""}`);
console.log(`Environment status: ${status}`);
process.exitCode = status === "READY" ? 0 : 2;
' "$output"
