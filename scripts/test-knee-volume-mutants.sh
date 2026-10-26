#!/usr/bin/env bash
#
# Mutation tests for knee-volume safety filtering.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file (otherwise the mutant is reported as SKIPPED, never silently a no-op).
# A mutant that does not type-check is also SKIPPED: it must be killed by a
# behavioural test, not by tsc. The original file is always restored (trap).
#
# Exit 1 on any skip, survivor or crash.

set -u

GENERATE=src/lib/program/generate.ts
KNEE_SAFETY=src/lib/program/knee-safety.ts
ALTERNATIVES=src/lib/program/alternatives.ts

# Create private backup directory with mktemp -d
BACKUP_DIR=$(mktemp -d)

CURRENT_FILE=""
BACKUP=""

restore() {
  if [ -n "$CURRENT_FILE" ] && [ -n "$BACKUP" ]; then
    if [ -s "$BACKUP" ]; then
      cp "$BACKUP" "$CURRENT_FILE"
    fi
    rm -f "$BACKUP"
  fi
  CURRENT_FILE=""
  BACKUP=""
}

cleanup() {
  restore
  if [ -s "$BACKUP_DIR/generate.ts" ]; then
    cp "$BACKUP_DIR/generate.ts" "$GENERATE"
  fi
  if [ -s "$BACKUP_DIR/knee-safety.ts" ]; then
    cp "$BACKUP_DIR/knee-safety.ts" "$KNEE_SAFETY"
  fi
  if [ -s "$BACKUP_DIR/alternatives.ts" ]; then
    cp "$BACKUP_DIR/alternatives.ts" "$ALTERNATIVES"
  fi
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT INT TERM

# Backup originals - check cp succeeded before counting as backed up
if ! cp "$GENERATE" "$BACKUP_DIR/generate.ts"; then
  echo "FATAL: failed to backup $GENERATE"
  exit 1
fi
if ! cp "$KNEE_SAFETY" "$BACKUP_DIR/knee-safety.ts"; then
  echo "FATAL: failed to backup $KNEE_SAFETY"
  exit 1
fi
if ! cp "$ALTERNATIVES" "$BACKUP_DIR/alternatives.ts"; then
  echo "FATAL: failed to backup $ALTERNATIVES"
  exit 1
fi

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
  BACKUP="$BACKUP_DIR/mutant-$(basename "$file")"
  if ! cp "$file" "$BACKUP"; then
    echo "  ⊘ SKIP: backup failed"
    SKIPPED=$((SKIPPED + 1))
    BACKUP=""
    return
  fi

  if ! replace_once "$file" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  # Verify mutation was applied
  if diff -q "$BACKUP" "$file" >/dev/null 2>&1; then
    echo "  ⊘ SKIP: file unchanged after mutation"
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
  
  killer=""
  for t in "$@"; do
    output=$(npm run -s "$t" 2>&1)
    exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
      # Check for crashes: uncaught errors with stack traces (lines starting with "at ")
      if echo "$output" | grep -qE '^\s+at '; then
        # Stack trace found - this is a crash
        # But if it also contains FAIL or ✗, count it as killed (test printed assertion before crash)
        if echo "$output" | grep -qE '(✗|FAIL)'; then
          killer="$t"
          break
        else
          echo "  ✗ CRASH in $t (uncaught exception)"
          CRASHED=$((CRASHED + 1))
          restore
          return
        fi
      fi
      
      # Check for assertion failures (no stack trace)
      if echo "$output" | grep -qE '(✗|FAIL)'; then
        killer="$t"
        break
      fi
      
      # Non-zero exit without assertion or stack trace
      echo "  ✗ CRASH in $t (exit $exit_code, no assertion message)"
      CRASHED=$((CRASHED + 1))
      restore
      return
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

KILLED=0
SURVIVED=0
SKIPPED=0
CRASHED=0

V=test:knee-volume
I=test:knee-volume-identity
C=test:count-knee-risk-outside-squat
F=test:pickforslot-filter
X=test:past-knee-excluded

echo "Knee Volume Mutation Testing"
echo "──────────────────────────────────────────────────────────"

# Baseline: all five tests must pass on unmutated code
echo "Running baseline tests..."
BASELINE_FAILED=0
for t in "$V" "$I" "$C" "$F" "$X"; do
  if ! npm run -s "$t" >/dev/null 2>&1; then
    echo "FATAL: baseline test $t fails"
    BASELINE_FAILED=1
  fi
done
if [ $BASELINE_FAILED -ne 0 ]; then
  exit 1
fi
echo "✓ All baseline tests passed"
echo ""

run_mutant "1. Disable knee-risk filter in pickForSlot (change hasPastKnee gate)" "$GENERATE" \
  '    const hasCurrentKnee = input.currentInjuryRegions.includes("knee");
    const hasPastKnee = input.anyKneeInjury && !hasCurrentKnee;
    if (hasPastKnee) {' \
  '    const hasCurrentKnee = input.currentInjuryRegions.includes("knee");
    const hasPastKnee = false && input.anyKneeInjury && !hasCurrentKnee;
    if (hasPastKnee) {' "$V" "$I" "$C" "$F" "$X"

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
  '' "$V" "$I" "$C" "$F" "$X"

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
  '      // Filter knee-risk exercises (derived contraindications) except slot 0
      if (isFallback || slotIndex !== 0) {' \
  '      // Filter knee-risk exercises (derived contraindications) except slot 0
      if (isFallback || slotIndex !== 999) {' "$V" "$I" "$C"

run_mutant "P1. Remove isExcludedForPastKnee filter from pickForSlot" "$GENERATE" \
  '        // 3. RNG breaks ties (provides variety for accessories across blocks)
        return b.rng - a.rng;
      })
      .filter((item) => !EXCLUDED_EXERCISE_SLUGS.has(item.e.slug))
      .filter((item) => !(hasPastKnee && isExcludedForPastKnee(item.e)));' \
  '        // 3. RNG breaks ties (provides variety for accessories across blocks)
        return b.rng - a.rng;
      })
      .filter((item) => !EXCLUDED_EXERCISE_SLUGS.has(item.e.slug));' "$X"

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

run_mutant "MED-2-TIME. Remove past-knee calf cap in time-fill" "$GENERATE" \
  '            // MED-2: For lower/full days, cap calf exercises at 4 sets (not 5)
            if (isLowerOrFullDay && candidate?.movement_pattern === "calf" && ex.targetSets >= 4) return false;' \
  '            // MED-2: For lower/full days, cap calf exercises at 4 sets (not 5)
            if (false && isLowerOrFullDay && candidate?.movement_pattern === "calf" && ex.targetSets >= 4) return false;' \
  test:med2-time-fill-cap

run_mutant "FB-C-WALL. Remove Wall Sit sort logic for Full Body days" "$GENERATE" \
  '      // For past-knee users on Full Body days: Wall Sit comes after other lower-body exercises
      const hasPastKnee = input.anyKneeInjury && !hasKneeInjury;
      const isFullDay = entry.focus === "full_body";
      if (hasPastKnee && isFullDay) {
        const aIsWallSit = a.ex.slug === "wall-sit";
        const bIsWallSit = b.ex.slug === "wall-sit";
        const lowerBodyPatterns = new Set(["squat", "lunge", "hinge", "calf"]);
        const aIsLower = lowerBodyPatterns.has(a.ex.movement_pattern);
        const bIsLower = lowerBodyPatterns.has(b.ex.movement_pattern);
        
        // Wall Sit after other lower-body, but before upper-body and core
        if (aIsWallSit && bIsLower && !bIsWallSit) return 1;
        if (bIsWallSit && aIsLower && !aIsWallSit) return -1;
      }' \
  '' test:knee-volume test:knee-volume-identity test:count-knee-risk-outside-squat test:full-body-c-lunge

run_mutant "KNEE-CTR-GEN. Remove knee-contraindicated exclusion from generation (isEligible)" "$GENERATE" \
  '  // Knee-contraindicated exercises excluded for ANY knee injury (past or current)
  if (input.anyKneeInjury && ex.contraindicated_regions.includes("knee")) {
    return false;
  }' \
  '' test:knee-contraindicated

run_mutant "KNEE-CTR-ALT. Remove knee-contraindicated exclusion from swaps (alternatives)" "$ALTERNATIVES" \
  '    // 8b. Knee-contraindicated exercises excluded for ANY knee injury (past or current)
    if ((ctx.anyKneeInjury ?? false) && candidate.contraindicated_regions.includes("knee")) {
      continue;
    }' \
  '' test:knee-contraindicated

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo "Mutants crashed:  $CRASHED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ] || [ $CRASHED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped, $CRASHED crashed"
  exit 1
fi

echo "✅ PASSED: All mutants killed"
