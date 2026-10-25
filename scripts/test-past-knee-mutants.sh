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
  
  # Run all past-knee tests
  if npm run test:past-knee 2>&1 | tee /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-plan-lunge-pick 2>&1 | tee -a /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-plan-swap-consistency 2>&1 | tee -a /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-input-wiring 2>&1 | tee -a /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-jump-guard 2>&1 | tee -a /tmp/mutant-output.txt | tail -5 && \
     npm run test:past-knee-guards 2>&1 | tee -a /tmp/mutant-output.txt | tail -5; then
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
backup_file "src/app/session/actions.ts"
backup_file "src/lib/program/persist.ts"

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

# Mutant 12: Reverse past-knee lunge tier order (step-ups first, rear lunge last)
restore_file "src/lib/program/past-knee-lunge-order.ts"
sed -i 's/if (ex.slug === "dumbbell-rear-lunge") return 1;/if (ex.slug === "dumbbell-rear-lunge") return 4;/' src/lib/program/past-knee-lunge-order.ts
sed -i 's/if (stepUpSlugs.includes(ex.slug)) return 4;/if (stepUpSlugs.includes(ex.slug)) return 1;/' src/lib/program/past-knee-lunge-order.ts
run_mutant "Reverse past-knee lunge tier order" "src/lib/program/past-knee-lunge-order.ts" || true
restore_file "src/lib/program/past-knee-lunge-order.ts"

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

# Mutant 16: Remove wall-sit repositioning
restore_file "src/lib/program/alternatives.ts"
sed -i '/Post-sort repositioning: wall-sit must be at index/,/^  }$/d' src/lib/program/alternatives.ts
run_mutant "Remove wall-sit repositioning" "src/lib/program/alternatives.ts" || true
restore_file "src/lib/program/alternatives.ts"

# Mutant 17: Remove jogging-treadmill exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i '/"jogging-treadmill",/d' src/lib/program/past-knee.ts
run_mutant "Remove jogging-treadmill exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 18: Remove elevated-back-lunge exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i '/"elevated-back-lunge",/d' src/lib/program/past-knee.ts
run_mutant "Remove elevated-back-lunge exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# === MEDIUM-1: Call-site mutants ===

# Mutant 19: Drop pastKneeInjury at swap site (actions.ts)
restore_file "src/app/session/actions.ts"
sed -i 's/pastKneeInjury: input.pastKneeInjury,/pastKneeInjury: false,/' src/app/session/actions.ts
sed -i 's/input.primaryTrack, input.pastKneeInjury, 0/input.primaryTrack, false, 0/' src/app/session/actions.ts
run_mutant "Drop pastKneeInjury at swap site" "src/app/session/actions.ts" || true
restore_file "src/app/session/actions.ts"

# Mutant 20: Drop pastKneeInjury at plan creation (persist.ts)
restore_file "src/lib/program/persist.ts"
sed -i '/pastKneeInjury: (injuriesRes.data/,/.some((i) => i.severity === "past" && i.body_region === "knee"),/d' src/lib/program/persist.ts
run_mutant "Drop pastKneeInjury at plan creation" "src/lib/program/persist.ts" || true
restore_file "src/lib/program/persist.ts"

# Mutant 21: Remove kneeFriendlyBonus call in scoring
restore_file "src/lib/program/generate.ts"
sed -i 's/s += kneeFriendlyBonus(ex, slotIndex);/\/\/ s += kneeFriendlyBonus(ex, slotIndex);/' src/lib/program/generate.ts
run_mutant "Remove kneeFriendlyBonus scoring" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# === MEDIUM-2: Guard mutants ===

