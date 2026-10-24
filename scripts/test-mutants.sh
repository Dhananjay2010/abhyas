#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for Task U3 + QA L-8
# Tests that exclusions and pullover rule are enforced

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALTERNATIVES_FILE="$SCRIPT_DIR/../src/lib/program/alternatives.ts"
BACKUP_FILE="/tmp/alternatives.ts.backup"

echo "=== Mutation Testing for Swap Variety ==="
echo ""

# Backup original
cp "$ALTERNATIVES_FILE" "$BACKUP_FILE"

cleanup() {
  git checkout -- "$ALTERNATIVES_FILE" 2>/dev/null || true
  rm -f "$BACKUP_FILE"
}

trap cleanup EXIT

run_tests() {
  local mutation_name="$1"
  echo "Testing: $mutation_name"
  
  local failed=0
  
  if npx tsx "$SCRIPT_DIR/test-swap-variety.ts" &>/dev/null; then
    echo "  ✗ FAIL: test-swap-variety.ts passed (mutation not caught!)"
    failed=1
  else
    echo "  ✓ PASS: test-swap-variety.ts failed"
  fi
  
  if npx tsx "$SCRIPT_DIR/test-alternatives.ts" &>/dev/null; then
    if [ "$failed" -eq 0 ]; then
      echo "  ✗ FAIL: test-alternatives.ts passed (mutation not caught!)"
      failed=1
    fi
  else
    echo "  ✓ PASS: test-alternatives.ts failed"
  fi
  
  return $failed
}

total_mutations=0
caught_mutations=0

echo "1. Mutation: Remove standing-barbell-press-behind-neck from exclusion set"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/"standing-barbell-press-behind-neck",/\/\/ MUTANT: removed/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Remove standing-barbell-press-behind-neck"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "2. Mutation: Remove wide-grip-pulldown-behind-the-neck from exclusion set"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/"wide-grip-pulldown-behind-the-neck",/\/\/ MUTANT: removed/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-pulldown-behind-the-neck"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "3. Mutation: Remove wide-grip-rear-pull-up from exclusion set"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/"wide-grip-rear-pull-up",/\/\/ MUTANT: removed/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-rear-pull-up"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "4. Mutation: Remove barbell-guillotine-bench-press from exclusion set"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/"barbell-guillotine-bench-press",/\/\/ MUTANT: removed/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Remove barbell-guillotine-bench-press"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "5. Mutation: Remove neck-press from exclusion set"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/"neck-press",/\/\/ MUTANT: removed/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Remove neck-press"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "6. Mutation: Apply pullover filter to every original (drop isPulloverOriginal check)"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (isCompoundPull)/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Apply pullover filter to every original"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "7. Mutation: Drop compound requirement for pullover filter"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (!isPulloverOriginal)/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Drop compound requirement"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "8. Mutation: Apply pullover filter only to vertical pulls"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/(current.movement_pattern === "horizontal_pull" || current.movement_pattern === "vertical_pull")/(current.movement_pattern === "vertical_pull")/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Vertical pulls only"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

echo "9. Mutation: Swap ranking order (pattern rank and equipment score)"
git checkout -- "$ALTERNATIVES_FILE"
sed -i 's/return aData.patternRank - bData.patternRank/return aData.equipmentScore - bData.equipmentScore/' "$ALTERNATIVES_FILE"
sed -i 's/if (patternCmp !== 0) return patternCmp;/if (patternCmp !== 0) return patternCmp; \/\/ MUTANT: disabled/' "$ALTERNATIVES_FILE"
sed -i 's/const equipmentCmp = bData.equipmentScore - aData.equipmentScore;/const equipmentCmp = bData.patternRank - aData.patternRank;/' "$ALTERNATIVES_FILE"
total_mutations=$((total_mutations + 1))
if run_tests "Swap ranking order"; then
  : # failed as expected
else
  caught_mutations=$((caught_mutations + 1))
fi
echo ""

git checkout -- "$ALTERNATIVES_FILE"

echo "=== Mutation Testing Results ==="
echo "Mutations caught: $caught_mutations / $total_mutations"
echo ""

if [ "$caught_mutations" -eq "$total_mutations" ]; then
  echo "✓ All mutations caught"
  exit 0
else
  echo "✗ $(($total_mutations - $caught_mutations)) mutation(s) escaped detection"
  exit 1
fi
