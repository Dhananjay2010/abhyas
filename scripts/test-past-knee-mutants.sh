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
    # Verify restore succeeded
    if ! cmp -s "$file" "$BACKUP_DIR/$backup_name"; then
      echo "✗ Failed to restore $file"
      FAILED=1
    fi
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

trap cleanup EXIT
trap 'FAILED=1; cleanup; exit 1' INT TERM

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
  
  # Run both tests: past-knee grid AND plan lunge pick
  if npm run test:past-knee 2>&1 | tee /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-plan-lunge-pick 2>&1 | tee -a /tmp/mutant-output.txt | tail -5; then
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

echo "=== Taking backups (once before any mutants) ==="
backup_file "src/lib/program/past-knee.ts"
backup_file "src/lib/program/past-knee-lunge-order.ts"
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
run_mutant "Remove kettlebell-pistol-squat exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 2: Remove squat-jerk
restore_file "src/lib/program/past-knee.ts"
sed -i '/"squat-jerk",/d' src/lib/program/past-knee.ts
run_mutant "Remove squat-jerk exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 3: Remove speed-squats
restore_file "src/lib/program/past-knee.ts"
sed -i '/"speed-squats",/d' src/lib/program/past-knee.ts
run_mutant "Remove speed-squats exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 4: Remove barbell-full-squat
restore_file "src/lib/program/past-knee.ts"
sed -i '/"barbell-full-squat",/d' src/lib/program/past-knee.ts
run_mutant "Remove barbell-full-squat exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 5: Disable jumping check
restore_file "src/lib/program/past-knee.ts"
sed -i 's/if (isJumpingExercise(ex)) return true;/if (false) return true;/' src/lib/program/past-knee.ts
run_mutant "Disable jumping exercise filter" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 6: Disable high-impact-leg check
restore_file "src/lib/program/past-knee.ts"
sed -i 's/if (isHighImpactLegExercise(ex)) return true;/if (false) return true;/' src/lib/program/past-knee.ts
run_mutant "Disable high-impact-leg exercise filter" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 7: Disable isEligible gate
restore_file "src/lib/program/generate.ts"
sed -i 's/if (input.pastKneeInjury === true/if (false \&\& input.pastKneeInjury === true/' src/lib/program/generate.ts
run_mutant "Disable isEligible gate" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# Mutant 8: Disable rankAlternatives gate
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/if (false \&\& ctx.pastKneeInjury === true \&\& isExcludedForPastKnee/' src/lib/program/alternatives.ts
run_mutant "Disable rankAlternatives gate" "src/lib/program/alternatives.ts" || true
restore_file "src/lib/program/alternatives.ts"

# Mutant 9: Remove walking-lunge warmup exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "walking-lunge"/false/' src/lib/program/warmup.ts
run_mutant "Remove warmup walking-lunge exclusion" "src/lib/program/warmup.ts" || true
restore_file "src/lib/program/warmup.ts"

# Mutant 10: Remove skipping-light warmup exclusion
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "skipping-light"/false/' src/lib/program/warmup.ts
run_mutant "Remove warmup skipping-light exclusion" "src/lib/program/warmup.ts" || true
restore_file "src/lib/program/warmup.ts"

# Mutant 11: Disable goblet OR logic gating
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (ctx.pastKneeInjury === true && candidate.slug === "goblet-squat")/if (candidate.slug === "goblet-squat")/' src/lib/program/alternatives.ts
run_mutant "Remove goblet OR-logic gating" "src/lib/program/alternatives.ts" || true
restore_file "src/lib/program/alternatives.ts"

# Mutant 12: Disable rear-lunge #1 boost
restore_file "src/lib/program/past-knee.ts"
sed -i 's/if (candidate.slug === "dumbbell-rear-lunge") return 2;/if (candidate.slug === "dumbbell-rear-lunge") return 1;/' src/lib/program/past-knee.ts
run_mutant "Disable rear-lunge ranking boost" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 13: Remove wall-sit primary penalty (allow as primary squat)
restore_file "src/lib/program/past-knee.ts"
sed -i '/if (ex.slug === "wall-sit" && slotIndex <= 3) {/,/}/d' src/lib/program/past-knee.ts
run_mutant "Remove wall-sit primary penalty" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 14: Disable past-knee lunge tier ordering (use non-existent slug for tier 1)
restore_file "src/lib/program/past-knee-lunge-order.ts"
sed -i 's/if (ex.slug === "dumbbell-rear-lunge") return 1;/if (ex.slug === "nonexistent-lunge-slug") return 1;/' src/lib/program/past-knee-lunge-order.ts
run_mutant "Disable past-knee tier-1 lunge (dumbbell-rear-lunge)" "src/lib/program/past-knee-lunge-order.ts" || true
restore_file "src/lib/program/past-knee-lunge-order.ts"

# Mutant 15: Disable level gate relaxation for past-knee tier-1
restore_file "src/lib/program/generate.ts"
sed -i 's/const isPastKneeTier1 = input.pastKneeInjury && pastKneeLungeTier(ex) === 1;/const isPastKneeTier1 = false;/' src/lib/program/generate.ts
run_mutant "Disable level gate relaxation for tier-1" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

echo ""
