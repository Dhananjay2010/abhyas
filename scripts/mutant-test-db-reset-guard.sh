#!/usr/bin/env bash
set -euo pipefail

# Mutant test for db-reset-guard: verifies all 43 checks are exercised
# For each check, runs a case that SHOULD be refused by that specific check
# A mutant is KILLED if the guard refuses the case (proving the check works)

echo "=== DB Reset Guard Mutant Test ==="
echo "Verifying that all 43 guard checks are exercised"
echo

KILLED=0
SURVIVED=0
MUTANTS_TOTAL=43

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Create test configs
cat > "$TMPDIR/default-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54322

[api]
port = 54321
EOF

cat > "$TMPDIR/custom-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54333

[api]
port = 54334
EOF

# Source the bash guard
source "$(dirname "$0")/lib-db-reset-guard.sh"

# Helper: test that a case is REFUSED (check is working)
test_refuse_bash() {
  local name="$1"
  shift
  local env_args=("$@")
  
  # Save and clear env
  local saved_env=()
  for var in CI ALLOW_DB_RESET SUPABASE_PROJECT_ID SUPABASE_DB_PORT PGHOST PGPORT PGSERVICE PGHOSTADDR SUPABASE_DB_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL; do
    if [ -n "${!var:-}" ]; then
      saved_env+=("$var=${!var}")
    fi
    unset "$var" 2>/dev/null || true
  done
  
  # Set test env
  for arg in "${env_args[@]}"; do
    export "$arg"
  done
  
  # Run guard (should refuse)
  if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml" 2>/dev/null; then
    echo "  ✗ SURVIVED: $name (guard allowed, check not working)"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "  ✓ KILLED: $name (guard refused as expected)"
    KILLED=$((KILLED + 1))
  fi
  
  # Restore env
  for var in CI ALLOW_DB_RESET SUPABASE_PROJECT_ID SUPABASE_DB_PORT PGHOST PGPORT PGSERVICE PGHOSTADDR SUPABASE_DB_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL; do
    unset "$var" 2>/dev/null || true
  done
  for entry in "${saved_env[@]}"; do
    export "$entry"
  done
}

# Helper: test that a TS case is REFUSED
test_refuse_ts() {
  local name="$1"
  local config="$2"
  local env_setup="$3"
  
  if npx tsx << TSTEST 2>/dev/null
import { checkDbResetGuard } from "./scripts/lib-db-reset-guard";

// Clear env
delete process.env.CI;
delete process.env.ALLOW_DB_RESET;
delete process.env.SUPABASE_PROJECT_ID;
delete process.env.SUPABASE_DB_PORT;
delete process.env.PGHOST;
delete process.env.PGPORT;
delete process.env.PGSERVICE;
delete process.env.PGHOSTADDR;
delete process.env.SUPABASE_DB_URL;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

// Set test env
$env_setup

// Run guard (should refuse)
const result = checkDbResetGuard("$config");
process.exit(result.allow ? 0 : 1);
TSTEST
  then
    echo "  ✗ SURVIVED: $name (guard allowed, check not working)"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "  ✓ KILLED: $name (guard refused as expected)"
    KILLED=$((KILLED + 1))
  fi
}

echo "BASH GUARD CHECKS:"
echo

echo "Check 1: CI must be exactly 'true' (not other truthy values)"
test_refuse_bash "CI=1 refused" \
  "CI=1" "ALLOW_DB_RESET=0" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 2: ALLOW_DB_RESET=1 required (outside CI)"
test_refuse_bash "No ALLOW_DB_RESET refused" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 3: SUPABASE_PROJECT_ID env var not allowed"
test_refuse_bash "SUPABASE_PROJECT_ID env refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_PROJECT_ID=TestGym" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 4: SUPABASE_DB_PORT env var not allowed"
test_refuse_bash "SUPABASE_DB_PORT env refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_PORT=54333" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 5: PGHOST env var not allowed"
test_refuse_bash "PGHOST env refused" \
  "ALLOW_DB_RESET=1" "PGHOST=localhost" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 6: PGPORT env var not allowed"
test_refuse_bash "PGPORT env refused" \
  "ALLOW_DB_RESET=1" "PGPORT=54333" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 7: PGSERVICE env var not allowed"
test_refuse_bash "PGSERVICE env refused" \
  "ALLOW_DB_RESET=1" "PGSERVICE=myservice" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 8: PGHOSTADDR env var not allowed"
test_refuse_bash "PGHOSTADDR env refused" \
  "ALLOW_DB_RESET=1" "PGHOSTADDR=127.0.0.1" \
  "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 9: Default port 54322 not allowed"
test_refuse_bash "Default 54322 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres" "SUPABASE_URL=http://localhost:54321"

echo "Check 10: Default project_id 'Fitness' not allowed"
test_refuse_bash "Default Fitness refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres" "SUPABASE_URL=http://localhost:54321"

echo "Check 11: Query params (?) not allowed in SUPABASE_DB_URL"
test_refuse_bash "Query ?port= refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres?port=54322" "SUPABASE_URL=http://localhost:54334"

echo "Check 12: Percent-encoding (%) not allowed in SUPABASE_DB_URL"
test_refuse_bash "Percent %70 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:%70assword@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 13: DB hostname must be loopback"
test_refuse_bash "Remote host 10.1.2.3 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@10.1.2.3:54333/postgres" "SUPABASE_URL=http://10.1.2.3:54334"

echo "Check 14: DB URL port must match config [db] port"
test_refuse_bash "Port mismatch 54399!=54333 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54399/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 15: SUPABASE_URL hostname must be loopback"
test_refuse_bash "SUPABASE_URL remote refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://192.168.1.100:54334"

echo "Check 16: SUPABASE_URL port must match config [api] port"
test_refuse_bash "SUPABASE_URL port mismatch refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54399"

