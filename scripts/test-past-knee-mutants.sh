#!/usr/bin/env bash
# Mutant testing for past-knee tier implementation.
# Each mutant breaks one requirement; the test must catch it.

set -euo pipefail
shopt -s nullglob

BACKUP_DIR=$(mktemp -d)
EXIT_CODE=0
FAILED_MUTANTS=()

# Backup all files ONCE before any mutations
backup_file() {
  local file="$1"
  local backup_name="${file//\//___}.backup"
  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/$backup_name"
  fi
}

restore_file() {
  local file="$1"
  local backup_name="${file//\//___}.backup"
  if [ -f "$BACKUP_DIR/$backup_name" ] && [ -s "$BACKUP_DIR/$backup_name" ]; then
    cp "$BACKUP_DIR/$backup_name" "$file"
    if ! cmp -s "$BACKUP_DIR/$backup_name" "$file"; then
      echo "✗ FATAL: Restore of $file failed"
      exit 1
    fi
  fi
}

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  
  # Restore all files from non-empty backups
  for backup in "$BACKUP_DIR"/*.backup; do
    if [ -f "$backup" ] && [ -s "$backup" ]; then
      original="${backup%.backup}"
      original="${original#$BACKUP_DIR/}"
      original="${original//___/\/}"
      
      echo "Restoring $original"
      cp "$backup" "$original"
      
      if ! cmp -s "$backup" "$original"; then
        echo "✗ FATAL: Restore of $original failed cmp check"
        exit 1
      fi
    fi
  done
  
  rm -rf "$BACKUP_DIR"
  
  if [ ${#FAILED_MUTANTS[@]} -gt 0 ]; then
    echo ""
    echo "✗ ${#FAILED_MUTANTS[@]} mutant(s) survived:"
    for mutant in "${FAILED_MUTANTS[@]}"; do
      echo "  - $mutant"
    done
    exit 1
  else
    echo ""
    echo "✓ All mutants killed"
    exit 0
  fi
}

trap cleanup EXIT
trap 'cleanup; exit 1' INT TERM

run_mutant() {
  local name="$1"
  local file="$2"
  
  echo ""
  echo "=== Mutant: $name ==="
  
  # Verify file was actually changed
  local backup_name="${file//\//___}.backup"
  if cmp -s "$file" "$BACKUP_DIR/$backup_name"; then
    echo "✗ Mutation did not change $file"
    FAILED_MUTANTS+=("$name (unchanged)")
    return 1
  fi
  
  # Check compilation
  if ! npx tsc --noEmit 2>&1 | tail -5; then
    echo "✗ Mutant does not compile"
    FAILED_MUTANTS+=("$name (does not compile)")
    return 1
  fi
  
  # Run test - must exit non-zero (not crash) and show failure summary
  if npm run test:past-knee 2>&1 | tee /tmp/mutant-output.txt; then
    echo "✗ Test passed (mutation survived)"
    FAILED_MUTANTS+=("$name")
    return 1
  else
    # Check that it's a proper test failure, not a crash
    if grep -q "check(s) failed" /tmp/mutant-output.txt; then
      echo "✓ Test failed (mutation caught)"
      return 0
    else
      echo "✗ Test crashed instead of failing"
      FAILED_MUTANTS+=("$name (test crashed)")
      return 1
    fi
  fi
}

# Backup all files we'll mutate
echo "=== Taking backups ==="
backup_file "src/lib/program/past-knee.ts"
backup_file "src/lib/program/generate.ts"
backup_file "src/lib/program/alternatives.ts"
backup_file "src/lib/program/warmup.ts"

echo "=== Baseline: tests should pass ==="
if ! npm run test:past-knee; then
  echo "✗ Baseline tests failed - fix tests first"
  exit 1
fi

# Mutant 1: Remove kettlebell-pistol-squat exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"kettlebell-pistol-squat",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove kettlebell-pistol-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 2: Remove barbell-walking-lunge exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"barbell-walking-lunge",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove barbell-walking-lunge exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 3: Remove weighted-sissy-squat exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"weighted-sissy-squat",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove weighted-sissy-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 4: Remove one-leg-barbell-squat exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"one-leg-barbell-squat",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove one-leg-barbell-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 5: Remove lunge-sprint exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"lunge-sprint",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove lunge-sprint exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 6: Remove jumping exercise check
restore_file "src/lib/program/past-knee.ts"
sed -i 's/return isJumpingExercise(ex);/return false;/' src/lib/program/past-knee.ts
run_mutant "Remove jumping exercise check" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 7: Disable past-knee exclusion in isEligible
restore_file "src/lib/program/generate.ts"
sed -i 's/if (input.pastKneeInjury === true/if (false \&\& input.pastKneeInjury === true/' src/lib/program/generate.ts
run_mutant "Disable isEligible gate" "src/lib/program/generate.ts"
restore_file "src/lib/program/generate.ts"

# Mutant 8: Disable past-knee exclusion in rankAlternatives
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/if (false \&\& ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/' src/lib/program/alternatives.ts
run_mutant "Disable rankAlternatives gate" "src/lib/program/alternatives.ts"
restore_file "src/lib/program/alternatives.ts"

# Mutant 9: Remove walking-lunge from warm-up exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "walking-lunge"/false/' src/lib/program/warmup.ts
run_mutant "Remove warm-up walking-lunge exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 10: Remove skipping-light from warm-up exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "skipping-light"/false/' src/lib/program/warmup.ts
run_mutant "Remove warm-up skipping-light exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 11: Disable knee-friendly ranking boost
restore_file "src/lib/program/alternatives.ts"
sed -i 's/const kneeFriendlyScore = (ctx.pastKneeInjury === true \&\& isKneeFriendlyForRanking(candidate)) ? 1 : 0;/const kneeFriendlyScore = 0;/' src/lib/program/alternatives.ts
run_mutant "Disable knee-friendly ranking boost" "src/lib/program/alternatives.ts"
restore_file "src/lib/program/alternatives.ts"

echo ""
