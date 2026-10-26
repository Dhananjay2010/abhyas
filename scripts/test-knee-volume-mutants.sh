#!/usr/bin/env bash
#
# Mutation tests for knee-volume safety filtering.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file (otherwise the mutant is reported as SKIPPED, never silently a no-op).
# A mutant that does not type-check is also SKIPPED: it must be killed by a
# behavioural test, not by tsc. The original file is always restored (trap).
#
# Exit 1 on any skip or survivor.

set -u

KILLED=0
SURVIVED=0
SKIPPED=0
CURRENT_FILE=""
BACKUP=""

restore() {
  if [ -n "$CURRENT_FILE" ] && [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CURRENT_FILE"
    rm -f "$BACKUP"
  fi
  CURRENT_FILE=""
  BACKUP=""
}
trap restore EXIT INT TERM

# replace_once FILE OLD NEW -> 0 if OLD occurred exactly once and was replaced
replace_once() {
  FILE="$1" OLD="$2" NEW="$3" node -e '
    const fs = require("fs");
    const { FILE, OLD, NEW } = process.env;
    const src = fs.readFileSync(FILE, "utf8");
    const n = src.split(OLD).length - 1;
    if (n !== 1) { console.error(`  pattern occurs ${n} times`); process.exit(1); }
    fs.writeFileSync(FILE, src.replace(OLD, () => NEW));
  '
}

# run_mutant NAME FILE OLD NEW TEST...
run_mutant() {
  local name=$1 file=$2 old=$3 new=$4
  shift 4
  echo ""
  echo "$name"
  CURRENT_FILE="$file"
  BACKUP="$(mktemp)"
  cp "$file" "$BACKUP"

  if ! replace_once "$file" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  if ! node node_modules/typescript/lib/tsc.js --noEmit >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  local killer=""
  for t in "$@"; do
    if ! npm run -s "$t" >/dev/null 2>&1; then
      killer="$t"
      break
    fi
  done
  if [ -n "$killer" ]; then
    echo "  ✓ KILLED by $killer"
    KILLED=$((KILLED + 1))
  else
    echo "  ✗ SURVIVED ($*)"
    SURVIVED=$((SURVIVED + 1))
  fi
  restore
}

GENERATE=src/lib/program/generate.ts
KNEE_SAFETY=src/lib/program/knee-safety.ts
V=test:knee-volume
I=test:knee-volume-identity
C=test:count-knee-risk-outside-squat
F=test:pickforslot-filter
X=test:past-knee-excluded

echo "Knee Volume Mutation Testing"
echo "──────────────────────────────────────────────────────────"

npm run -s "$V" >/dev/null 2>&1 || { echo "FATAL: baseline $V fails"; exit 1; }

run_mutant "1. Disable knee-risk filter in pickForSlot (change hasPastKnee gate)" "$GENERATE" \
  '    // Also exclude jumps, thrusters, etc. (Mutant 10 killer)
    const hasCurrentKnee = input.currentInjuryRegions.includes("knee");
    const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;' \
  '    // Also exclude jumps, thrusters, etc. (Mutant 10 killer)
    const hasCurrentKnee = input.currentInjuryRegions.includes("knee");
    const hasPastKnee = false && input.anyKneeInjury && !hasCurrentKnee;' "$V" "$I" "$C" "$F"

run_mutant "2. Remove entire knee-risk filter block from pickForSlot" "$GENERATE" \
  '      // Filter knee-risk exercises (derived contraindications) except slot 0
      if (isFallback || slotIndex !== 0) {
        candidates = candidates.filter((e) => !isKneeRiskForKneeUser(e, true));
        if (candidates.length === 0) continue;
      }' \
  '' "$V" "$I" "$C" "$F"

run_mutant "3. Remove knee-risk filter from SAFE_ALTERNATIVES" "$GENERATE" \
  '    if (hasPastKneeAlt) {
      altCandidates = altCandidates.filter((e) => !isKneeRiskForKneeUser(e, true));
      if (altCandidates.length === 0) continue;
    }' \
  '' "$V" "$I" "$C" "$F"

run_mutant "4. Make helper always return false" "$KNEE_SAFETY" \
  '  // Non-knee users: never knee-risk
  if (!anyKneeInjury) {
    return false;
  }' \
  '  // Non-knee users: never knee-risk
  if (true || !anyKneeInjury) {
    return false;
  }' "$V" "$C" "$F"

run_mutant "5. Remove squat slot exception (filter Barbell Squat from slot 0)" "$GENERATE" \
  '      if (isFallback || slotIndex !== 0) {
        candidates = candidates.filter((e) => !isKneeRiskForKneeUser(e, true));' \
  '      if (isFallback || slotIndex !== 999) {
        candidates = candidates.filter((e) => !isKneeRiskForKneeUser(e, true));' "$V" "$I" "$C"

run_mutant "P1. Remove isExcludedForPastKnee filter from pickForSlot" "$GENERATE" \
  '      // Filter past-knee excluded exercises (jumps, thrusters, etc.) for all slots
      candidates = candidates.filter((e) => !isExcludedForPastKnee(e));
      if (candidates.length === 0) continue;' \
  '' "$V" "$C" "$X"

run_mutant "K1. Ignore explicit knee tag in isKneeRiskForKneeUser" "$KNEE_SAFETY" \
  '  // Check explicit contraindications
  if (ex.contraindicated_regions.includes("knee")) {
    return true;
  }' \
  '' "$V" "$C"

run_mutant "K5. Drop derived squat-pattern check" "$KNEE_SAFETY" \
  '  // Check derived contraindications (squat/lunge pattern, unless in knee-safe list)
  const derived = getDerivedContraindications(ex);
  if (derived.includes("knee")) {
    return true;
  }' \
  '' "$V" "$C"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi
echo "✅ PASSED: All mutants killed"
