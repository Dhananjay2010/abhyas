#!/usr/bin/env bash
# Mutant testing for past-knee tier implementation.
# Each mutant breaks one requirement; the test must catch it.

set -euo pipefail

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
  for backup in "$BACKUP_DIR"/*.backup 2>/dev/null || true; do
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
  
  # Run test - should fail
  if npm run test:past-knee >/dev/null 2>&1; then
    echo "✗ Test passed (mutation survived)"
    FAILED_MUTANTS+=("$name")
    return 1
  else
    echo "✓ Test failed (mutation caught)"
    return 0
  fi
}

# Backup all files we'll mutate
echo "=== Taking backups ==="
backup_file "src/lib/program/past-knee.ts"
backup_file "src/lib/program/generate.ts"
backup_file "src/lib/program/alternatives.ts"
backup_file "src/lib/program/warmup.ts"
backup_file "src/lib/program/persist.ts"
backup_file "src/app/session/actions.ts"

echo "=== Baseline: tests should pass ==="
if ! npm run test:past-knee; then
  echo "✗ Baseline tests failed - fix tests first"
  exit 1
fi

# Mutant 1: Remove pistol-squat exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"pistol-squat",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove pistol-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 2: Remove barbell-walking-lunge exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"barbell-walking-lunge",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove barbell-walking-lunge exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 3: Remove sissy-squat exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i 's/"sissy-squat",/"__DISABLED__",/' src/lib/program/past-knee.ts
run_mutant "Remove sissy-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 4: Drop knee-friendly bonus scoring
restore_file "src/lib/program/past-knee.ts"
sed -i 's/return 10;/return 0;/' src/lib/program/past-knee.ts
run_mutant "Drop knee-friendly bonus" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 5: Remove jumping exercise check
restore_file "src/lib/program/past-knee.ts"
sed -i 's/return isJumpingExercise(ex);/return false;/' src/lib/program/past-knee.ts
run_mutant "Remove jumping exercise check" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 6: Disable past-knee exclusion in isEligible
restore_file "src/lib/program/generate.ts"
sed -i 's/if (input.pastKneeInjury === true/if (false \&\& input.pastKneeInjury === true/' src/lib/program/generate.ts
run_mutant "Disable isEligible gate" "src/lib/program/generate.ts"
restore_file "src/lib/program/generate.ts"

# Mutant 7: Disable past-knee exclusion in rankAlternatives
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true/if (false \&\& ctx.pastKneeInjury === true/' src/lib/program/alternatives.ts
run_mutant "Disable rankAlternatives gate" "src/lib/program/alternatives.ts"
restore_file "src/lib/program/alternatives.ts"

# Mutant 8: Remove walking-lunge from warm-up exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "walking-lunge"/false/' src/lib/program/warmup.ts
run_mutant "Remove warm-up walking-lunge exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 9: Remove skipping-light from warm-up exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "skipping-light"/false/' src/lib/program/warmup.ts
run_mutant "Remove warm-up skipping-light exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 10: Break persist plumbing (no pastKneeInjury set)
restore_file "src/lib/program/persist.ts"
sed -i 's/pastKneeInjury: (injuriesRes/pastKneeInjury: false \&\& (injuriesRes/' src/lib/program/persist.ts
run_mutant "Break persist plumbing" "src/lib/program/persist.ts"
restore_file "src/lib/program/persist.ts"

# Mutant 11: Break actions plumbing (no pastKneeInjury set)
restore_file "src/app/session/actions.ts"
sed -i 's/pastKneeInjury: input.pastKneeInjury,/pastKneeInjury: false,/' src/app/session/actions.ts
run_mutant "Break actions plumbing" "src/app/session/actions.ts"
restore_file "src/app/session/actions.ts"

echo ""
