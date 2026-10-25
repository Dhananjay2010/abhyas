#!/usr/bin/env bash
# Past-knee mutation testing
set -euo pipefail
shopt -s nullglob

BACKUP_DIR=$(mktemp -d)
FAILED=0
SURVIVED_MUTANTS=()

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
  fi
}

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  for backup in "$BACKUP_DIR"/*.backup; do
    if [ -f "$backup" ] && [ -s "$backup" ]; then
      original="${backup%.backup}"
      original="${original#$BACKUP_DIR/}"
      original="${original//___/\/}"
      echo "Restoring $original"
      cp "$backup" "$original"
    fi
  done
  rm -rf "$BACKUP_DIR"
  
  if [ $FAILED -eq 1 ]; then
    echo ""
    echo "✗ ${#SURVIVED_MUTANTS[@]} mutant(s) survived:"
    for mutant in "${SURVIVED_MUTANTS[@]}"; do
      echo "  - $mutant"
    done
    exit 1
  else
    echo ""
    echo "✓ All mutants killed"
    exit 0
  fi
}

trap cleanup EXIT INT TERM

run_mutant() {
  local name="$1"
  local file="$2"
  
  echo ""
  echo "=== Mutant: $name ==="
  
  local backup_name="${file//\//___}.backup"
  if cmp -s "$file" "$BACKUP_DIR/$backup_name"; then
    echo "✗ Mutation did not change $file"
    SURVIVED_MUTANTS+=("$name (unchanged)")
    FAILED=1
    return 1
  fi
  
  if ! npx tsc --noEmit 2>&1 | tail -3; then
    echo "✗ Mutant does not compile"
    SURVIVED_MUTANTS+=("$name (does not compile)")
    FAILED=1
    return 1
  fi
  
  if npm run test:past-knee 2>&1 | tee /tmp/mutant-output.txt | tail -5; then
    echo "✗ Test passed (mutation survived)"
    SURVIVED_MUTANTS+=("$name")
    FAILED=1
    return 1
  else
    if grep -q "check(s) failed" /tmp/mutant-output.txt; then
      echo "✓ Test failed (mutation caught)"
      return 0
    else
      echo "✗ Test crashed"
      SURVIVED_MUTANTS+=("$name (test crashed)")
      FAILED=1
      return 1
    fi
  fi
}

echo "=== Taking backups ==="
backup_file "src/lib/program/past-knee.ts"
backup_file "src/lib/program/generate.ts"
backup_file "src/lib/program/alternatives.ts"
backup_file "src/lib/program/warmup.ts"

echo ""
echo "=== Baseline: tests should pass ==="
if ! npm run test:past-knee; then
  echo "✗ Baseline tests failed"
  FAILED=1
  cleanup
fi

# Mutant 1: Remove kettlebell-pistol-squat
restore_file "src/lib/program/past-knee.ts"
sed -i '/"kettlebell-pistol-squat",/d' src/lib/program/past-knee.ts
run_mutant "Remove kettlebell-pistol-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 2: Remove squat-jerk
restore_file "src/lib/program/past-knee.ts"
sed -i '/"squat-jerk",/d' src/lib/program/past-knee.ts
run_mutant "Remove squat-jerk exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 3: Remove speed-squats
restore_file "src/lib/program/past-knee.ts"
sed -i '/"speed-squats",/d' src/lib/program/past-knee.ts
run_mutant "Remove speed-squats exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 4: Remove barbell-full-squat
restore_file "src/lib/program/past-knee.ts"
sed -i '/"barbell-full-squat",/d' src/lib/program/past-knee.ts
run_mutant "Remove barbell-full-squat exclusion" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 5: Disable jumping check
restore_file "src/lib/program/past-knee.ts"
sed -i 's/return isJumpingExercise(ex);/return false;/' src/lib/program/past-knee.ts
run_mutant "Disable jumping exercise filter" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

# Mutant 6: Disable isEligible gate
restore_file "src/lib/program/generate.ts"
sed -i 's/if (input.pastKneeInjury === true/if (false \&\& input.pastKneeInjury === true/' src/lib/program/generate.ts
run_mutant "Disable isEligible gate" "src/lib/program/generate.ts"
restore_file "src/lib/program/generate.ts"

# Mutant 7: Disable rankAlternatives gate
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/if (false \&\& ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/' src/lib/program/alternatives.ts
run_mutant "Disable rankAlternatives gate" "src/lib/program/alternatives.ts"
restore_file "src/lib/program/alternatives.ts"

# Mutant 8: Remove walking-lunge warmup exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "walking-lunge"/false/' src/lib/program/warmup.ts
run_mutant "Remove warmup walking-lunge exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 9: Remove skipping-light warmup exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "skipping-light"/false/' src/lib/program/warmup.ts
run_mutant "Remove warmup skipping-light exclusion" "src/lib/program/warmup.ts"
restore_file "src/lib/program/warmup.ts"

# Mutant 10: Disable goblet OR logic gating
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true && candidate.slug === "goblet-squat")/if (candidate.slug === "goblet-squat")/' src/lib/program/alternatives.ts
run_mutant "Remove goblet OR-logic gating" "src/lib/program/alternatives.ts"
restore_file "src/lib/program/alternatives.ts"

# Mutant 11: Disable rear-lunge #1 boost
restore_file "src/lib/program/past-knee.ts"
sed -i 's/if (candidate.slug === "dumbbell-rear-lunge") return 2;/if (candidate.slug === "dumbbell-rear-lunge") return 1;/' src/lib/program/past-knee.ts
run_mutant "Disable rear-lunge ranking boost" "src/lib/program/past-knee.ts"
restore_file "src/lib/program/past-knee.ts"

echo ""
