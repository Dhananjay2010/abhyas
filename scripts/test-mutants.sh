#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for Task U3 + QA L-8
# Tests that exclusions and pullover rule are enforced

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALTERNATIVES_FILE="$SCRIPT_DIR/../src/lib/program/alternatives.ts"
EXCLUSIONS_FILE="$SCRIPT_DIR/../src/lib/program/exclusions.ts"
GENERATE_FILE="$SCRIPT_DIR/../src/lib/program/generate.ts"

# Create unique temporary backup files
ALTERNATIVES_BACKUP=$(mktemp)
EXCLUSIONS_BACKUP=$(mktemp)
GENERATE_BACKUP=$(mktemp)

echo "=== Mutation Testing for Swap Variety ==="
echo ""

# Baseline run: all PR tests must pass unmutated
echo "Running baseline tests..."
if ! npx tsx "$SCRIPT_DIR/test-plan-exclusions.ts" &>/dev/null; then
  echo "✗ Baseline test-plan-exclusions.ts failed"
  exit 1
fi
if ! npx tsx "$SCRIPT_DIR/test-plan-no-injury-match.ts" &>/dev/null; then
  echo "✗ Baseline test-plan-no-injury-match.ts failed"
  exit 1
fi
if ! npx tsx "$SCRIPT_DIR/test-swap-variety.ts" &>/dev/null; then
  echo "✗ Baseline test-swap-variety.ts failed"
  exit 1
fi
if ! npx tsx "$SCRIPT_DIR/test-swap-path-exclusions.ts" &>/dev/null; then
  echo "✗ Baseline test-swap-path-exclusions.ts failed"
  exit 1
fi
if ! npx tsx "$SCRIPT_DIR/test-guard-mutants.ts" &>/dev/null; then
  echo "✗ Baseline test-guard-mutants.ts failed"
  exit 1
fi
echo "✓ Baseline tests passed"
echo ""

total_mutations=0
caught_mutations=0
survived_mutations=0

cleanup() {
  if [ -f "$ALTERNATIVES_BACKUP" ]; then
    cp "$ALTERNATIVES_BACKUP" "$ALTERNATIVES_FILE" 2>/dev/null || true
  fi
  if [ -f "$EXCLUSIONS_BACKUP" ]; then
    cp "$EXCLUSIONS_BACKUP" "$EXCLUSIONS_FILE" 2>/dev/null || true
  fi
  if [ -f "$GENERATE_BACKUP" ]; then
    cp "$GENERATE_BACKUP" "$GENERATE_FILE" 2>/dev/null || true
  fi
  rm -f "$ALTERNATIVES_BACKUP" "$EXCLUSIONS_BACKUP" "$GENERATE_BACKUP"
}

trap cleanup EXIT INT TERM

run_tests() {
  local mutation_name="$1"
  echo "Testing: $mutation_name"
  
  # Check that the mutant compiles
  if ! npx tsc --noEmit &>/dev/null; then
    echo "  ✗ Mutant does not compile (counts as not caught)"
    return 1
  fi
  
  local caught=0
  
  # Run all 4 PR tests
  if ! npx tsx "$SCRIPT_DIR/test-plan-exclusions.ts" &>/dev/null; then
    echo "  ✓ test-plan-exclusions.ts failed (caught)"
    caught=1
  fi
  
  if ! npx tsx "$SCRIPT_DIR/test-plan-no-injury-match.ts" &>/dev/null; then
    echo "  ✓ test-plan-no-injury-match.ts failed (caught)"
    caught=1
  fi
  
  if ! npx tsx "$SCRIPT_DIR/test-swap-variety.ts" &>/dev/null; then
    echo "  ✓ test-swap-variety.ts failed (caught)"
    caught=1
  fi
  
  if ! npx tsx "$SCRIPT_DIR/test-swap-path-exclusions.ts" &>/dev/null; then
    echo "  ✓ test-swap-path-exclusions.ts failed (caught)"
    caught=1
  fi
  
  if ! npx tsx "$SCRIPT_DIR/test-guard-mutants.ts" &>/dev/null; then
    echo "  ✓ test-guard-mutants.ts failed (caught)"
    caught=1
  fi
  
  if [ "$caught" -eq 0 ]; then
    echo "  ✗ All tests passed (mutation survived)"
  fi
  
  # Return 0 (success) if caught, 1 (failure) if not caught
  return $((caught == 0))
}