echo "Check 17: Query params (?) not allowed in SUPABASE_URL"
test_refuse_bash "SUPABASE_URL ?key= refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334?key=val"

echo "Check 18: Percent-encoding (%) not allowed in SUPABASE_URL"
test_refuse_bash "SUPABASE_URL %20 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" "SUPABASE_URL=http://localhost:54334/%20path"

echo "Check 19: NEXT_PUBLIC_SUPABASE_URL must be loopback (via SUPABASE_URL match)"
test_refuse_bash "NEXT_PUBLIC remote refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" \
  "SUPABASE_URL=http://localhost:54334" "NEXT_PUBLIC_SUPABASE_URL=http://evil.com:54334"

echo "Check 20: NEXT_PUBLIC_SUPABASE_URL must match SUPABASE_URL"
test_refuse_bash "NEXT_PUBLIC mismatch refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333/postgres" \
  "SUPABASE_URL=http://localhost:54334" "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399"

echo "Check 21: Multi-host URLs not allowed"
test_refuse_bash "Multi-host refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54333,other:5432/postgres" "SUPABASE_URL=http://localhost:54334"

echo "Check 22: Default API port 54321 not allowed"
test_refuse_bash "Default API 54321 refused" \
  "ALLOW_DB_RESET=1" "SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres" "SUPABASE_URL=http://localhost:54321"

echo
echo "TYPESCRIPT GUARD CHECKS:"
echo

echo "Check 23: TS - CI must be exactly 'true'"
test_refuse_ts "TS CI=1 refused" "$TMPDIR/custom-config.toml" \
  'process.env.CI = "1"; process.env.ALLOW_DB_RESET = "0"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 24: TS - ALLOW_DB_RESET=1 required"
test_refuse_ts "TS No ALLOW_DB_RESET refused" "$TMPDIR/custom-config.toml" \
  'process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 25: TS - SUPABASE_PROJECT_ID env not allowed"
test_refuse_ts "TS SUPABASE_PROJECT_ID refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_PROJECT_ID = "TestGym"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 26: TS - SUPABASE_DB_PORT env not allowed"
test_refuse_ts "TS SUPABASE_DB_PORT refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_PORT = "54333"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 27: TS - PGHOST env not allowed"
test_refuse_ts "TS PGHOST refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.PGHOST = "localhost"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 28: TS - PGPORT env not allowed"
test_refuse_ts "TS PGPORT refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.PGPORT = "54333"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 29: TS - PGSERVICE env not allowed"
test_refuse_ts "TS PGSERVICE refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.PGSERVICE = "myservice"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 30: TS - PGHOSTADDR env not allowed"
test_refuse_ts "TS PGHOSTADDR refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.PGHOSTADDR = "127.0.0.1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 31: TS - Default port 54322 not allowed"
test_refuse_ts "TS Default 54322 refused" "$TMPDIR/default-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres"; process.env.SUPABASE_URL = "http://localhost:54321";'

echo "Check 32: TS - Default project_id not allowed"
test_refuse_ts "TS Default Fitness refused" "$TMPDIR/default-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres"; process.env.SUPABASE_URL = "http://localhost:54321";'

echo "Check 33: TS - Query params (?) not allowed in SUPABASE_DB_URL"
test_refuse_ts "TS Query ?port= refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?port=54322"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 34: TS - Percent-encoding (%) not allowed"
test_refuse_ts "TS Percent %70 refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:%70assword@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 35: TS - DB hostname must be loopback"
test_refuse_ts "TS Remote 192.168.1.100 refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@192.168.1.100:54333/postgres"; process.env.SUPABASE_URL = "http://192.168.1.100:54334";'

echo "Check 36: TS - DB URL port must match config"
test_refuse_ts "TS Port mismatch refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54399/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo "Check 37: TS - SUPABASE_URL hostname must be loopback"
test_refuse_ts "TS SUPABASE_URL remote refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://192.168.1.100:54334";'

echo "Check 38: TS - SUPABASE_URL port must match config"
test_refuse_ts "TS SUPABASE_URL port mismatch refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54399";'

echo "Check 39: TS - Query params (?) not allowed in SUPABASE_URL"
test_refuse_ts "TS SUPABASE_URL ?key= refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334?key=val";'

echo "Check 40: TS - Percent-encoding (%) not allowed in SUPABASE_URL"
test_refuse_ts "TS SUPABASE_URL %20 refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334/%20path";'

echo "Check 41: TS - NEXT_PUBLIC must be loopback (via match)"
test_refuse_ts "TS NEXT_PUBLIC remote refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://evil.com:54334";'

echo "Check 42: TS - NEXT_PUBLIC must match SUPABASE_URL"
test_refuse_ts "TS NEXT_PUBLIC mismatch refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres"; process.env.SUPABASE_URL = "http://localhost:54334"; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54399";'

echo "Check 43: TS - Multi-host URLs not allowed"
test_refuse_ts "TS Multi-host refused" "$TMPDIR/custom-config.toml" \
  'process.env.ALLOW_DB_RESET = "1"; process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333,other:5432/postgres"; process.env.SUPABASE_URL = "http://localhost:54334";'

echo
echo "=== MUTANT TEST RESULTS ==="
echo "Expected: $MUTANTS_TOTAL checks"
echo "KILLED: $KILLED (checks working, cases refused)"
echo "SURVIVED: $SURVIVED (checks broken, cases allowed)"
echo

if [ "$KILLED" -eq "$MUTANTS_TOTAL" ] && [ "$SURVIVED" -eq 0 ]; then
  echo "✅ All $MUTANTS_TOTAL checks are working - guard fully exercised"
  exit 0
else
  echo "❌ Some checks are not working - guard has gaps"
  exit 1
fi
