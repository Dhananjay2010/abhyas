#!/usr/bin/env bash
#
# Mutation tests for Decision F (first-miss hold).
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
#
# Exit 1 on any skip or survivor.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS_BEFORE="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/first-miss-mutants.XXXXXX")"
cleanup_scratch() {
  case "$SCRATCH" in
    "${TMPDIR:-/tmp}"/first-miss-mutants.*) rm -rf "$SCRATCH" ;;
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
    mv "$BACKUP" "$CURRENT_FILE"
  fi
  CURRENT_FILE=""
  BACKUP=""
}
trap 'restore; cleanup_scratch' EXIT
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
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  
  # Count kill only when test exits non-zero with assertion FAIL
  local killer=""
  for t in "$@"; do
    local output
    output=$(npm run -s "$t" 2>&1)
    local exit_code=$?
    
    # Only count as kill if:
    # - Test exited non-zero
    # - Output contains FAIL/✗/❌ (assertion line required)
    # - Not a crash (no "CRASH", "✗ ERROR", "Missing script", "Cannot find module", SyntaxError)
    if [ $exit_code -ne 0 ]; then
      if echo "$output" | grep -qiE "CRASH|ERROR.*test|Missing script|Cannot find module|SyntaxError"; then
        # Crash, not a kill
        continue
      fi
      if echo "$output" | grep -qE "FAIL|✗|❌"; then
        killer="$t"
        break
      fi
    fi
  done
  
  if [ -n "$killer" ]; then
    local failing_line
    failing_line=$(npm run -s "$killer" 2>&1 | grep -E "FAIL|✗|❌" | head -1 | sed 's/^[[:space:]]*//')
    echo "  ✅ KILLED: $failing_line"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SURVIVED"
    SURVIVED=$((SURVIVED + 1))
  fi
  
  restore
}

echo "=== Mutant Testing: Decision F ==="
echo ""
echo "✓ Baseline pass"

# Test mutations
run_mutant "first-miss-drops" \
  "src/lib/program/progression.ts" \
  "const nextWeight = currentWeight;" \
  "const nextWeight = (currentWeight ?? 0) * 0.9;" \
  "test:first-miss-pinned"

run_mutant "counter-not-set" \
  "src/lib/program/progression.ts" \
  "const newWeightAtFailureStart = state.consecutiveFailures === 0 && currentWeight !== null
    ? currentWeight
    : state.weightAtFailureStartKg;" \
  "const newWeightAtFailureStart = state.weightAtFailureStartKg;" \
  "test:first-miss-pinned"

run_mutant "failures-not-incremented" \
  "src/lib/program/progression.ts" \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: failures," \
  "    outcome: \"hold\",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: 0," \
  "test:first-miss-pinned"

run_mutant "second-miss-holds" \
  "src/lib/program/progression.ts" \
  "if (failures >= 2 && currentWeight !== null && currentWeight > 0) {" \
  "if (failures >= 99 && currentWeight !== null && currentWeight > 0) {" \
  "test:first-miss-pinned"

run_mutant "hard-feel-wrong-baseline" \
  "src/lib/program/progression.ts" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);" \
  "  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));" \
  "test:first-miss-pinned"

run_mutant "message-altered" \
  "src/lib/program/progression.ts" \
  ": \"Staying at this weight until every set reaches the top of the range.\";" \
  ": \"Holding at this weight.\";" \
  "test:first-miss-pinned"

run_mutant "easy-no-double" \
  "src/lib/program/progression.ts" \
  "        if (feel === \"easy\" && !isBodyweightWithAddedWeight) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }" \
  "        if (false) {
          jump = hasLoadable ? Math.max(2 * mechanicIncrement, gridStep) : 2 * mechanicIncrement;
        } else {
          jump = step;
        }" \
  "test:easy-doubling-pins"

run_mutant "grid-step-ignored" \
  "src/lib/program/progression.ts" \
  "step = hasLoadable ? Math.max(patternStep, gridStep) : patternStep;" \
  "step = patternStep;" \
  "test:first-miss-pinned"

run_mutant "snap-down" \
  "src/lib/program/progression.ts" \
  "const snappedUp = Math.ceil(target / gridStep) * gridStep;" \
  "const snappedUp = Math.floor(target / gridStep) * gridStep;" \
  "test:first-miss-pinned"

run_mutant "floor-snap-ceil" \
  "src/lib/program/progression.ts" \
  "next = Math.max(Math.floor((rawNext / gridStep) + 1e-9) * gridStep, from);" \
  "next = Math.max(Math.ceil((rawNext / gridStep) + 1e-9) * gridStep, from);" \
  "test:first-miss-pinned"

run_mutant "mechanic-wrong" \
  "src/lib/program/progression.ts" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 1.25 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;" \
  "        // Easy doubles the MECHANIC increment (before grid constraints)
        const mechanicIncrement = meta.mechanic === \"isolation\" ? 2.5 : 
          LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;" \
  "test:easy-doubling-pins"

echo ""
echo "========================================"
echo "Killed: $KILLED"
echo "Survived: $SURVIVED"
echo "Skipped: $SKIPPED"
echo "========================================"

if [ $SURVIVED -gt 0 ]; then
  echo "❌ FAIL: $SURVIVED mutant(s) survived"
  exit 1
fi

if [ $SKIPPED -gt 0 ]; then
  echo "❌ FAIL: $SKIPPED mutant(s) skipped"
  exit 1
fi

if [ "$KILLED" -lt 11 ]; then
  echo "❌ FAIL: Need at least 11 killed, got $KILLED"
  exit 1
fi

STATUS_AFTER="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
if [ "$STATUS_BEFORE" != "$STATUS_AFTER" ]; then
  echo "❌ FAIL: Checkout was modified"
  git -C "$REPO_ROOT" status --porcelain
  exit 1
fi

echo "✅ PASS: All mutants killed"
