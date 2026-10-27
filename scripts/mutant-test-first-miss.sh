#!/usr/bin/env bash
set -euo pipefail

# Simplified mutant test for Decision F
FILE="${MUTANT_TARGET_FILE:-src/lib/program/progression.ts}"
BASELINE_CMD="${MUTANT_BASELINE_CMD:-npm run test:first-miss-pinned}"
COMPILE_CMD="${MUTANT_COMPILE_CMD:-npx tsc --noEmit}"
MUTANT_TEST_CMD="${MUTANT_TEST_CMD:-npm run test:first-miss-pinned}"

BACKUP=$(mktemp)

# Verify backup creation
if [ ! -f "$BACKUP" ]; then
  echo "❌ ERROR: Failed to create backup" >&2
  exit 1
fi

cp "$FILE" "$BACKUP"

# Verify backup is valid
if [ ! -s "$BACKUP" ]; then
  echo "❌ ERROR: Backup is empty" >&2
  rm -f "$BACKUP"
  exit 1
fi

ORIG_SHA=$(sha256sum "$BACKUP" | cut -d' ' -f1)

cleanup() {
  if [ -f "$BACKUP" ]; then
    # Verify backup integrity before restore
    local backup_sha
    backup_sha=$(sha256sum "$BACKUP" 2>/dev/null | cut -d' ' -f1)
    if [ "$backup_sha" != "$ORIG_SHA" ]; then
      echo "❌ FATAL: Backup corrupted" >&2
      exit 1
    fi
    cp "$BACKUP" "$FILE"
    rm -f "$BACKUP"
  fi
}
trap cleanup EXIT

echo "=== Mutant Testing: Decision F Core ===
"

# Baseline
if ! eval "$BASELINE_CMD" > /dev/null 2>&1; then
  echo "❌ Baseline failed"
  exit 1
fi
echo "✓ Baseline pass"

KILLED=0
SURVIVORS=()

test_mutant() {
  local name="$1"
  local old="$2"
  local new="$3"
  
  echo "Testing: $name"
  
  # Apply mutation
  sed -i "s|$old|$new|g" "$FILE"
  
  # Compile check
  if ! eval "$COMPILE_CMD" > /dev/null 2>&1; then
    cp "$BACKUP" "$FILE"
    echo "  ✓ KILLED (doesn't compile)"
    KILLED=$((KILLED + 1))
    return
  fi
  
  # Test
  if eval "$MUTANT_TEST_CMD" > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
  else
    echo "  ✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
  
  # Restore
  cp "$BACKUP" "$FILE"
}

# Test core Decision F mutations
test_mutant "first-miss-drops" "const nextWeight = currentWeight;" "const nextWeight = currentWeight * 0.9;"
test_mutant "counter-not-set" "consecutiveFailures === 0 && currentWeight !== null" "false && currentWeight !== null"
test_mutant "failures-not-incremented" "consecutiveFailures: failures," "consecutiveFailures: 0,"
test_mutant "second-miss-holds" "if (failures >= 2 && currentWeight !== null" "if (failures >= 99 && currentWeight !== null"
test_mutant "hard-feel-wrong-baseline" "const currentWeight = state.currentWorkingWeightKg" "const currentWeight = mode > 0 ? mode : state.currentWorkingWeightKg"
test_mutant "message-altered" "Staying at this weight until every set reaches the top of the range" "Holding at this weight"
test_mutant "easy-no-double" "feel === \"easy\" && !isBodyweightWithAddedWeight" "false && !isBodyweightWithAddedWeight"
test_mutant "grid-step-ignored" "Math.max(patternStep, gridStep)" "patternStep"
test_mutant "snap-down" "Math.ceil(target / gridStep)" "Math.floor(target / gridStep)"
test_mutant "never-raise-removed" "next = Math.max(rawNext, from)" "next = rawNext"
test_mutant "floor-snap-ceil" "Math.floor((rawNext / gridStep)" "Math.ceil((rawNext / gridStep)"
test_mutant "mechanic-wrong" "meta.mechanic === \"isolation\" ? 1.25" "meta.mechanic === \"isolation\" ? 2.5"

echo "
========================================
Killed: $KILLED
Survived: ${#SURVIVORS[@]}
========================================"

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "Survivors: ${SURVIVORS[@]}"
  exit 1
fi

echo "✅ All mutants killed"
