#!/bin/bash
set -e

echo "Testing mutants for swap variety fix..."
echo ""

# Backup the original file
cp src/lib/program/alternatives.ts src/lib/program/alternatives.ts.backup

# Mutant 1: Remove behind-the-neck filter
echo "=== MUTANT 1: Behind-the-neck filter removed ==="
sed -i.bak '/Exclude behind-the-neck variants/,/if (isBehindTheNeck(candidate)) continue;/d' src/lib/program/alternatives.ts
if npx tsx scripts/test-swap-variety.ts 2>&1 | grep -q "FAIL"; then
    MUTANT1_FAILS=$(npx tsx scripts/test-swap-variety.ts 2>&1 | grep "test(s) failed" | grep -o '[0-9]\+' | head -1)
    echo "✓ Mutant 1 caught: $MUTANT1_FAILS failure(s)"
else
    echo "✗ Mutant 1 NOT caught"
    MUTANT1_FAILS=0
fi
# Restore
cp src/lib/program/alternatives.ts.backup src/lib/program/alternatives.ts
echo ""

# Mutant 2: Remove variety spreading (equipment round-robin)
echo "=== MUTANT 2: Variety spreading removed ==="
# Replace the round-robin logic with simple sequential selection
cat > /tmp/mutant2.txt << 'EOF'
  // MUTANT: Direct selection without variety spreading
  const result: T[] = [];
  for (const item of nameDeduped) {
    result.push(item.exercise);
    if (result.length >= limit) break;
  }
  return result;
}
EOF

# Find the start of the round-robin section and replace until end of function
sed -i.bak '/Group by equipment signature for variety spreading/,$ {
  /Group by equipment signature for variety spreading/r /tmp/mutant2.txt
  d
}' src/lib/program/alternatives.ts

if npx tsx scripts/test-swap-variety.ts 2>&1 | grep -q "FAIL"; then
    MUTANT2_FAILS=$(npx tsx scripts/test-swap-variety.ts 2>&1 | grep "test(s) failed" | grep -o '[0-9]\+' | head -1)
    echo "✓ Mutant 2 caught: $MUTANT2_FAILS failure(s)"
else
    echo "✗ Mutant 2 NOT caught"
    MUTANT2_FAILS=0
fi
# Restore
cp src/lib/program/alternatives.ts.backup src/lib/program/alternatives.ts
echo ""

# Mutant 3: Remove equipment filter
echo "=== MUTANT 3: Equipment filter removed ==="
sed -i.bak '/Equipment check: all-of semantics/,/if (!allAvailable) continue;/d' src/lib/program/alternatives.ts
if npx tsx scripts/test-swap-variety.ts 2>&1 | grep -q "FAIL"; then
    MUTANT3_FAILS=$(npx tsx scripts/test-swap-variety.ts 2>&1 | grep "test(s) failed" | grep -o '[0-9]\+' | head -1)
    echo "✓ Mutant 3 caught: $MUTANT3_FAILS failure(s)"
else
    echo "✗ Mutant 3 NOT caught"
    MUTANT3_FAILS=0
fi
# Restore
cp src/lib/program/alternatives.ts.backup src/lib/program/alternatives.ts
echo ""

# Clean up
rm -f src/lib/program/alternatives.ts.backup src/lib/program/alternatives.ts.bak /tmp/mutant2.txt

echo "=== SUMMARY ==="
echo "Mutant 1 (behind-the-neck filter removed): $MUTANT1_FAILS failure(s)"
echo "Mutant 2 (variety spreading removed): $MUTANT2_FAILS failure(s)"
echo "Mutant 3 (equipment filter removed): $MUTANT3_FAILS failure(s)"
