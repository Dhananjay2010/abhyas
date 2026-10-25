#!/usr/bin/env bash
# Mutation testing for equipment progression fix
# Validates: Rule 2 clamp, one-step increase cap, hold reasons, two-miss RAW 90% cap, mode weight

set -euo pipefail

PROG="src/lib/program/progression.ts"
BACKUP=$(mktemp /tmp/prog-backup.XXXXXX.ts)

COUNT=0
KILLED=0
SURVIVED=0
SKIPPED=0

TESTS=(
  "npm run test:first-miss-pinned"
  "npm run test:first-miss-two-miss-invariant"
  "npm run test:increase-cap"
  "npm run test:message-weight-consistency"
  "npm run test:kettlebell-success"
)

echo "=== MUTATION TESTING: equipment progression fix ==="
echo

restore() {
  [ -f "$BACKUP" ] && cp "$BACKUP" "$PROG" && rm -f "$BACKUP"
}

trap restore EXIT
trap 'restore; exit 1' INT TERM

cp "$PROG" "$BACKUP"
echo "✓ Backup created"
echo

echo "Running baseline..."
for t in "${TESTS[@]}"; do
  if ! $t > /dev/null 2>&1; then
    echo "❌ Baseline failed: $t"
    $t 2>&1 | tail -30
    exit 1
  fi
done
echo "✅ Baseline pass"
echo

test_mutant() {
  local name="$1"
  local fn="$2"
  
  COUNT=$((COUNT + 1))
  printf "%-75s " "[$COUNT] $name"
  
  cp "$BACKUP" "$PROG"
  
  if ! $fn 2>/dev/null; then
    echo "⚠️  SKIP (mutation failed)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  if cmp -s "$PROG" "$BACKUP"; then
    echo "⚠️  SKIP (unchanged)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  if ! npx tsc --noEmit > /dev/null 2>&1; then
    echo "⚠️  SKIP (no compile)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  local fail=0
  for t in "${TESTS[@]}"; do
    if ! $t > /dev/null 2>&1; then
      fail=1
      break
    fi
  done
  
  if [ "$fail" -eq 0 ]; then
    echo "❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  else
    echo "✅ KILLED"
    KILLED=$((KILLED + 1))
  fi
}

# M1: Remove Rule 2 clamp
m1() {
  # Comment out lines 756-763 (Rule 2 block)
  sed -i '756,763s/^/\/\/ MUTANT: /' "$PROG"
}
test_mutant "Remove Rule 2 clamp (allow first-miss < two-miss)" m1

# M2: Break one-step increase cap
m2() {
  # Line 548: change next = nextGrid to next = from + 2 * gridStep
  sed -i '548s/next = nextGrid;/next = from + 2 * gridStep;/' "$PROG"
}
test_mutant "Break one-step increase cap (multi-step jumps)" m2

# M3: Break kettlebell strictly-above
m3() {
  # Line 544: change > to >=
  sed -i '544s/if (bell > from + epsilon) {/if (bell >= from) {/' "$PROG"
}
test_mutant "Break kettlebell strictly-above (same bell allowed)" m3

# M4: Remove weight from hold messages
m4() {
  sed -i 's/holding at \${displayWeight(currentWeight, unit)}/holding at this weight/g' "$PROG"
  sed -i 's/Staying at \${displayWeight(currentWeight, unit)}/Staying at this weight/g' "$PROG"
}
test_mutant "Remove weight from hold messages" m4

# M5: Replace mode with heaviest
m5() {
  # Lines 435-448: replace mostCommonWorkingWeight body
  sed -i '435,448c\
    const weights = sets.map(s => s.weightKg ?? 0).filter(w => w > 0);\
    return weights.length > 0 ? Math.max(...weights) : 0;' "$PROG"
}
test_mutant "Replace mode with heaviest for fallback" m5

# M6: Two-miss: change >= to > (reject values at target, only accept strictly above)
m6() {
  # Line 640: kettlebell two-miss, change >= to >
  sed -i '640s/if (bell >= target/if (bell > target/' "$PROG"
}
test_mutant "Two-miss RAW 90%: reject target value (need strictly above)" m6

# M7: Two-miss: standard equipment, change >= to >
m7() {
  # Find line with "nextDown >= target" and change to >
  sed -i 's/if (nextDown >= target - 0.001 && nextDown < weight - 0.001) {/if (nextDown > target \&\& nextDown < weight) {/' "$PROG"
}
test_mutant "Two-miss standard equipment: reject target value" m7

# M8: Disable Rule 1 (20% cut guard)
m8() {
  # Comment out Rule 1 block (lines 747-754)
  sed -i '747,754s/^/\/\/ MUTANT: /' "$PROG"
}
test_mutant "Disable Rule 1 (allow >20% cuts)" m8

# M9: Swap smallest-weight holdReason to allow overwrite
m9() {
  # Line 713: change candidateWeight = currentWeight; to candidateWeight = candidateWeight;
  sed -i '713s/candidateWeight = currentWeight;/candidateWeight = candidateWeight;/' "$PROG"
}
test_mutant "Allow overwriting holdReason=smallest" m9

echo
echo "==================================="
echo "Total: $COUNT | Killed: $KILLED | Survived: $SURVIVED | Skipped: $SKIPPED"
echo

if [ "$SURVIVED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
else
  echo "✅ PASSED: All $KILLED mutants killed"
  exit 0
fi