verify_mutation() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  local backup="/tmp/$(basename "$file").backup"

  if cmp -s "$file" "$backup"; then
    echo "  ✗ FATAL: Mutation did not change the file ($description)"
    exit 2
  fi
  if ! grep -qF -- "$pattern" "$file"; then
    echo "  ✗ FATAL: Mutation marker not found ($description)"
    exit 2
  fi
}

echo "1. Mutation: Remove standing-barbell-press-behind-neck from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"standing-barbell-press-behind-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "standing-barbell-press-behind-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove standing-barbell-press-behind-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "2. Mutation: Remove wide-grip-pulldown-behind-the-neck from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"wide-grip-pulldown-behind-the-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "wide-grip-pulldown-behind-the-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-pulldown-behind-the-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "3. Mutation: Remove wide-grip-rear-pull-up from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"wide-grip-rear-pull-up",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "wide-grip-rear-pull-up removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-rear-pull-up"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "4. Mutation: Remove barbell-guillotine-bench-press from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"barbell-guillotine-bench-press",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "barbell-guillotine-bench-press removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove barbell-guillotine-bench-press"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "5. Mutation: Remove neck-press from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"neck-press",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "neck-press removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove neck-press"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "6. Mutation: Remove low-pulley-row-to-neck from exclusion set"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/"low-pulley-row-to-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "low-pulley-row-to-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove low-pulley-row-to-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "7. Mutation: Remove pullover filter entirely"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
# Delete from the if line through the matching closing brace and continue
sed -i '/if (isCompoundPull && !isPulloverOriginal) {/,/^    }$/{/^    }$/d; /if (isCompoundPull && !isPulloverOriginal) {/d; d}' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "// 4. Pattern priority" "next section after deleted pullover filter"
total_mutations=$((total_mutations + 1))
if run_tests "Remove pullover filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "8. Mutation: Apply pullover filter to every original (drop !isPulloverOriginal)"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (isCompoundPull)/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "if (isCompoundPull)" "mutated condition without isPulloverOriginal"
total_mutations=$((total_mutations + 1))
if run_tests "Apply pullover filter to every original"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "9. Mutation: Apply pullover filter only to vertical pulls"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/current.movement_pattern === "horizontal_pull" || //' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" 'current.movement_pattern === "vertical_pull"' "vertical_pull without horizontal_pull"
total_mutations=$((total_mutations + 1))
if run_tests "Vertical pulls only"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "10. Mutation: Drop compound requirement for pullover filter"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (!isPulloverOriginal)/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "if (!isPulloverOriginal)" "condition without isCompoundPull"
total_mutations=$((total_mutations + 1))
if run_tests "Drop compound requirement"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "11. Mutation: Rank equipment fit before movement pattern"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/if (a.patternRank !== b.patternRank) return a.patternRank - b.patternRank;/if (a.equipmentScore !== b.equipmentScore) return b.equipmentScore - a.equipmentScore;/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "if (a.equipmentScore !== b.equipmentScore) return b.equipmentScore - a.equipmentScore;" "equipment before pattern"
total_mutations=$((total_mutations + 1))
if run_tests "Rank equipment before pattern"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "12. Mutation: Drop impact penalty"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/const impactPenalty =/const impactPenalty = 0; \/\/ MUTANT: was/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "const impactPenalty = 0; // MUTANT: was" "impact penalty zeroed"
total_mutations=$((total_mutations + 1))
if run_tests "Drop impact penalty"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "13. Mutation: Remove impact penalty comparator"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i '/if (a.impactPenalty !== b.impactPenalty) return a.impactPenalty - b.impactPenalty;/d' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "// 5. Generator score" "next line after removed comparator"
total_mutations=$((total_mutations + 1))
if run_tests "Remove impact penalty comparator"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "14. Mutation: Remove :672 filter"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
# Remove the line with .filter at :672 (alternative pattern filter)
sed -i '672s/.filter((item) => !EXCLUDED_EXERCISE_SLUGS.has(item.e.slug))//' "$GENERATE_FILE"
# Verify something changed
if diff -q $GENERATE_BACKUP "$GENERATE_FILE" >/dev/null; then
  echo "  ✗ FATAL: Mutation did not change the file"
  exit 2
