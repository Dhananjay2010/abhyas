#!/usr/bin/env bash
#
# Mutation tests for replace-banned-in-planned feature.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# APP rule: no script in the `npm test` chain may modify tracked files. All
# mutants are applied to a scratch copy of the checkout in a mktemp dir
# (node_modules symlinked), and every test runs there; the checkout itself is
# never written. The script fails if the checkout's status changed.
#
# A mutant counts as KILLED only when a test exits non-zero AND prints an
# assertion failure line ("✗ FAIL" / "❌ FAIL") AND did not crash (no
# "CRASH", "✗ ERROR", "Missing script", "Cannot find module", SyntaxError).
# Every test name must be a real package.json script, checked up front.
#
# Exit 1 on any skip or survivor.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS_BEFORE="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/mutant-replace-banned.XXXXXX")"
cleanup_scratch() {
  case "$SCRATCH" in
    "${TMPDIR:-/tmp}"/mutant-replace-banned.*) rm -rf "$SCRATCH" ;;
  esac
}
# Tracked + untracked (not ignored) files, as they are in the working tree.
( cd "$REPO_ROOT" && git ls-files -z --cached --others --exclude-standard ) \
  | ( cd "$REPO_ROOT" && tar --null --ignore-failed-read -T - -cf - 2>/dev/null ) \
  | tar -xf - -C "$SCRATCH"
[ -e "$SCRATCH/node_modules" ] || ln -s "$REPO_ROOT/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" || exit 1
echo "Mutating a scratch copy: $SCRATCH (checkout untouched: $REPO_ROOT)"

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
trap 'restore; cleanup_scratch' EXIT
# MED-3: Handle Ctrl-C/SIGINT - abort whole script
trap 'restore; cleanup_scratch; exit 130' INT TERM

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

  if ! npx tsc --noEmit -p . >/dev/null 2>&1; then
    echo "  ✗ SURVIVED: mutation breaks tsc (not killed by test)"
    SURVIVED=$((SURVIVED + 1))
    restore
    return
  fi

  local tests=("$@")
  local killed=false
  for test in "${tests[@]}"; do
    local output
    output=$(npm run "$test" 2>&1)
    local exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
      if echo "$output" | grep -qE "✗ FAIL|❌ FAIL"; then
        if ! echo "$output" | grep -qE "CRASH|✗ ERROR|Missing script|Cannot find module|SyntaxError"; then
          killed=true
          break
        fi
      fi
    fi
  done

  if [ "$killed" = true ]; then
    echo "  ✓ KILLED"
    KILLED=$((KILLED + 1))
  else
    echo "  ✗ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  fi

  restore
}

echo ""
echo "================================================================================"
echo "MUTANT TESTING: replace-banned-in-planned"
echo "================================================================================"
echo ""

# Mutant 1: Past-tier ban dropped
run_mutant \
  "M1: Past-tier ban dropped" \
  "src/lib/program/past-knee.ts" \
  '"calf-press-on-the-leg-press-machine",' \
  '// MUTANT: calf-press removed' \
  "test:past-knee-calf-press-banned"

# Mutant 2: Current tier uses past list only
run_mutant \
  "M2: Current tier uses past list only" \
  "src/lib/program/past-knee.ts" \
  '...Array.from(CURRENT_KNEE_ONLY_EXCLUDED_SLUGS),' \
  '// MUTANT: Current knee only exclusions removed' \
  "test:replace-banned-in-planned"

# Mutant 3: No-op replacement function
run_mutant \
  "M3: No-op replacement" \
  "src/lib/program/replace-banned-in-planned.ts" \
  'const needsReplacement = shouldReplaceBannedExercise(exercise.slug, tier);' \
  'const needsReplacement = false; // MUTANT: always false' \
  "test:replace-banned-in-planned"

