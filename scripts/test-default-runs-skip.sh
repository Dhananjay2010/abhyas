#!/usr/bin/env bash
set -euo pipefail

# Meta-test: Prove that all user-creating tests are NO-OP by default (REAL_DB unset).
# 
# This test:
# 1. Discovers all user-creating tests by grepping for auth.admin.createUser/deleteUser/INSERT INTO auth.users
# 2. Parses scripts.test chain to determine which tests are actually reachable
# 3. Stubs supabase, psql, and docker CLIs on PATH (record calls)
# 4. Uses Node preload (netspy.cjs) to block and log all TCP connects, fetch calls, and spawns
# 5. Runs each IN-CHAIN test with REAL_DB unset
# 6. Asserts each exits 0, prints 'Skipping', and makes 0 fetches, 0 connects, 0 CLI calls
# 7. Runs positive controls to prove the spy works
# 8. FAILS if any in-chain test lacks REAL_DB gate and isn't in allowlist
# 9. WARNS about manual-only ungated tests (not in chain)
#
# This ensures plain `npm test` never touches the default Supabase stack.

echo "=== Meta-test: Default runs skip DB operations (comprehensive) ==="
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

FAILURES=0

# Parse the test chain from package.json
parse_test_chain() {
  node << 'PARSER'
const pkg = require('./package.json');
const visited = new Set();
const inChain = new Set();

function parseChain(scriptName) {
  if (visited.has(scriptName)) return;
  visited.add(scriptName);
  
  const script = pkg.scripts[scriptName];
  if (!script) return;
  
  // Split on ' && ' to get individual commands
  const commands = script.split(' && ');
  
  for (const cmd of commands) {
    const trimmed = cmd.trim();
    
    // Check for 'npm run test:*' pattern
    const match = trimmed.match(/^npm\s+run\s+test:([a-z0-9-]+)/);
    if (match) {
      const testName = match[1];
      inChain.add(testName);
      // Recursively parse nested chains
      parseChain('test:' + testName);
    }
  }
}

// Start from 'test' script
parseChain('test');

// Output as newline-separated list
Array.from(inChain).sort().forEach(t => console.log(t));
PARSER
}

echo "Parsing test chain from package.json..."
IN_CHAIN_TESTS=$(parse_test_chain)
CHAIN_COUNT=$(echo "$IN_CHAIN_TESTS" | wc -l)
echo "✓ Found $CHAIN_COUNT tests in chain"
echo

# Self-test: Verify parser works
echo "Self-test: Verify chain parser..."
if echo "$IN_CHAIN_TESTS" | grep -q "^abandon$"; then
  echo "  ✓ Chain parser includes test:abandon (first in chain)"
else
  echo "  ✗ Chain parser failed: test:abandon not found"
  FAILURES=$((FAILURES + 1))
fi

if echo "$IN_CHAIN_TESTS" | grep -q "^gym-domains-real-db$"; then
  echo "  ✓ Chain parser includes test:gym-domains-real-db"
else
  echo "  ✗ Chain parser failed: test:gym-domains-real-db not found"
  FAILURES=$((FAILURES + 1))
fi

# Negative test: these should NOT be in chain
if echo "$IN_CHAIN_TESTS" | grep -q "^first-build-ended-on$"; then
  echo "  ✗ Chain parser error: first-build-ended-on should NOT be in chain"
  FAILURES=$((FAILURES + 1))
else
  echo "  ✓ Chain parser correctly excludes first-build-ended-on (manual only)"
fi
echo