fi
total_mutations=$((total_mutations + 1))
if run_tests "Remove :672 filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "15. Mutation: Remove Strategy 3 accessory exclusion filter"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i '/!EXCLUDED_EXERCISE_SLUGS\.has(e\.slug)/d' "$GENERATE_FILE"
sed -i 's/isEligible(e, input) &&$/isEligible(e, input)/' "$GENERATE_FILE"
verify_mutation "$GENERATE_FILE" "Strategy 3: Add another accessory exercise" "Strategy 3 comment still present"
total_mutations=$((total_mutations + 1))
if run_tests "Remove Strategy 3 filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "16. Mutation: Remove bodyweight-pull force-add exclusion check"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i '/if (EXCLUDED_EXERCISE_SLUGS\.has(e\.slug)) return false;/d' "$GENERATE_FILE"
verify_mutation "$GENERATE_FILE" "Force-add a bodyweight pull exercise" "BW force-add comment still present"
total_mutations=$((total_mutations + 1))
if run_tests "Remove BW force-add filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "17. Mutation: Remove post-pacing bodyweight-pull exclusion filter"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
# Remove line with !EXCLUDED_EXERCISE_SLUGS.has(e.slug) and fix the && on the previous line
# Use line number 1321-1322 (isEligible line and exclusion check line)
sed -i '1321s/ &&$//' "$GENERATE_FILE"
sed -i '1322d' "$GENERATE_FILE"
verify_mutation "$GENERATE_FILE" "!usedInBlock.has(e.id)" "post-pacing context still present"
total_mutations=$((total_mutations + 1))
if run_tests "Remove post-pacing BW filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

echo "18. Mutation: Remove carry-over exclusion guard"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
sed -i 's/if (match && !EXCLUDED_EXERCISE_SLUGS\.has(match\.slug)) return match;/if (match) return match;/' "$GENERATE_FILE"
verify_mutation "$GENERATE_FILE" "if (match) return match;" "carry-over guard removed"
total_mutations=$((total_mutations + 1))
if run_tests "Remove carry-over guard"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

# Note: :826 filter in generateProgram is not tested as a separate mutant.
# KNEE_SAFE_QUAD_EXERCISES has no overlap with EXCLUDED_EXERCISE_SLUGS,
# so removing that filter alone cannot change any plan output. The filter is kept for
# defense-in-depth but does not require its own mutant.

echo "19. Mutation: Remove all exclusion filters (pickForSlot and rankAlternatives)"
cp "$ALTERNATIVES_FILE" $ALTERNATIVES_BACKUP
cp "$EXCLUSIONS_FILE" $EXCLUSIONS_BACKUP
cp "$GENERATE_FILE" $GENERATE_BACKUP
# Remove pickForSlot filters
sed -i 's/\.filter((item) => !EXCLUDED_EXERCISE_SLUGS\.has(item\.e\.slug))//g' "$GENERATE_FILE"
# Remove rankAlternatives filter
sed -i '/if (EXCLUDED_EXERCISE_SLUGS\.has(candidate\.slug)) continue;/d' "$ALTERNATIVES_FILE"
# Check if filters were removed
if grep -q '\.filter((item) => !EXCLUDED_EXERCISE_SLUGS' "$GENERATE_FILE"; then
  echo "  ✗ FATAL: pickForSlot filters still present"
  exit 2
fi
if grep -q 'if (EXCLUDED_EXERCISE_SLUGS\.has(candidate\.slug)) continue;' "$ALTERNATIVES_FILE"; then
  echo "  ✗ FATAL: rankAlternatives filter still present"
  exit 2
fi
echo "  Mutation applied (all filters removed)"
total_mutations=$((total_mutations + 1))
if run_tests "Remove all exclusion filters"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
cp $ALTERNATIVES_BACKUP "$ALTERNATIVES_FILE"
cp $EXCLUSIONS_BACKUP "$EXCLUSIONS_FILE"
cp $GENERATE_BACKUP "$GENERATE_FILE"
echo ""

# Note: Mutant 20 (empty-day backfill at :1087) dropped.
# The backfill path (exercises.length === 0) is unreachable with excluded-only catalogues
# because the generator's slot-filling logic filters excluded exercises before reaching
# the backfill code. The guard at :1087 is defense-in-depth but cannot be tested via mutation.

echo "=== Mutation Testing Results ==="
echo "Total mutations: $total_mutations"
echo "Caught: $caught_mutations"
echo "Survived: $survived_mutations"
echo ""

if [ "$survived_mutations" -eq 0 ]; then
  echo "✓ All mutations caught"
  exit 0
else
  echo "✗ $survived_mutations mutation(s) survived"
  exit 1
fi
