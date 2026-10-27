#!/bin/bash
# Mutant test for PR #168 (rebuild after block end keeps Progress; rebuild keeps
# block 1's anchor). Every mutant must be killed by an ASSERTION, never a crash.
#
#   Mutant 1        REAL_DB only (database-seed-test job): skip rollover in rebuildPlanCore
#   Mutants 2-5     progress start date / buildDayRecords / rebuildPlanCore order
#   Mutant A        Progress page drops effectiveStart
#   Mutant B        buildPlanLogic bypasses rebuildPlanCore
#   Mutant C        buildPlan action calls createBlockForUser directly (main's old body)
#   Mutants T1/T2/T4  the one local `today` stops reaching both RPCs
#   Mutant E1       fetchActiveBlock swallows its error
#   Mutant G        buildPlanLogic shows the raw error message
#   Mutant L        rollover.ts stops logging the original rollover_block error
#   Mutant R1       rollover boundary `>=` becomes `>`
#   Mutant D        a rebuilt block 1 anchors to today
#   Mutant F        a rebuilt block 1 is not anchored (main's behaviour)
#   Mutant J        the anchor comes from the active row, not block 1's first start
#   Mutant H        Settings' plan-stale banner is not cleared after a rebuild

set -e

# Mutant 1 requires REAL_DB; mutants 2-7 run against unit tests
RUN_MUTANT_1=0
if [ "$REAL_DB" = "1" ]; then
  RUN_MUTANT_1=1
  
  # Source guard and check
  source "$(dirname "$0")/lib-db-reset-guard.sh"
  if ! check_db_reset_guard_bash check "supabase/config.toml"; then
    echo "❌ DB reset guard check failed:"
    check_db_reset_guard_bash explain "supabase/config.toml"
    exit 1
  fi

  # Check SUPABASE_SERVICE_ROLE_KEY early - test script needs it
  if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ FAIL: SUPABASE_SERVICE_ROLE_KEY not set (mutants would falsely appear killed)"
    exit 1
  fi
fi

REBUILD_CORE="src/lib/program/rebuild-plan-core.ts"
PROGRESS_START_FILE="src/lib/progress/progress-start-date.ts"
STREAKS_FILE="src/lib/progress/streaks.ts"
ROLLOVER_FILE="src/lib/program/rollover.ts"
PROGRESS_PAGE_FILE="src/app/progress/page.tsx"
BUILD_PLAN_LOGIC_FILE="src/lib/program/build-plan-logic.ts"
TMP=$(mktemp -d)
BACKUP_CORE="$TMP/rebuild-plan-core.ts"
BACKUP_PROGRESS_START="$TMP/progress-start-date.ts"
BACKUP_STREAKS="$TMP/streaks.ts"
BACKUP_ROLLOVER="$TMP/rollover.ts"
BACKUP_PROGRESS_PAGE="$TMP/progress-page.tsx"
BACKUP_BUILD_PLAN_LOGIC="$TMP/build-plan-logic.ts"

echo "Mutant test: rebuild rollover and progress defensive fixes"
echo "============================================================"
echo ""

# Backup originals
cp "$REBUILD_CORE" "$BACKUP_CORE"
cp "$PROGRESS_START_FILE" "$BACKUP_PROGRESS_START"
cp "$STREAKS_FILE" "$BACKUP_STREAKS"
cp "$ROLLOVER_FILE" "$BACKUP_ROLLOVER"
cp "$PROGRESS_PAGE_FILE" "$BACKUP_PROGRESS_PAGE"
cp "$BUILD_PLAN_LOGIC_FILE" "$BACKUP_BUILD_PLAN_LOGIC"

