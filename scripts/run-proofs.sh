#!/bin/bash
# Proof script: verify tests catch production code breaks
# Each proof breaks production code, runs tests, captures failing assertion, reverts

set -e

PROOF_LOG="/tmp/proofs.md"
echo "# Proof Results" > "$PROOF_LOG"
echo "" >> "$PROOF_LOG"
echo "| Break ID | File:Line | Failing Test | Assertion Message | Caught |" >> "$PROOF_LOG"
echo "|----------|-----------|--------------|-------------------|--------|" >> "$PROOF_LOG"

run_proof() {
  local break_id="$1"
  local file="$2"
  local line="$3"
  local old_code="$4"
  local new_code="$5"
  local test_script="$6"
  
  echo "Testing $break_id..."
  
  # Apply break
  sed -i "${line}s|${old_code}|${new_code}|" "$file"
  
  # Run test and capture output
  if OUTPUT=$(npm run "$test_script" 2>&1); then
    RESULT="NO - test passed when it should fail"
    FAILING_TEST=""
    ASSERTION=""
  else
    # Extract first FAIL line
    FAILING_TEST=$(echo "$OUTPUT" | grep -m 1 "FAIL" | sed 's/^[ \t]*FAIL[ \t]*//' || echo "Test failed")
    ASSERTION=$(echo "$OUTPUT" | grep -A 2 "FAIL" | head -3 | tail -1 || echo "See output")
    RESULT="YES"
  fi
  
  # Revert
  git checkout "$file"
  
  # Log result
  echo "| $break_id | $file:$line | $FAILING_TEST | $ASSERTION | $RESULT |" >> "$PROOF_LOG"
}

cd /workspace

# Proof 1: HIGH first/last-set bug
run_proof \
  "first-last-set" \
  "src/lib/session/close-stale.ts" \
  "201" \
  "lastSetCompletedAt: lastSetCompletedAt.get(id)" \
  "lastSetCompletedAt: firstSetCompletedAt.get(id)" \
  "test:timezone-session-stale"

# Proof 2: null-started_at-no-sets not closed
run_proof \
  "null-no-sets" \
  "src/lib/session/close-stale.ts" \
  "228" \
  "if (!firstSetTime) {" \
  "if (false) {" \
  "test:timezone-session-stale"

# Proof 3: duration not capped
run_proof \
  "duration-cap" \
  "src/lib/session/close-stale.ts" \
  "208" \
  "const cappedDuration = Math.min" \
  "const cappedDuration = Math.max" \
  "test:timezone-session-stale"

echo ""
echo "Proof results written to $PROOF_LOG"
cat "$PROOF_LOG"
