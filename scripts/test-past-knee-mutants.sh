#!/usr/bin/env bash
# Mutant testing for past-knee tier implementation.
# Each mutant breaks one requirement; the test must catch it.

set -euo pipefail

BACKUP_DIR=$(mktemp -d)
EXIT_CODE=0
FAILED_MUTANTS=()

cleanup() {
  echo ""
  echo "=== Cleanup ==="
  
  # Restore all files from non-empty backups
  for backup in "$BACKUP_DIR"/*.backup; do
    if [ -f "$backup" ] && [ -s "$backup" ]; then
      original="${backup%.backup}"
      original="${original#$BACKUP_DIR/}"
      original="${original//___/\/}"
      
      if ! cmp -s "$backup" "$original"; then
        echo "Restoring $original"
        cp "$backup" "$original"
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

backup_file() {
  local file="$1"
  local backup_name="${file//\//___}.backup"
  cp "$file" "$BACKUP_DIR/$backup_name"
}

restore_file() {
  local file="$1"
  local backup_name="${file//\//___}.backup"
  if [ -f "$BACKUP_DIR/$backup_name" ] && [ -s "$BACKUP_DIR/$backup_name" ]; then
    cp "$BACKUP_DIR/$backup_name" "$file"
  fi
}

run_mutant() {
  local name="$1"
  echo ""
  echo "=== Mutant: $name ==="
  
  if npm run test:past-knee 2>&1 | tee /dev/stderr | grep -q "✗"; then
    echo "✓ Mutant killed"
    return 0
  else
    echo "✗ Mutant survived"
    FAILED_MUTANTS+=("$name")
    return 1
  fi
}

# Backup all files we'll mutate
backup_file "src/lib/program/past-knee.ts"
backup_file "src/lib/program/generate.ts"
backup_file "src/lib/program/alternatives.ts"
backup_file "src/app/session/[id]/page.tsx"

echo "=== Baseline: tests should pass ==="
if ! npm run test:past-knee; then
  echo "✗ Baseline tests failed - fix tests first"
  exit 1
fi

# Mutant 1: Remove pistol exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i.bak 's/"pistol-squat",/"__DISABLED__pistol-squat",/' src/lib/program/past-knee.ts
run_mutant "Remove pistol exclusion"
restore_file "src/lib/program/past-knee.ts"

# Mutant 2: Remove walking lunge exclusion
restore_file "src/lib/program/past-knee.ts"
sed -i.bak 's/"barbell-walking-lunge",/"__DISABLED__barbell-walking-lunge",/' src/lib/program/past-knee.ts
sed -i.bak 's/"walking-lunge",/"__DISABLED__walking-lunge",/' src/lib/program/past-knee.ts
run_mutant "Remove walking lunge exclusion"
restore_file "src/lib/program/past-knee.ts"

# Mutant 3: Drop primary preference (remove bonus scoring)
restore_file "src/lib/program/past-knee.ts"
sed -i.bak 's/return 10;/return 0;/' src/lib/program/past-knee.ts
run_mutant "Drop primary preference"
restore_file "src/lib/program/past-knee.ts"

# Mutant 4: Remove leg press from swap list (by breaking alternatives filter)
restore_file "src/lib/program/alternatives.ts"
sed -i.bak 's/if (ctx.pastKneeInjury && isExcludedForPastKnee(candidate)) {/if (false \&\& ctx.pastKneeInjury \&\& isExcludedForPastKnee(candidate)) {/' src/lib/program/alternatives.ts
# This doesn't directly remove leg press but makes swaps less restricted
# A better mutant: comment out the knee-friendly scoring
restore_file "src/lib/program/generate.ts"
sed -i.bak 's/s += kneeFriendlyBonus(ex, slotIndex);/\/\/ s += kneeFriendlyBonus(ex, slotIndex);/' src/lib/program/generate.ts
run_mutant "Drop knee-friendly scoring"
restore_file "src/lib/program/generate.ts"
restore_file "src/lib/program/alternatives.ts"

# Mutant 5: Remove warm-up full depth filter
restore_file "src/app/session/[id]/page.tsx"
sed -i.bak 's/instructions: filterFullDepthCues(item.instructions, hasKneeInjury),/instructions: item.instructions,/' src/app/session/[id]/page.tsx
run_mutant "Remove full depth filter"
restore_file "src/app/session/[id]/page.tsx"

# Mutant 6: Disable past-knee exclusion in isEligible
restore_file "src/lib/program/generate.ts"
sed -i.bak 's/if (input.pastKneeInjury && isExcludedForPastKnee(ex)) {/if (false \&\& input.pastKneeInjury \&\& isExcludedForPastKnee(ex)) {/' src/lib/program/generate.ts
run_mutant "Disable past-knee exclusion in isEligible"
restore_file "src/lib/program/generate.ts"

# Mutant 7: Remove jumping exercise check
restore_file "src/lib/program/past-knee.ts"
sed -i.bak 's/return isJumpingExercise(ex);/return false;/' src/lib/program/past-knee.ts
run_mutant "Remove jumping exercise check"
restore_file "src/lib/program/past-knee.ts"

echo ""