cleanup() {
  if [ "${cleanup_done:-0}" = "1" ]; then
    return
  fi
  cleanup_done=1
  echo "Restoring original files..."
  cp "$BACKUP_CORE" "$REBUILD_CORE"
  cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
  cp "$BACKUP_STREAKS" "$STREAKS_FILE"
  cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"
  cp "$BACKUP_PROGRESS_PAGE" "$PROGRESS_PAGE_FILE"
  cp "$BACKUP_BUILD_PLAN_LOGIC" "$BUILD_PLAN_LOGIC_FILE"
  restore_generic
  rm -rf "$TMP"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

KILLED=0
SURVIVED=0

# ---- generic mutant runner (Mutants C onwards) ------------------------------
GENERIC_FILES=()
backup_generic() {
  local f=$1 key
  key=$(printf '%s' "$f" | tr '/' '_')
  if [ ! -f "$TMP/generic_$key" ]; then
    cp "$f" "$TMP/generic_$key"
    GENERIC_FILES+=("$f")
  fi
}
restore_generic() {
  local f key
  for f in "${GENERIC_FILES[@]}"; do
    key=$(printf '%s' "$f" | tr '/' '_')
    [ -f "$TMP/generic_$key" ] && cp "$TMP/generic_$key" "$f"
  done
}
# run_mutant ID "description" FILE PERL_EXPR TEST_FILE...
# Applies PERL_EXPR (perl -0pi) to FILE, runs each test with npx tsx, restores FILE.
# Killed = at least one test fails by assertion and none crashes.
run_mutant() {
  local id=$1 desc=$2 file=$3 expr=$4
  shift 4
  echo ""
  echo "Mutant $id: $desc"
  backup_generic "$file"
  local key orig
  key=$(printf '%s' "$file" | tr '/' '_')
  orig="$TMP/generic_$key"
  cp "$orig" "$file"
  perl -0pi -e "$expr" "$file"
  if cmp -s "$orig" "$file"; then
    echo "✗ FAIL: Mutant $id did not apply (files are identical)"
    exit 1
  fi
  local t log killed_by=""
  for t in "$@"; do
    log=$(mktemp "$TMP/mutant-$id.XXXXXX")
    if npx tsx "$t" > "$log" 2>&1; then
      continue
    fi
    if grep -qE "^Test error:|SyntaxError|ReferenceError|TypeError|Cannot find module|Transform failed" "$log"; then
      echo "✗ FAIL: Mutant $id crashed $t instead of failing an assertion"
      cat "$log"
      cp "$orig" "$file"
      exit 1
    fi
    if ! grep -qE "❌ FAIL|AssertionError" "$log"; then
      echo "✗ FAIL: Mutant $id made $t exit non-zero without a failed assertion"
      cat "$log"
      cp "$orig" "$file"
      exit 1
    fi
    grep -E "❌ FAIL|AssertionError|message: " "$log" | head -3
    killed_by="$killed_by $t"
  done
  cp "$orig" "$file"
  if [ -n "$killed_by" ]; then
    echo "✓ Mutant $id killed by assertion in:$killed_by"
    KILLED=$((KILLED + 1))
  else
    echo "✗ SURVIVED: Mutant $id"
    SURVIVED=$((SURVIVED + 1))
  fi
}

if [ "$RUN_MUTANT_1" = "1" ]; then
  # Baseline: Run unmutated tests first to ensure DB is working
  echo "Baseline: Running unmutated tests to verify database is accessible"
  echo ""

  BASELINE_LOG="$TMP/baseline.log"
  if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > "$BASELINE_LOG" 2>&1; then
    echo "✓ Baseline test passed (database is accessible and test works)"
  else
    echo "❌ FAIL: Baseline test failed (database may be down or test has a bug)"
    cat "$BASELINE_LOG"
    exit 1
  fi

  echo ""

  # Mutant 1: Stub ensureCurrentBlock to return "none" (skip rollover)
  echo "Mutant 1: Stub ensureCurrentBlock to return none (skip rollover)"
  echo "Expected: test-rebuild-rollover-progress-real-db.ts should fail"
  echo ""

  cp "$BACKUP_CORE" "$REBUILD_CORE"
  # Replace the ensureCurrentBlock call and comment out the error check
  sed -i 's/const rollover = await deps\.ensureCurrentBlock(activeBlock);/const rollover = { status: "none" as const }; \/\/ await deps.ensureCurrentBlock(activeBlock);/' "$REBUILD_CORE"
  sed -i '/if (rollover.status === "error") {/,/^  }$/s/^/\/\/ /' "$REBUILD_CORE"

  # Verify the mutation applied
  if ! grep -q 'const rollover = { status: "none" as const }; // await deps.ensureCurrentBlock' "$REBUILD_CORE"; then
    echo "✗ FAIL: Mutant 1 did not apply (replacement not found)"
    exit 1
  fi

  MUTANT1_LOG=$(mktemp)
  if REAL_DB=1 npx tsx scripts/test-rebuild-rollover-progress-real-db.ts > "$MUTANT1_LOG" 2>&1; then
    echo "✗ SURVIVED: Mutant 1 (test passes without rollover)"
    cat "$MUTANT1_LOG"
    SURVIVED=$((SURVIVED + 1))
  else
    # Check that test actually ran (not skipped)
    if grep -q "⏭️.*Skipping" "$MUTANT1_LOG"; then
      echo "✗ FAIL: Mutant test was skipped, not actually run"
      cat "$MUTANT1_LOG"
      exit 1
    fi
    # Check that an assertion killed it
    if ! grep -q "❌ FAIL" "$MUTANT1_LOG"; then
      echo "✗ FAIL: Mutant 1 killed by crash, not assertion"
      cat "$MUTANT1_LOG"
      exit 1
    fi
    echo "✓ Mutant 1 killed (test fails without rollover)"
    KILLED=$((KILLED + 1))
  fi
  rm -f "$MUTANT1_LOG"

  # Restore for next mutant
  cp "$BACKUP_CORE" "$REBUILD_CORE"
else
  echo "⏭️  Skipping Mutant 1 (requires REAL_DB=1)"
  echo ""
fi

# Mutant 2: Revert progressStartDate to just first block date
echo ""
echo "Mutant 2: Revert progressStartDate to only use first block date"
echo "Expected: Unit test should fail"
echo ""

cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
# Replace the entire function body to just return firstBlockDate
cat > "$PROGRESS_START_FILE" << 'EOF'
import type { Database } from "@/lib/database.types";

type SessionType = Database["public"]["Enums"]["day_type"];

export function progressStartDate(input: {
  programs: Array<{ startedOn: string }>;
  completedSessions: Array<{
    local_date: string;
    actual_type: SessionType | null;
    status: string;
    working_set_count?: number;
  }>;
}): string | null {
  const { programs } = input;
  return programs.length > 0 ? programs[0].startedOn : null;
}
EOF

# Verify the mutation applied
if diff -q "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 2 did not apply (files are identical)"
  exit 1
fi

MUTANT2_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT2_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 2 (unit test passes with only first block date)"
  cat "$MUTANT2_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT2_LOG"; then
    echo "✗ FAIL: Mutant 2 killed by crash, not assertion"
    cat "$MUTANT2_LOG"
    exit 1
  fi
  echo "✓ Mutant 2 killed (unit test fails without session date consideration)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT2_LOG"

# Restore for next mutant
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

# Mutant 3: Revert buildDayRecords min() logic to ?? fallback
echo ""
echo "Mutant 3: Revert buildDayRecords to use ?? instead of min()"
echo "Expected: Unit test should fail"
echo ""

cp "$BACKUP_STREAKS" "$STREAKS_FILE"
# Replace the min logic with just ?? fallback (remove the if/else that picks the earlier date)
sed -i '/Fix pd-b: Use the EARLIER of effectiveStart/,/^  }$/c\
  // Fix pd-b: Use the EARLIER of effectiveStart and firstBlockStart\
  // so a later effectiveStart can never cut off block days\
  const first = effectiveStart ?? firstBlockStart;' "$STREAKS_FILE"

# Verify the mutation applied  
if diff -q "$BACKUP_STREAKS" "$STREAKS_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 3 did not apply (files are identical)"
  exit 1
fi

MUTANT3_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT3_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 3 (unit test passes with ?? fallback)"
  cat "$MUTANT3_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT3_LOG"; then
    echo "✗ FAIL: Mutant 3 killed by crash, not assertion"
    cat "$MUTANT3_LOG"
    exit 1
  fi
  echo "✓ Mutant 3 killed (unit test fails without min() logic)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT3_LOG"

# Restore
cp "$BACKUP_STREAKS" "$STREAKS_FILE"

# Mutant 4: Comment out ensureCurrentBlock call from rebuildPlanCore
echo ""
echo "Mutant 4: Comment out ensureCurrentBlock call from rebuildPlanCore"
echo "Expected: Unit test (test-rebuild-rollover-progress.ts) should fail"
echo ""

cp "$BACKUP_CORE" "$REBUILD_CORE"
# Comment out the ensureCurrentBlock call and error check
sed -i '/const rollover = await deps.ensureCurrentBlock/,/^  }$/s/^/\/\/ /' "$REBUILD_CORE"

# Verify the mutation applied
if diff -q "$BACKUP_CORE" "$REBUILD_CORE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 4 did not apply (files are identical)"
  exit 1
fi

MUTANT4_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT4_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 4 (unit test passes with commented call)"
  cat "$MUTANT4_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT4_LOG"; then
    echo "✗ FAIL: Mutant 4 killed by crash, not assertion"
    cat "$MUTANT4_LOG"
    exit 1
  fi
  echo "✓ Mutant 4 killed (unit test fails with commented call)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT4_LOG"

# Restore
cp "$BACKUP_CORE" "$REBUILD_CORE"

# Mutant 5: Change effectiveStart min() to ?? in progress wiring
echo ""
echo "Mutant 5: Change effectiveStart min to ?? (progress loader wiring)"
echo "Expected: Unit test should detect incorrect date calculation"
echo ""

# Already have PROGRESS_START_FILE backup
# Change the min logic to ?? fallback in effectiveStart calculation
sed -i 's/firstSessionDate < firstBlockDate ? firstSessionDate : firstBlockDate/firstSessionDate ?? firstBlockDate/g' "$PROGRESS_START_FILE"

# Verify mutation applied
if diff -q "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant 5 did not apply"
  exit 1
fi

MUTANT5_LOG=$(mktemp)
if npx tsx scripts/test-rebuild-rollover-progress.ts > "$MUTANT5_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant 5 (progress test passes with ?? instead of min)"
  cat "$MUTANT5_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANT5_LOG"; then
    echo "✗ FAIL: Mutant 5 killed by crash, not assertion"
    cat "$MUTANT5_LOG"
    exit 1
  fi
  echo "✓ Mutant 5 killed (progress test detects incorrect date logic)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANT5_LOG"

# Restore
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"

# Mutant A (MED-2a): drop effectiveStart from the Progress page's buildDayRecords call
echo ""
echo "Mutant A: Remove effectiveStart from page.tsx buildDayRecords call"
echo "Expected: test-progress-superseded-ended-wiring.tsx should fail by assertion"
echo ""

cp "$BACKUP_PROGRESS_PAGE" "$PROGRESS_PAGE_FILE"
# Delete the shorthand property inside the buildDayRecords({ ... }) argument only
sed -i '/const dayRecords = buildDayRecords({/,/});/{/^    effectiveStart,$/d}' "$PROGRESS_PAGE_FILE"

# Verify the mutation applied: files differ and the call no longer passes effectiveStart
if diff -q "$BACKUP_PROGRESS_PAGE" "$PROGRESS_PAGE_FILE" > /dev/null 2>&1; then
  echo "✗ FAIL: Mutant A did not apply (files are identical)"
  exit 1
fi
if sed -n '/const dayRecords = buildDayRecords({/,/});/p' "$PROGRESS_PAGE_FILE" | grep -q 'effectiveStart'; then
  echo "✗ FAIL: Mutant A did not remove effectiveStart from buildDayRecords call"
  exit 1
fi

MUTANTA_LOG=$(mktemp)
if npx tsx scripts/test-progress-superseded-ended-wiring.tsx > "$MUTANTA_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant A (Progress render passes without effectiveStart)"
  cat "$MUTANTA_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANTA_LOG" || grep -q "^Test error:" "$MUTANTA_LOG"; then
    echo "✗ FAIL: Mutant A killed by crash, not assertion"
    cat "$MUTANTA_LOG"
    exit 1
  fi
  grep "❌ FAIL" "$MUTANTA_LOG"
  echo "✓ Mutant A killed (rendered Progress stats wrong without effectiveStart)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANTA_LOG"

# Restore
cp "$BACKUP_PROGRESS_PAGE" "$PROGRESS_PAGE_FILE"

# Mutant B (MED-2b): buildPlanLogic skips rebuildPlanCore and calls createBlockForUser directly
echo ""
echo "Mutant B: buildPlanLogic bypasses rebuildPlanCore (createBlockForUser rebuild directly)"
echo "Expected: test-build-plan-logic-wiring.ts should fail by assertion"
echo ""

cp "$BACKUP_BUILD_PLAN_LOGIC" "$BUILD_PLAN_LOGIC_FILE"
sed -i 's|^import { rebuildPlanCore } from "./rebuild-plan-core";$|import { rebuildPlanCore } from "./rebuild-plan-core";\nimport { createBlockForUser } from "./persist";|' "$BUILD_PLAN_LOGIC_FILE"
sed -i 's|const result = await rebuildPlanCore(deps);|void deps; void rebuildPlanCore; const result = await createBlockForUser(supabase, userId, { mode: "rebuild" });|' "$BUILD_PLAN_LOGIC_FILE"

# Verify the mutation applied
if ! grep -q 'const result = await createBlockForUser(supabase, userId, { mode: "rebuild" });' "$BUILD_PLAN_LOGIC_FILE" \
  || ! grep -q '^import { createBlockForUser } from "./persist";$' "$BUILD_PLAN_LOGIC_FILE"; then
  echo "✗ FAIL: Mutant B did not apply (replacement not found)"
  exit 1
fi

MUTANTB_LOG=$(mktemp)
if npx tsx scripts/test-build-plan-logic-wiring.ts > "$MUTANTB_LOG" 2>&1; then
  echo "✗ SURVIVED: Mutant B (wiring test passes without rebuildPlanCore)"
  cat "$MUTANTB_LOG"
  SURVIVED=$((SURVIVED + 1))
else
  if ! grep -q "❌ FAIL" "$MUTANTB_LOG" || grep -q "^Test error:" "$MUTANTB_LOG"; then
    echo "✗ FAIL: Mutant B killed by crash, not assertion"
    cat "$MUTANTB_LOG"
    exit 1
  fi
  grep "❌ FAIL" "$MUTANTB_LOG"
  echo "✓ Mutant B killed (buildPlanLogic wiring test detects skipped rollover)"
  KILLED=$((KILLED + 1))
fi
rm -f "$MUTANTB_LOG"

# Restore
cp "$BACKUP_BUILD_PLAN_LOGIC" "$BUILD_PLAN_LOGIC_FILE"

WIRING=scripts/test-build-plan-logic-wiring.ts

run_mutant C "buildPlan action calls createBlockForUser directly (main's body)" src/app/today/actions.ts \
  's|import \{ buildPlanLogic \} from "\@/lib/program/build-plan-logic";|import { createBlockForUser } from "\@/lib/program/persist";|; s|await buildPlanLogic\(supabase, user\.id\)|await createBlockForUser(supabase, user.id, { mode: "rebuild" })|' \
  "$WIRING"

run_mutant T1 "rebuild-plan-deps drops today from createBlockForUser" src/lib/program/rebuild-plan-deps.ts \
  's|\{ mode: "rebuild", today \}|{ mode: "rebuild" }|' \
  "$WIRING"

run_mutant T2 "persist.ts ignores options.today" src/lib/program/persist.ts \
  's|const today = options\.today \?\?|const today = undefined ??|' \
  "$WIRING"

run_mutant T4 "buildPlanLogic reads the wall clock instead of now" src/lib/program/build-plan-logic.ts \
  's|localDateString\(timezone, now\)|localDateString(timezone)|' \
  "$WIRING"

run_mutant E1 "fetchActiveBlock swallows its error" src/lib/program/rebuild-plan-deps.ts \
  's|throw new Error\(`Failed to fetch active block: \$\{error\.message\}`\);|void error; return null;|' \
  "$WIRING"

run_mutant G "buildPlanLogic's catch shows the raw error message" src/lib/program/build-plan-logic.ts \
  's|return \{ ok: false, error: REBUILD_FAILED_MESSAGE \};|return { ok: false, error: error instanceof Error ? error.message : REBUILD_FAILED_MESSAGE };|' \
  "$WIRING"

run_mutant L "rollover.ts stops logging the original rollover_block error" src/lib/program/rollover.ts \
  's|\n\s*console\.error\("rollover_block failed", error\);||' \
  "$WIRING"

run_mutant R1 "rollover boundary >= becomes >" src/lib/program/rollover.ts \
  's|if \(active\.ends_on >= today\) return|if (active.ends_on > today) return|' \
  scripts/test-rebuild-rollover-progress.ts "$WIRING"

run_mutant D "a rebuilt block 1 anchors to today" src/lib/program/persist.ts \
  's|if \(isRebuild\) return rebuildAnchor \?\? undefined;|if (isRebuild) return today;|' \
  scripts/test-rebuild-anchor-progress.ts scripts/test-create-block-anchoring.ts

run_mutant F "a rebuilt block 1 is not anchored (main's behaviour)" src/lib/program/persist.ts \
  's|if \(isRebuild\) return rebuildAnchor \?\? undefined;|if (isRebuild) return undefined;|' \
  scripts/test-rebuild-anchor-progress.ts scripts/test-create-block-anchoring.ts

run_mutant J "the anchor comes from the active row, not block 1's first start" src/lib/program/persist.ts \
  's|rebuildAnchor = firstRes\.data\?\.started_on \?\? rebuildOf\.started_on;|void firstRes; rebuildAnchor = rebuildOf.started_on;|' \
  scripts/test-create-block-anchoring.ts

run_mutant H "Settings' plan-stale banner is not cleared after a rebuild" src/app/today/build-plan-button.tsx \
  's|\n\s*onBuilt\?\.\(\);||' \
  scripts/test-settings-rebuild-clears-stale.tsx

echo ""
echo "============================================================"
echo "Summary: $KILLED killed, $SURVIVED survived"
echo "============================================================"
echo ""

cleanup_done=1
cp "$BACKUP_CORE" "$REBUILD_CORE"
cp "$BACKUP_PROGRESS_START" "$PROGRESS_START_FILE"
cp "$BACKUP_STREAKS" "$STREAKS_FILE"
cp "$BACKUP_ROLLOVER" "$ROLLOVER_FILE"
cp "$BACKUP_PROGRESS_PAGE" "$PROGRESS_PAGE_FILE"
cp "$BACKUP_BUILD_PLAN_LOGIC" "$BUILD_PLAN_LOGIC_FILE"
restore_generic
rm -rf "$TMP"

if [ $SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED mutants survived"
  exit 1
fi

echo "✅ All $KILLED mutants killed"
exit 0
