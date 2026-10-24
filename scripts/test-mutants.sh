#!/usr/bin/env bash
set -euo pipefail

# Mutation testing for Task U3 + QA L-8
# Tests that exclusions and pullover rule are enforced

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALTERNATIVES_FILE="$SCRIPT_DIR/../src/lib/program/alternatives.ts"
EXCLUSIONS_FILE="$SCRIPT_DIR/../src/lib/program/exclusions.ts"
BACKUP_ALT_FILE="/tmp/alternatives.ts.backup"
BACKUP_EXC_FILE="/tmp/exclusions.ts.backup"

echo "=== Mutation Testing for Swap Variety ==="
echo ""

# Backup originals
cp "$ALTERNATIVES_FILE" "$BACKUP_ALT_FILE"
cp "$EXCLUSIONS_FILE" "$BACKUP_EXC_FILE"

cleanup() {
  cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE" 2>/dev/null || true
  cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE" 2>/dev/null || true
  rm -f "$BACKUP_ALT_FILE" "$BACKUP_EXC_FILE"
}

trap cleanup EXIT

run_tests() {
  local mutation_name="$1"
  echo "Testing: $mutation_name"
  
  local caught=0
  
  # A mutant is caught if EITHER test fails (exits nonzero)
  if npx tsx "$SCRIPT_DIR/test-swap-variety.ts" &>/dev/null; then
    echo "  ✗ test-swap-variety.ts passed (mutation NOT caught)"
  else
    echo "  ✓ test-swap-variety.ts failed (caught)"
    caught=1
  fi
  
  if npx tsx "$SCRIPT_DIR/test-alternatives.ts" &>/dev/null; then
    if [ "$caught" -eq 0 ]; then
      echo "  ✗ test-alternatives.ts passed (mutation NOT caught)"
    fi
  else
    echo "  ✓ test-alternatives.ts failed (caught)"
    caught=1
  fi
  
  # Return 0 (success) if caught, 1 (failure) if not caught
  if [ "$caught" -eq 1 ]; then
    return 0
  else
    return 1
  fi
}

verify_mutation() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  
  if ! grep -q "$pattern" "$file"; then
    echo "  ✗ FATAL: Mutation did not change the file (pattern not found: $description)"
    echo "     This mutant is a no-op and must be fixed."
    exit 2
  fi
}

total_mutations=0
caught_mutations=0
survived_mutations=0

echo "1. Mutation: Remove standing-barbell-press-behind-neck from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"standing-barbell-press-behind-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "standing-barbell-press-behind-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove standing-barbell-press-behind-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "2. Mutation: Remove wide-grip-pulldown-behind-the-neck from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"wide-grip-pulldown-behind-the-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "wide-grip-pulldown-behind-the-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-pulldown-behind-the-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "3. Mutation: Remove wide-grip-rear-pull-up from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"wide-grip-rear-pull-up",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "wide-grip-rear-pull-up removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove wide-grip-rear-pull-up"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "4. Mutation: Remove barbell-guillotine-bench-press from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"barbell-guillotine-bench-press",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "barbell-guillotine-bench-press removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove barbell-guillotine-bench-press"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "5. Mutation: Remove neck-press from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"neck-press",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "neck-press removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove neck-press"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "6. Mutation: Remove low-pulley-row-to-neck from exclusion set"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/"low-pulley-row-to-neck",/\/\/ MUTANT: removed/' "$EXCLUSIONS_FILE"
verify_mutation "$EXCLUSIONS_FILE" "// MUTANT: removed" "low-pulley-row-to-neck removal marker"
total_mutations=$((total_mutations + 1))
if run_tests "Remove low-pulley-row-to-neck"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "7. Mutation: Remove pullover filter entirely"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i '/if (isCompoundPull && !isPulloverOriginal)/,/}/d' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "// 4. Pattern priority" "next section after deleted pullover filter"
total_mutations=$((total_mutations + 1))
if run_tests "Remove pullover filter"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "8. Mutation: Apply pullover filter to every original (drop !isPulloverOriginal)"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (isCompoundPull)/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "if (isCompoundPull)" "mutated condition without isPulloverOriginal"
total_mutations=$((total_mutations + 1))
if run_tests "Apply pullover filter to every original"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "9. Mutation: Apply pullover filter only to vertical pulls"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/current.movement_pattern === "horizontal_pull" || //' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" 'current.movement_pattern === "vertical_pull"' "vertical_pull without horizontal_pull"
total_mutations=$((total_mutations + 1))
if run_tests "Vertical pulls only"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "10. Mutation: Drop compound requirement for pullover filter"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
cp "$ALTERNATIVES_FILE" /tmp/before-mut9.ts
sed -i 's/if (isCompoundPull && !isPulloverOriginal)/if (!isPulloverOriginal)/' "$ALTERNATIVES_FILE"
if diff -q /tmp/before-mut9.ts "$ALTERNATIVES_FILE" >/dev/null; then
  echo "  ✗ FATAL: Mutation did not change the file (sed had no effect)"
  exit 2
fi
total_mutations=$((total_mutations + 1))
if run_tests "Drop compound requirement"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "10. Mutation: Rank equipment fit before movement pattern"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/if (a.patternRank !== b.patternRank) return a.patternRank - b.patternRank;/if (a.equipmentScore !== b.equipmentScore) return b.equipmentScore - a.equipmentScore;/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "if (a.equipmentScore !== b.equipmentScore) return b.equipmentScore - a.equipmentScore;" "equipment before pattern"
total_mutations=$((total_mutations + 1))
if run_tests "Rank equipment before pattern"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

echo "11. Mutation: Drop impact penalty"
cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"
sed -i 's/const impactPenalty =/const impactPenalty = 0; \/\/ MUTANT: was/' "$ALTERNATIVES_FILE"
verify_mutation "$ALTERNATIVES_FILE" "const impactPenalty = 0; // MUTANT: was" "impact penalty zeroed"
total_mutations=$((total_mutations + 1))
if run_tests "Drop impact penalty"; then
  caught_mutations=$((caught_mutations + 1))
else
  survived_mutations=$((survived_mutations + 1))
fi
echo ""

cp "$BACKUP_ALT_FILE" "$ALTERNATIVES_FILE"
cp "$BACKUP_EXC_FILE" "$EXCLUSIONS_FILE"

echo "=== Mutation Testing Results ==="
echo "Total mutations: 12"
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