# Mutant 22: Exclude ALL impact=high for past knee
restore_file "src/lib/program/past-knee.ts"
sed -i '/export function isExcludedForPastKnee/,/^}$/{s/if (isJumpingExercise(ex)) return true;/if (ex.impact === "high") return true;\n  if (isJumpingExercise(ex)) return true;/}' src/lib/program/past-knee.ts
run_mutant "Exclude ALL impact=high for past knee" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 23: Exclude squats-with-bands
restore_file "src/lib/program/past-knee.ts"
sed -i '/const PAST_KNEE_EXCLUDED_SLUGS/,/];/{s/"elevated-back-lunge",/"elevated-back-lunge",\n  "squats-with-bands",/}' src/lib/program/past-knee.ts
run_mutant "Exclude squats-with-bands" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 24: Skip cable-hip-adduction for everyone
restore_file "src/lib/program/past-knee.ts"
sed -i '/const PAST_KNEE_EXCLUDED_SLUGS/,/];/{s/"elevated-back-lunge",/"elevated-back-lunge",\n  "cable-hip-adduction",/}' src/lib/program/past-knee.ts
run_mutant "Skip cable-hip-adduction for everyone" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 25: Disable jump/plyo guard in generate.ts (item 12)
restore_file "src/lib/program/generate.ts"
sed -i '/PR #73 coordinator: ANY knee injury.*excludes jump\/plyometric/,/^  }$/s/if (input.anyKneeInjury && ex.impact === "high") {/if (false \&\& input.anyKneeInjury \&\& ex.impact === "high") {/' src/lib/program/generate.ts
run_mutant "Disable jump/plyo guard for knee injuries" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# === Item 14: Thruster/push press/kettlebell jerk tier mutants ===

# Mutant 26: Remove kettlebell-thruster from past-knee exclusions (should fail: thruster must be banned for both tiers)
restore_file "src/lib/program/past-knee.ts"
sed -i '/"kettlebell-thruster",/d' src/lib/program/past-knee.ts
run_mutant "Item 14: Remove kettlebell-thruster exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 27: Add double-kettlebell-push-press to past-knee exclusions (should fail: push press allowed for past knee)
restore_file "src/lib/program/past-knee.ts"
sed -i '/const PAST_KNEE_EXCLUDED_SLUGS.*=/,/];/{s/"kettlebell-thruster",/"kettlebell-thruster",\n  "double-kettlebell-push-press",/}' src/lib/program/past-knee.ts
run_mutant "Item 14: Add push press to past-knee exclusions" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 28: Remove double-kettlebell-jerk from current-knee-only exclusions (should fail: jerk must be banned for current knee)
restore_file "src/lib/program/past-knee.ts"
sed -i '/"double-kettlebell-jerk",/d' src/lib/program/past-knee.ts
run_mutant "Item 14: Remove jerk from current-knee-only exclusions" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 29: Disable current-knee-only check in generate.ts
restore_file "src/lib/program/generate.ts"
sed -i 's/if (hasCurrentKnee && isExcludedForCurrentKneeOnly(ex)) {/if (false \&\& hasCurrentKnee \&\& isExcludedForCurrentKneeOnly(ex)) {/' src/lib/program/generate.ts
run_mutant "Item 14: Disable current-knee-only check in generate.ts" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# Mutant 30: Disable current-knee-only check in alternatives.ts
restore_file "src/lib/program/alternatives.ts"
sed -i 's/if (hasKneeInjury && isExcludedForCurrentKneeOnly(candidate)) continue;/if (false \&\& hasKneeInjury \&\& isExcludedForCurrentKneeOnly(candidate)) continue;/' src/lib/program/alternatives.ts
run_mutant "Item 14: Disable current-knee-only check in alternatives.ts" "src/lib/program/alternatives.ts" || true
restore_file "src/lib/program/alternatives.ts"

# === Item 15: Past-knee squat rule mutants ===

