#!/bin/bash
set -e

echo "=== Comprehensive Mutant Testing for Swap Variety ==="
echo ""

cp src/lib/program/alternatives.ts /tmp/alternatives-original.ts

# Mutant 1: Behind-the-neck filter removed
echo "MUTANT 1: Behind-the-neck filter removed"
cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
sed -i '/Exclude behind-the-neck/,+1d' src/lib/program/alternatives.ts

RESULT=$(npx tsx scripts/test-swap-variety.ts 2>&1)
FAIL_COUNT=$(echo "$RESULT" | grep -c "FAIL" || echo 0)
echo "  Failures: $FAIL_COUNT"
echo "$RESULT" | grep "FAIL" | head -3

cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
echo ""

# Mutant 2: Variety spreading removed (back to simple sequential)
echo "MUTANT 2: Variety spreading removed"
cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts

# Replace variety logic with simple sequential selection
LINE=$(grep -n "Apply equipment variety" src/lib/program/alternatives.ts | cut -d: -f1)
head -n $((LINE - 1)) src/lib/program/alternatives.ts > /tmp/temp.ts
cat >> /tmp/temp.ts << 'EOF'
  // MUTANT 2: Simple sequential selection without variety
  const result: T[] = [];
  for (const item of nameDeduped) {
    result.push(item.exercise);
    if (result.length >= limit) break;
  }
  
  return result;
}
EOF
mv /tmp/temp.ts src/lib/program/alternatives.ts

RESULT=$(npx tsx scripts/test-swap-variety.ts 2>&1)
FAIL_COUNT=$(echo "$RESULT" | grep -c "FAIL" || echo 0)
echo "  Failures: $FAIL_COUNT"
echo "$RESULT" | grep "FAIL" | head -3

cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
echo ""

# Mutant 3: Equipment filter removed
echo "MUTANT 3: Equipment filter removed"
cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
sed -i '/9. Equipment check: all-of semantics/,+6d' src/lib/program/alternatives.ts

RESULT=$(npx tsx scripts/test-swap-variety.ts 2>&1)
FAIL_COUNT=$(echo "$RESULT" | grep -c "FAIL" || echo 0)
echo "  Failures: $FAIL_COUNT"
echo "$RESULT" | grep "FAIL" | head -3

cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
echo ""

# Mutant 4: Dynamic pull relevance filter removed
echo "MUTANT 4: Dynamic pull relevance filter removed (allows isolation/plyometric)"
cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
sed -i '/7. For dynamic pull, prefer compound/,+5d' src/lib/program/alternatives.ts

RESULT=$(npx tsx scripts/test-swap-variety.ts 2>&1)
FAIL_COUNT=$(echo "$RESULT" | grep -c "FAIL" || echo 0)
echo "  Failures: $FAIL_COUNT"
echo "$RESULT" | grep "FAIL" | head -3

cp /tmp/alternatives-original.ts src/lib/program/alternatives.ts
echo ""

echo "=== SUMMARY ==="
echo "All mutants should be caught (non-zero failures)"
