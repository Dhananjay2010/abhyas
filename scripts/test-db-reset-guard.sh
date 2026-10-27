#!/usr/bin/env bash
set -euo pipefail

# Pure tests for db-reset-guard logic (bash and TypeScript)
# NO database operations, NO exec, NO network calls
# Just test the pure decision functions

echo "=== Pure DB Reset Guard Tests ==="
echo

FAILURES=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $label"
  else
    echo "  ✗ $label (expected: $expected, got: $actual)"
    FAILURES=$((FAILURES + 1))
  fi
}

# Source the bash guard
source "$(dirname "$0")/lib-db-reset-guard.sh"

# Create a temp directory with test config files
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Default config (Fitness, port 54322)
cat > "$TMPDIR/default-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54322
EOF

# Non-default config (TestGym, port 54333)
cat > "$TMPDIR/custom-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54333
EOF

echo "TEST: Bash guard - CI=true always allows"
CI=true ALLOW_DB_RESET=0 SUPABASE_DB_URL="" SUPABASE_PROJECT_ID="Fitness"
if check_db_reset_guard_bash check "$TMPDIR/default-config.toml"; then
  check "CI=true allows (ignores config)" "0" "0"
else
  check "CI=true allows (ignores config)" "0" "1"
fi
unset CI
echo

echo "TEST: Bash guard - Missing ALLOW_DB_RESET refuses"
ALLOW_DB_RESET="" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_PROJECT_ID="TestGym"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "No ALLOW_DB_RESET refuses" "1" "0"
else
  check "No ALLOW_DB_RESET refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Default port in config refuses"
ALLOW_DB_RESET="1" SUPABASE_PROJECT_ID="NonDefault"
if check_db_reset_guard_bash check "$TMPDIR/default-config.toml"; then
  check "Default port refuses (config.toml port=54322)" "1" "0"
else
  check "Default port refuses (config.toml port=54322)" "1" "1"
fi
echo

echo "TEST: Bash guard - Default project_id in config refuses"
ALLOW_DB_RESET="1" SUPABASE_PROJECT_ID="SomethingElse"
cat > "$TMPDIR/test1-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54333
EOF
if check_db_reset_guard_bash check "$TMPDIR/test1-config.toml"; then
  check "Default project_id refuses (config.toml project_id=Fitness)" "1" "0"
else
  check "Default project_id refuses (config.toml project_id=Fitness)" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_PROJECT_ID env var is IGNORED (no bypass)"
# This is the bypass scenario: user sets SUPABASE_PROJECT_ID=TestGym in env,
# but config.toml has Fitness. Guard must refuse based on config.toml.
ALLOW_DB_RESET="1" SUPABASE_PROJECT_ID="TestGym" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
if check_db_reset_guard_bash check "$TMPDIR/default-config.toml"; then
  check "SUPABASE_PROJECT_ID=TestGym env ignored, config has Fitness -> refuses" "1" "0"
else
  check "SUPABASE_PROJECT_ID=TestGym env ignored, config has Fitness -> refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL port must match config.toml port"
# Another bypass: user sets SUPABASE_DB_URL to :54333, but config.toml has port 54322
# Guard must refuse because they don't match (reset will hit 54322, but user thinks it's 54333)
ALLOW_DB_RESET="1" SUPABASE_PROJECT_ID="Ignored" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
cat > "$TMPDIR/test2-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54322
EOF
if check_db_reset_guard_bash check "$TMPDIR/test2-config.toml"; then
  check "SUPABASE_DB_URL port mismatch refuses (URL=54333, config=54322)" "1" "0"
else
  check "SUPABASE_DB_URL port mismatch refuses (URL=54333, config=54322)" "1" "1"
fi
echo

echo "TEST: Bash guard - Non-default config with matching URL allows"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "Non-default allows (config port=54333, URL port=54333)" "0" "0"
else
  check "Non-default allows (config port=54333, URL port=54333)" "0" "1"
fi
echo

echo "TEST: Bash guard - Missing config file refuses"
ALLOW_DB_RESET="1"
if check_db_reset_guard_bash check "$TMPDIR/nonexistent.toml"; then
  check "Missing config file refuses" "1" "0"
else
  check "Missing config file refuses" "1" "1"
fi
echo

echo "TEST: TypeScript guard - Run via tsx"
# Test the TypeScript guard
npx tsx << 'TSTEST'
import { checkDbResetGuard, checkRealDbTest } from "./scripts/lib-db-reset-guard";

let failures = 0;

function check(label: string, expected: boolean, actual: boolean) {
  if (expected === actual) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label} (expected: ${expected}, got: ${actual})`);
    failures++;
  }
}

console.log("TypeScript guard - CI=true allows");
process.env.CI = "true";
process.env.ALLOW_DB_RESET = "0";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PROJECT_ID = "Fitness";
check("CI=true allows", true, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - Missing ALLOW_DB_RESET refuses");
delete process.env.CI;
delete process.env.ALLOW_DB_RESET;
process.env.SUPABASE_URL = "http://localhost:54333";
process.env.SUPABASE_PROJECT_ID = "TestGym";
check("No ALLOW_DB_RESET refuses", false, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - Default host/port refuses (localhost:54321)");
process.env.ALLOW_DB_RESET = "1";
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_PROJECT_ID = "NonDefault";
check("Default localhost:54321 refuses", false, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - Default host/port refuses (127.0.0.1:54321)");
process.env.ALLOW_DB_RESET = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PROJECT_ID = "NonDefault";
check("Default 127.0.0.1:54321 refuses", false, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - Default project refuses");
process.env.ALLOW_DB_RESET = "1";
process.env.SUPABASE_URL = "http://localhost:54333";
process.env.SUPABASE_PROJECT_ID = "Fitness";
check("Default project refuses", false, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - Non-default allows");
process.env.ALLOW_DB_RESET = "1";
process.env.SUPABASE_URL = "http://localhost:54333";
process.env.SUPABASE_PROJECT_ID = "TestGym";
check("Non-default allows", true, checkDbResetGuard().allow);
console.log();

console.log("TypeScript guard - REAL_DB=1 required");
delete process.env.REAL_DB;
check("REAL_DB unset refuses", false, checkRealDbTest().allow);
process.env.REAL_DB = "1";
process.env.CI = "true";
check("REAL_DB=1 + CI allows", true, checkRealDbTest().allow);
console.log();

if (failures > 0) {
  console.error(`\n❌ ${failures} TypeScript test(s) failed\n`);
  process.exit(1);
}
console.log("✅ All TypeScript tests passed\n");
TSTEST
echo

if [ $FAILURES -gt 0 ]; then
  echo "❌ $FAILURES bash test(s) failed"
  exit 1
fi

echo "✅ All tests passed"
exit 0