# Mutant 4: Tier determination wrong
run_mutant \
  "M4: Tier determination uses length === 0" \
  "src/lib/program/replace-banned-in-planned.ts" \
  'const hasCurrentKnee = currentInjuryRegions.includes("knee");' \
  'const hasCurrentKnee = currentInjuryRegions.length === 0; // MUTANT' \
  "test:knee-tier-determination"

# Mutant 5: Remove kettlebell-thruster from banned lists
run_mutant \
  "M5: Remove kettlebell-thruster" \
  "src/lib/program/past-knee.ts" \
  '// Kettlebell thruster: banned for both tiers (Decision a: pinned here for M5 test coverage)
  "kettlebell-thruster",' \
  '// MUTANT: kettlebell-thruster removed' \
  "test:current-knee-thruster-pin"

# Mutant 6: Math.random tie-break
run_mutant \
  "M6: Math.random tie-break" \
  "src/lib/session/eligible-swap-list.ts" \
  'const tieBreakFn = (slug: string) => hashString(`${sessionExerciseId}:${slug}`);' \
  'const tieBreakFn = () => Math.random(); // MUTANT' \
  "test:tie-break-determinism-m6"

# Mutant 7: Today call site removed
run_mutant \
  "M7: Today call site removed" \
  "src/app/today/page.tsx" \
  'const result = replaceBannedInPlanned(planned, catalogue, generatorInput);' \
  'const result = { changed: false, rows: planned }; // MUTANT' \
  "test:today-page-cleanup-path"

# Mutant 8 / W3: ensure-session-exercises call site removed
run_mutant \
  "M8/W3: ensure-session-exercises call site removed" \
  "src/lib/session/ensure-session-exercises.ts" \
  'const cleaned = applyBannedCleanup(planned, catalogue, profile, injuries, userId, equipmentIds);' \
  'const cleaned = { rows: planned, changed: false }; // MUTANT' \
  "test:ensure-session-call-site"

# Mutant 9: generate.ts filter reverted to past-only
run_mutant \
  "M9: generate.ts current-knee filter removed" \
  "src/lib/program/generate.ts" \
  '.filter((item) => !(hasCurrentKnee && (isExcludedForPastKnee(item.e) || isExcludedForCurrentKneeOnly(item.e))));' \
  '.filter((item) => !(hasCurrentKnee && isExcludedForPastKnee(item.e))); // MUTANT: current-only removed' \
  "test:current-knee-kb-sweep"

# Mutant 10 / W1: start-session cleanup call removed
run_mutant \
  "M10/W1: start-session cleanup removed" \
  "src/lib/session/start-session-full-deps.ts" \
  'const cleaned = applyBannedCleanup(' \
  'const cleaned = { rows: plannedForCleaning, changed: false }; const _x = applyBannedCleanup && applyBannedCleanup(' \
  "test:start-session-w1"

# Mutant 11: Force-add filter removed
run_mutant \
  "M11: Force-add current-knee filter removed" \
  "src/lib/program/generate.ts" \
  'if (isExcludedForCurrentKneeOnly(e)) return false;' \
  'if (false && isExcludedForCurrentKneeOnly(e)) return false; // MUTANT' \
  "test:force-add-banned-synthetic"

# Mutant W2: start-session cleanBannedExercises returns input unchanged
run_mutant \
  "W2: start-session cleanBannedExercises no-op" \
  "src/lib/session/start-session-full-deps.ts" \
  'const cleaned = applyBannedCleanup(' \
  'const cleaned = { rows: plannedForCleaning, changed: false }; const _y = applyBannedCleanup && applyBannedCleanup(' \
  "test:start-session-w2"

# Mutant W5: shouldTriggerBannedCleanup returns false
run_mutant \
  "W5: shouldTriggerBannedCleanup constant false" \
  "src/lib/today/should-trigger-cleanup.ts" \
  'return cleanupResults.some(r => r.changed);' \
  'return false; // MUTANT: never trigger cleanup' \
  "test:should-trigger-cleanup-w5"

