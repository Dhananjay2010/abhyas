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

echo "TEST: Bash guard - CI=true always allows"
CI=true ALLOW_DB_RESET=0 SUPABASE_DB_URL="" SUPABASE_PROJECT_ID="Fitness"
if check_db_reset_guard_bash check; then
  check "CI=true allows" "0" "0"
else
  check "CI=true allows" "0" "1"
fi
echo

echo "TEST: Bash guard - Missing ALLOW_DB_RESET refuses"
CI="" ALLOW_DB_RESET="" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_PROJECT_ID="TestGym"
if check_db_reset_guard_bash check; then
  check "No ALLOW_DB_RESET refuses" "1" "0"
else
  check "No ALLOW_DB_RESET refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Default port refuses even with ALLOW_DB_RESET=1"
CI="" ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres" SUPABASE_PROJECT_ID="NonDefault"
if check_db_reset_guard_bash check; then
  check "Default port refuses" "1" "0"
else
  check "Default port refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Default project_id refuses even with ALLOW_DB_RESET=1"
CI="" ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_PROJECT_ID="Fitness"
if check_db_reset_guard_bash check; then
  check "Default project_id refuses" "1" "0"
else
  check "Default project_id refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Non-default port + project_id allows with ALLOW_DB_RESET=1"
CI="" ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_PROJECT_ID="TestGym"
if check_db_reset_guard_bash check; then
  check "Non-default allows" "0" "0"
else
  check "Non-default allows" "0" "1"
fi
echo

echo "TEST: Bash guard - Missing SUPABASE_DB_URL refuses"
CI="" ALLOW_DB_RESET="1" SUPABASE_DB_URL="" SUPABASE_PROJECT_ID="TestGym"
if check_db_reset_guard_bash check; then
  check "Missing SUPABASE_DB_URL refuses" "1" "0"
else
  check "Missing SUPABASE_DB_URL refuses" "1" "1"
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

console.log("TypeScript guard - Default host/port refuses");
process.env.ALLOW_DB_RESET = "1";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PROJECT_ID = "NonDefault";
check("Default host/port refuses", false, checkDbResetGuard().allow);
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
