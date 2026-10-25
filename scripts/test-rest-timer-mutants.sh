#!/bin/bash
# Test rest timer mutants
# Each mutant should make the test fail

set -e

cd "$(dirname "$0")/.."

echo "Testing rest timer persistence mutants"
echo "========================================"
echo

RUNNER_FILE="src/app/session/[id]/session-runner.tsx"
PERSISTENCE_FILE="src/lib/session/rest-timer-persistence.ts"

# Backup files
cp "$RUNNER_FILE" "$RUNNER_FILE.backup"
cp "$PERSISTENCE_FILE" "$PERSISTENCE_FILE.backup"

cleanup() {
  echo "Restoring files..."
  mv "$RUNNER_FILE.backup" "$RUNNER_FILE"
  mv "$PERSISTENCE_FILE.backup" "$PERSISTENCE_FILE"
}

trap cleanup EXIT

# MUTANT 1: Remove saveRest call from startRest
echo "MUTANT 1: Remove saveRest call from startRest"
echo "----------------------------------------------"
sed -i 's/restPersistence\.save(current\.id, current\.sets\.length + 1, endsAt);/\/\/ MUTANT: restPersistence.save removed/' "$RUNNER_FILE"

if npx tsx scripts/test-rest-timer-reload.tsx 2>&1 | grep -q "✅ All tests passed"; then
  echo "❌ MUTANT 1 SURVIVED - Test should have failed!"
  echo
else
  echo "✅ MUTANT 1 KILLED - Test failed as expected"
  echo
fi

# Restore for next mutant
cp "$RUNNER_FILE.backup" "$RUNNER_FILE"

# MUTANT 2: Remove restore on mount
echo "MUTANT 2: Remove restore on mount"
echo "-----------------------------------"
sed -i '/\/\/ Restore rest timer on mount/,/}, \[\]\); \/\/ Run once on mount/d' "$RUNNER_FILE"

if npx tsx scripts/test-rest-timer-reload.tsx 2>&1 | grep -q "✅ All tests passed"; then
  echo "❌ MUTANT 2 SURVIVED - Test should have failed!"
  echo
else
  echo "✅ MUTANT 2 KILLED - Test failed as expected"
  echo
fi

# Restore for next mutant
cp "$RUNNER_FILE.backup" "$RUNNER_FILE"

# MUTANT 3: Drop future check in loadRest
echo "MUTANT 3: Drop future check in loadRest (restEndsAt > now())"
echo "------------------------------------------------------------"
sed -i 's/parsed\.restEndsAt > now()/true/' "$PERSISTENCE_FILE"

if npx tsx scripts/test-rest-timer-reload.tsx 2>&1 | grep -q "✅ All tests passed"; then
  echo "❌ MUTANT 3 SURVIVED - Test should have failed!"
  echo
else
  echo "✅ MUTANT 3 KILLED - Test failed as expected"
  echo
fi

# Restore for next mutant
cp "$PERSISTENCE_FILE.backup" "$PERSISTENCE_FILE"

# MUTANT 4: Drop clearRest on Skip
echo "MUTANT 4: Drop clearRest on Skip button"
echo "----------------------------------------"
sed -i '/onClick={() => {/{N;N;/restPersistence\.clear()/d;}' "$RUNNER_FILE"

if npx tsx scripts/test-rest-timer-reload.tsx 2>&1 | grep -q "✅ All tests passed"; then
  echo "❌ MUTANT 4 SURVIVED - Test should have failed!"
  echo
else
  echo "✅ MUTANT 4 KILLED - Test failed as expected"
  echo
fi

echo "========================================"
echo "Mutant testing complete"