# Mutant W6: cleanup touches wrong table
run_mutant \
  "W6: cleanup table isolation broken" \
  "src/lib/program/clean-banned-planned.ts" \
  '// Delete dropped slot
          const { error } = await supabase
            .from("program_day_exercises")' \
  '// Delete dropped slot
          const { error} = await supabase
            .from("session_exercises") // MUTANT: wrong table' \
  "test:cleanup-table-isolation"

# Mutant H2: ensureSessionExercises not called on resume
run_mutant \
  "H2: ensureSessionExercises unwired on resume" \
  "src/lib/session/start-session-full-core.ts" \
  'deps.ensureSessionExercises(existing.id),' \
  '// MUTANT: ensureSessionExercises removed' \
  "test:ensure-session-h2"

# Mutant W4: Today cleanup call removed
run_mutant \
  "W4: Today cleanup call removed" \
  "src/lib/today/apply-loader-cleanup.ts" \
  'return days.map(day => applyDayCleanup(day, catalogue, generatorInput, cleanupResults));' \
  'return days; // MUTANT: cleanup removed' \
  "test:today-cleanup-w4"

# Mutant W5 call-site: Loader cleanup identity
run_mutant \
  "W5 call-site: Loader cleanup identity" \
  "src/app/today/page.tsx" \
  'days = applyLoaderCleanup(' \
  'days = (applyLoaderCleanup && days) || applyLoaderCleanup(' \
  "test:today-loader-cleanup-w5"

# Mutant W6: Action call stubbed
run_mutant \
  "W6: Action call stubbed" \
  "src/app/today/cleanup-trigger.tsx" \
  'cleanBannedExercises().catch(console.error);' \
  '// MUTANT: action stubbed' \
  "test:today-action-w6"

# Mutant CAS-update: Remove exercise_id filter from update
run_mutant \
  "CAS-update: exercise_id filter removed" \
  "src/lib/program/clean-banned-planned.ts" \
  '.update({ exercise_id: replacementExerciseId })
            .eq("id", originalId)
            .eq("exercise_id", originalExerciseId);' \
  '.update({ exercise_id: replacementExerciseId })
            .eq("id", originalId)
            ; // MUTANT: CAS guard removed' \
  "test:cas-guards"

# Mutant L1-fixed: Drop-slot guard removed
run_mutant \
  "L1: Drop-slot guard removed" \
  "src/lib/program/replace-banned-in-planned.ts" \
  'if (tier === "current") {' \
  'if (false && tier === "current") { // MUTANT' \
  "test:drop-slot-handling"

# Mutant METRIC-start: Don't update metric on start
run_mutant \
  "METRIC-start: Metric not updated" \
  "src/lib/session/start-session-full-deps.ts" \
  'exercises: catalogueExercise ? { metric: catalogueExercise.metric } : e.exercises,' \
  'exercises: e.exercises, // MUTANT: metric not updated' \
  "test:metric-fix-start"

# Mutant METRIC-ensure: Don't update metric on ensure
run_mutant \
  "METRIC-ensure: Metric not updated" \
  "src/lib/session/ensure-session-exercises.ts" \
  'const metric = catalogueMap?.get(p.exercise_id)?.metric ?? metricOf(p.exercises);' \
  'const metric = metricOf(p.exercises); // MUTANT: catalogue metric ignored' \
  "test:metric-fix-ensure"

echo ""
echo "================================================================================"
echo "RESULTS"
echo "================================================================================"
echo "Killed:   $KILLED"
echo "Survived: $SURVIVED"
echo "Skipped:  $SKIPPED"
echo ""

# Check that checkout is clean
STATUS_AFTER="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
if [ "$STATUS_BEFORE" != "$STATUS_AFTER" ]; then
  echo "❌ FAIL: Checkout status changed"
  git -C "$REPO_ROOT" status --porcelain
  exit 1
fi

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survivor(s), $SKIPPED skipped"
  exit 1
fi

echo "✅ PASSED: All mutants killed"
exit 0