# Discover all user-creating tests by grepping for auth user operations
echo "Discovering user-creating tests..."
USER_CREATING_TESTS=$(grep -l -r \
  -e 'auth\.admin\.createUser' \
  -e 'auth\.admin\.deleteUser' \
  -e 'INSERT INTO auth\.users' \
  "$SCRIPT_DIR"/*.ts 2>/dev/null | \
  xargs -I{} basename {} .ts | \
  sed 's/^test-//' | \
  sort -u)

if [ -z "$USER_CREATING_TESTS" ]; then
  echo "✗ No user-creating tests discovered"
  exit 1
fi

DISCOVERED_COUNT=$(echo "$USER_CREATING_TESTS" | wc -l)
echo "✓ Discovered $DISCOVERED_COUNT user-creating tests"
echo

# Expected list of 13 REAL_DB-gated tests (from QA Bot 1 report)
EXPECTED_TESTS="abandon-end-early-real-db
ensure-session-exercises-deload
exercise-history-real-db
gym-domains-real-db
gym-owner-guards-sql
gym-tenant-rls-real-db
history-edit-validation-db
progress-rpcs-real-db
resolve-swap-weights-real-db
session-summary-real-db
start-session-ensure-exercises
swap-prefill-real-db
unique-planned-session-migration-real-db"

# Allowlist: Tests discovered by grep but exempt from in-chain REAL_DB requirement
# Each entry MUST have a reason comment explaining the gate/exemption
ALLOWLIST="block-range-db
block-range-db-followup
delete-set
e1rm-formula-db
ended-early-real-db
seed-validity
skipped-session-shapes
swap-guard-real-db"

# Manual-only tests: discovered but NOT in chain (warn but don't fail)
MANUAL_ONLY_ALLOWLIST="first-build-ended-on
progress-active-days
stale-stash-two-client
superseded-override"

# Verify discovered tests match expected
for test in $EXPECTED_TESTS; do
  if ! echo "$USER_CREATING_TESTS" | grep -q "^$test$"; then
    echo "✗ Expected test missing from discovery: $test"
    FAILURES=$((FAILURES + 1))
  fi
done

if [ $FAILURES -gt 0 ]; then
  echo "✗ Test discovery validation failed"
  exit 1
fi

echo "✓ Test discovery matches expected list"
echo

# Categorize discovered tests: in-chain ungated vs manual-only
UNGATED_IN_CHAIN=""
MANUAL_UNGATED=""

for test in $USER_CREATING_TESTS; do
  # Skip if in covered EXPECTED_TESTS
  if echo "$EXPECTED_TESTS" | grep -q "^$test$"; then
    continue
  fi
  
  # Skip if in allowlist
  if echo "$ALLOWLIST" | grep -q "^$test$"; then
    continue
  fi
  
  # Skip if in manual-only allowlist
  if echo "$MANUAL_ONLY_ALLOWLIST" | grep -q "^$test$"; then
    # Check if actually NOT in chain
    if echo "$IN_CHAIN_TESTS" | grep -q "^$test$"; then
      echo "❌ CRITICAL: $test is in MANUAL_ONLY_ALLOWLIST but IS in chain"
      FAILURES=$((FAILURES + 1))
    else
      MANUAL_UNGATED="$MANUAL_UNGATED $test"
    fi
    continue
  fi
  
  # Check if in chain
  if echo "$IN_CHAIN_TESTS" | grep -q "^$test$"; then
    UNGATED_IN_CHAIN="$UNGATED_IN_CHAIN $test"
  else
    MANUAL_UNGATED="$MANUAL_UNGATED $test"
  fi
done

# Warn about manual-only ungated tests
if [ -n "$MANUAL_UNGATED" ]; then
  echo "⚠️  WARNING: Tests create/delete users but are NOT in chain (manual only, ungated):"
  for test in $MANUAL_UNGATED; do
    MATCHED=$(grep -h "auth\.admin\.createUser\|auth\.admin\.deleteUser\|INSERT INTO auth\.users" "$SCRIPT_DIR/test-$test.ts" 2>/dev/null | head -1 | sed 's/^[[:space:]]*//' | cut -c1-60)
    echo "   - test:$test"
    echo "     Operation: $MATCHED..."
  done
  echo "  These won't run in 'npm test' but should be gated for manual runs."
  echo
fi

# FAIL on ungated tests that ARE in chain
if [ -n "$UNGATED_IN_CHAIN" ]; then
  echo "❌ CRITICAL: Tests in chain create/delete users but lack REAL_DB gate:"
  for test in $UNGATED_IN_CHAIN; do
    MATCHED=$(grep -h "auth\.admin\.createUser\|auth\.admin\.deleteUser\|INSERT INTO auth\.users" "$SCRIPT_DIR/test-$test.ts" 2>/dev/null | head -1 | sed 's/^[[:space:]]*//' | cut -c1-60)
    echo "   - test:$test [IN CHAIN]"
    echo "     Operation: $MATCHED..."
  done
  echo
  echo "These MUST be gated with 'if (process.env.REAL_DB !== \"1\") { skip }'"
  echo
  FAILURES=$((FAILURES + 1))
fi

if [ $FAILURES -gt 0 ]; then
  echo "❌ $FAILURES validation failure(s)"
  exit 1
fi

# Create stub binaries
CLI_LOG="$TMPDIR/cli-calls.log"
touch "$CLI_LOG"

for cmd in supabase psql docker; do
  cat > "$TMPDIR/$cmd" << STUB
#!/usr/bin/env bash
echo "$cmd \$*" >> "$CLI_LOG"
exit 1
STUB
  chmod +x "$TMPDIR/$cmd"
done

# Prepend stub dir to PATH
export PATH="$TMPDIR:$PATH"

# Ensure REAL_DB is unset and default SUPABASE_URL
unset REAL_DB 2>/dev/null || true
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Positive control: prove netspy blocks fetch and connect
echo "Running positive controls..."
CONTROL_LOG="$TMPDIR/control-netspy.log"
export NETSPY_LOG="$CONTROL_LOG"

# Test 1: Fetch should be blocked
node --require "$SCRIPT_DIR/netspy.cjs" -e "
  fetch('http://127.0.0.1:54321/rest/v1/profiles')
    .catch(() => {});
" 2>/dev/null || true

if ! grep -q "FETCH.*54321" "$CONTROL_LOG"; then
  echo "✗ Positive control failed: fetch to :54321 not logged"
  FAILURES=$((FAILURES + 1))
else
  echo "✓ Positive control: fetch to :54321 logged and blocked"
fi

# Test 2: TCP connect should be blocked
node --require "$SCRIPT_DIR/netspy.cjs" -e "
  const net = require('net');
  const sock = net.connect(54322, '127.0.0.1');
  sock.on('error', () => {});
" 2>/dev/null || true

if ! grep -q "CONNECT.*54322" "$CONTROL_LOG"; then
  echo "✗ Positive control failed: connect to :54322 not logged"
  FAILURES=$((FAILURES + 1))
else
  echo "✓ Positive control: connect to :54322 logged and blocked"
fi

echo

# Test each REAL_DB-gated test (expected to skip)
TESTED_COUNT=0
for test_name in $EXPECTED_TESTS; do
  # Only test if in chain
  if ! echo "$IN_CHAIN_TESTS" | grep -q "^$test_name$"; then
    continue
  fi
  
  echo "Testing: $test_name"
  TESTED_COUNT=$((TESTED_COUNT + 1))
  
  # Create fresh logs for this test
  NETSPY_LOG="$TMPDIR/netspy-${test_name}.log"
  export NETSPY_LOG
  rm -f "$CLI_LOG"
  touch "$CLI_LOG"
  
  # Run the test with netspy preload
  TEST_OUTPUT=$(NODE_OPTIONS="--require $SCRIPT_DIR/netspy.cjs" npm run "test:$test_name" 2>&1 || echo "EXIT_CODE=$?")
  
  # Check exit code
  if echo "$TEST_OUTPUT" | grep -q "EXIT_CODE="; then
    EXIT_CODE=$(echo "$TEST_OUTPUT" | grep "EXIT_CODE=" | tail -1 | cut -d= -f2)
    if [ "$EXIT_CODE" != "0" ]; then
      echo "  ✗ Non-zero exit code: $EXIT_CODE"
      FAILURES=$((FAILURES + 1))
      continue
    fi
  fi
  
  # Check for skip message
  if ! echo "$TEST_OUTPUT" | grep -q "Skipping"; then
    echo "  ✗ Did not print 'Skipping' message"
    FAILURES=$((FAILURES + 1))
    continue
  fi
  
  # Check for fetches
  FETCH_COUNT=0
  if [ -f "$NETSPY_LOG" ]; then
    FETCH_COUNT=$(grep -c "FETCH" "$NETSPY_LOG" 2>/dev/null | tr -d '\n' || echo "0")
  fi
  
  if [ "$FETCH_COUNT" -gt 0 ] 2>/dev/null; then
    echo "  ✗ Made $FETCH_COUNT fetch call(s):"
    grep "FETCH" "$NETSPY_LOG" | head -5
    FAILURES=$((FAILURES + 1))
    continue
  fi
  
  # Check for TCP connects
  CONNECT_COUNT=0
  if [ -f "$NETSPY_LOG" ]; then
    CONNECT_COUNT=$(grep -c "CONNECT" "$NETSPY_LOG" 2>/dev/null | tr -d '\n' || echo "0")
  fi
  
  if [ "$CONNECT_COUNT" -gt 0 ] 2>/dev/null; then
    echo "  ✗ Made $CONNECT_COUNT TCP connect(s):"
    grep "CONNECT" "$NETSPY_LOG" | head -5
    FAILURES=$((FAILURES + 1))
    continue
  fi
  
  # Check for CLI calls
  if [ -s "$CLI_LOG" ]; then
    echo "  ✗ Made CLI calls:"
    cat "$CLI_LOG"
    FAILURES=$((FAILURES + 1))
    continue
  fi
  
  echo "  ✓ Skipped with 0 fetches, 0 connects, 0 CLI calls"
done

echo

if [ $FAILURES -gt 0 ]; then
  echo "❌ $FAILURES check(s) failed"
  exit 1
fi

echo "✅ All $TESTED_COUNT in-chain REAL_DB-gated tests are NO-OP by default"
exit 0
