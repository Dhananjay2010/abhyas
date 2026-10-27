#!/usr/bin/env bash
set -euo pipefail

# Unit tests for DB reset guard logic (both bash and TypeScript)
# Verifies the guard refuses unless CI=true OR ALLOW_DB_RESET=1 + non-default config

echo "=== Testing DB Reset Guard ==="
echo

total_tests=0
passed_tests=0

run_test() {
  local name="$1"
  local expected="$2"
  shift 2
  
  total_tests=$((total_tests + 1))
  echo "TEST: $name"
  
  # Run the command and capture exit code
  set +e
  "$@" > /tmp/guard-test-output.txt 2>&1
  local exit_code=$?
  set -e
  
  local output=$(cat /tmp/guard-test-output.txt)
  
  if [ "$expected" = "refuse" ]; then
    if echo "$output" | grep -qE "destroys local data|deletes users|affects local data|requires a non-default"; then
      echo "  ✓ Correctly refused"
      passed_tests=$((passed_tests + 1))
    else
      echo "  ✗ Expected refusal but got exit_code=$exit_code"
      echo "Output: $output" | head -3
    fi
  elif [ "$expected" = "allow" ]; then
    # For bash: should pass the guard and reach "Check we're in the repo root" or later
    # For TypeScript: should pass the guard and reach "Checking Supabase connection" or skip message
    # Or fail because Supabase isn't running (which means guard passed)
    if echo "$output" | grep -qE "Checking Supabase connection|Skipping real DB tests|ALLOW_DB_RESET=1 with non-default|repo root|Supabase not running"; then
      echo "  ✓ Correctly allowed (passed guard)"
      passed_tests=$((passed_tests + 1))
    else
      echo "  ✗ Expected to pass guard but didn't"
      echo "Output: $output" | head -3
    fi
  fi
  echo
}

# TEST 1: Bash script refuses without CI or ALLOW_DB_RESET
export REAL_DB=1
unset CI
unset ALLOW_DB_RESET
run_test "Bash: refuse without CI or ALLOW_DB_RESET" "refuse" \
  bash scripts/mutant-test-gym-domains.sh

# TEST 2: Bash script refuses with ALLOW_DB_RESET=1 but default config
export ALLOW_DB_RESET=1
unset SUPABASE_DB_URL
# Keep default project_id in supabase/config.toml
run_test "Bash: refuse with ALLOW_DB_RESET=1 but default project/port" "refuse" \
  bash scripts/mutant-test-gym-domains.sh

# TEST 3: Bash script allows with CI=true
export CI=true
unset ALLOW_DB_RESET
run_test "Bash: allow with CI=true" "allow" \
  bash scripts/mutant-test-gym-domains.sh

# TEST 4: Bash script allows with ALLOW_DB_RESET=1 and non-default port
unset CI
export ALLOW_DB_RESET=1
export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
run_test "Bash: allow with ALLOW_DB_RESET=1 and non-default port (54333)" "allow" \
  bash scripts/mutant-test-gym-domains.sh

# TEST 5: TypeScript script refuses without CI or ALLOW_DB_RESET
unset SUPABASE_DB_URL
export REAL_DB=1
unset CI
unset ALLOW_DB_RESET
run_test "TypeScript: refuse without CI or ALLOW_DB_RESET" "refuse" \
  npx tsx scripts/test-gym-domains-real-db.ts

# TEST 6: TypeScript script refuses with ALLOW_DB_RESET=1 but default config
export ALLOW_DB_RESET=1
unset SUPABASE_DB_URL
unset SUPABASE_PROJECT_ID
run_test "TypeScript: refuse with ALLOW_DB_RESET=1 but default project/port" "refuse" \
  npx tsx scripts/test-gym-domains-real-db.ts

# TEST 7: TypeScript script allows with CI=true
export CI=true
unset ALLOW_DB_RESET
run_test "TypeScript: allow with CI=true" "allow" \
  npx tsx scripts/test-gym-domains-real-db.ts

# TEST 8: TypeScript script allows with ALLOW_DB_RESET=1 and non-default port
unset CI
export ALLOW_DB_RESET=1
export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
run_test "TypeScript: allow with ALLOW_DB_RESET=1 and non-default port (54333)" "allow" \
  npx tsx scripts/test-gym-domains-real-db.ts

# TEST 9: TypeScript script allows with ALLOW_DB_RESET=1 and non-default project
unset SUPABASE_DB_URL
export SUPABASE_PROJECT_ID="my-custom-project"
run_test "TypeScript: allow with ALLOW_DB_RESET=1 and non-default project" "allow" \
  npx tsx scripts/test-gym-domains-real-db.ts

echo "========================================="
echo "Guard Test Summary"
echo "========================================="
echo "Total:  $total_tests"
echo "Passed: $passed_tests"
echo "Failed: $((total_tests - passed_tests))"
echo "========================================="
echo

if [ $passed_tests -ne $total_tests ]; then
  echo "❌ Some guard tests failed"
  exit 1
fi

echo "✅ All guard tests passed"
exit 0