# Mutant 31: Remove deficit-deadlift from past-knee exclusions
restore_file "src/lib/program/past-knee.ts"
sed -i '/"deficit-deadlift",/d' src/lib/program/past-knee.ts
run_mutant "Item 15: Remove deficit-deadlift exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 32: Remove barbell-hack-squat from past-knee exclusions
restore_file "src/lib/program/past-knee.ts"
sed -i '/"barbell-hack-squat",/d' src/lib/program/past-knee.ts
run_mutant "Item 15: Remove barbell-hack-squat exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 33: Remove smith-machine-squat from past-knee exclusions
restore_file "src/lib/program/past-knee.ts"
sed -i '/"smith-machine-squat",/d' src/lib/program/past-knee.ts
run_mutant "Item 15: Remove smith-machine-squat exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 34: Remove front-barbell-squat from past-knee exclusions
restore_file "src/lib/program/past-knee.ts"
sed -i '/"front-barbell-squat",/d' src/lib/program/past-knee.ts
run_mutant "Item 15: Remove front-barbell-squat exclusion" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# Mutant 35: Disable squat priority ordering in swap ranking
restore_file "src/lib/program/alternatives.ts"
sed -i '/Item 15: Past-knee squat ordering/,/^    }$/s/if (hasPastKnee && current.movement_pattern === "squat"/if (false \&\& hasPastKnee \&\& current.movement_pattern === "squat"/' src/lib/program/alternatives.ts
run_mutant "Item 15: Disable squat priority ordering" "src/lib/program/alternatives.ts" || true
restore_file "src/lib/program/alternatives.ts"

# Mutant 36: Add barbell-deadlift to past-knee exclusions (should fail: floor deadlift must be allowed)
restore_file "src/lib/program/past-knee.ts"
sed -i '/const PAST_KNEE_EXCLUDED_SLUGS.*=/,/];/{s/"deficit-deadlift",/"deficit-deadlift",\n  "barbell-deadlift",/}' src/lib/program/past-knee.ts
run_mutant "Item 15: Add barbell-deadlift to exclusions (should fail)" "src/lib/program/past-knee.ts" || true
restore_file "src/lib/program/past-knee.ts"

# === Item 13: Current-knee lunge list hardcoded enforcement mutants ===

# Mutant 37: Remove step-up-with-knee-raise from KNEE_SAFE_LUNGE_EXERCISES
restore_file "src/lib/program/generate.ts"
sed -i "/'step-up-with-knee-raise',/d" src/lib/program/generate.ts
run_mutant "Item 13: Remove step-up-with-knee-raise from safe list" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# Mutant 38: Disable hardcoded safe lunge exemption in derived contraindications
restore_file "src/lib/program/generate.ts"
sed -i 's/!KNEE_SAFE_LUNGE_EXERCISES.has(ex.slug)/false/' src/lib/program/generate.ts
run_mutant "Item 13: Disable safe lunge exemption in getDerivedContraindications" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# Mutant 39: Disable skipKneeCheck logic in contraindication filtering
restore_file "src/lib/program/generate.ts"
sed -i 's/const skipKneeCheck = hasCurrentKnee && KNEE_SAFE_LUNGE_EXERCISES.has(ex.slug);/const skipKneeCheck = false;/' src/lib/program/generate.ts
run_mutant "Item 13: Disable skipKneeCheck in contraindication filtering" "src/lib/program/generate.ts" || true
restore_file "src/lib/program/generate.ts"

# === Item 8: Warm-up past-knee exclusions mutants ===

# Mutant 40: Allow walking-lunge for past knee (remove from exclusion list)
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "walking-lunge" ||/false ||/' src/lib/program/warmup.ts
run_mutant "Item 8: Allow walking-lunge for past knee" "src/lib/program/warmup.ts" || true
restore_file "src/lib/program/warmup.ts"

# Mutant 41: Allow worlds-greatest for past knee (remove from exclusion list)
restore_file "src/lib/program/warmup.ts"
sed -i 's/slug === "worlds-greatest"/false/' src/lib/program/warmup.ts
run_mutant "Item 8: Allow worlds-greatest for past knee" "src/lib/program/warmup.ts" || true
restore_file "src/lib/program/warmup.ts"

# Mutant 42: Disable full-depth cue filtering
restore_file "src/lib/program/warmup.ts"
sed -i 's/const hasKneeInjury = injuryRegions.includes("knee") || pastKneeInjury === true;/const hasKneeInjury = false;/' src/lib/program/warmup.ts
run_mutant "Item 8: Disable full-depth cue filtering" "src/lib/program/warmup.ts" || true
restore_file "src/lib/program/warmup.ts"

echo ""
