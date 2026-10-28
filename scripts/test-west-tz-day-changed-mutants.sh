#!/usr/bin/env bash
#
# Mutation tests for the west-timezone "day has changed" loop fix (QA3 LOW-1,
# #166 r5) in src/lib/session/resolve-plan-target-date.ts.
#
# NOT in the `npm test` chain. Every mutant is applied to a scratch copy of
# the checkout in a mktemp dir (node_modules symlinked); the checkout itself
# is never written, and the script fails if its git status changed.
#
# Each mutant replaces ONE exact literal that must occur exactly once. A
# mutant that does not type-check is SKIPPED. A mutant counts as KILLED only
# when a test exits non-zero AND prints an assertion failure ("❌ FAIL") AND
# did not crash ("CRASH", "Missing script", "Cannot find module",
# SyntaxError, ReferenceError). Exit 1 on any skip or survivor.
#
#   bash scripts/test-west-tz-day-changed-mutants.sh

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS_BEFORE="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/west-tz-mutants.XXXXXX")"
cleanup_scratch() {
  case "$SCRATCH" in
    "${TMPDIR:-/tmp}"/west-tz-mutants.*) rm -rf "$SCRATCH" ;;
  esac
}
trap cleanup_scratch EXIT
trap 'cleanup_scratch; exit 130' INT TERM

( cd "$REPO_ROOT" && git ls-files -z --cached --others --exclude-standard ) \
  | ( cd "$REPO_ROOT" && tar --null --ignore-failed-read -T - -cf - 2>/dev/null ) \
  | tar -xf - -C "$SCRATCH"
[ -e "$SCRATCH/node_modules" ] || ln -s "$REPO_ROOT/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" || exit 1
echo "Mutating a scratch copy: $SCRATCH (checkout untouched: $REPO_ROOT)"

RESOLVE=src/lib/session/resolve-plan-target-date.ts
T_WEST=test:west-tz-day-changed-loop
T_ACTION=test:plan-day-action-wiring
T_RESOLVE=test:resolve-plan-target-date
for t in "$T_WEST" "$T_ACTION" "$T_RESOLVE"; do
  node -e 'process.exit(require("./package.json").scripts[process.argv[1]] ? 0 : 1)' "$t" \
    || { echo "Missing package.json script: $t"; exit 1; }
done

PRISTINE="$(mktemp -d "${TMPDIR:-/tmp}/west-tz-pristine.XXXXXX")"
cp "$RESOLVE" "$PRISTINE/resolve.ts"
trap 'rm -rf "$PRISTINE"; cleanup_scratch' EXIT

KILLED=0
SURVIVED=0
SKIPPED=0

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

# run_mutant NAME OLD NEW TEST...   (all mutants are on $RESOLVE in the scratch copy)
run_mutant() {
  local name=$1 old=$2 new=$3
  shift 3
  echo ""
  echo "$name"
  cp "$PRISTINE/resolve.ts" "$RESOLVE"
  if ! replace_once "$RESOLVE" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1)); return
  fi
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1)); cp "$PRISTINE/resolve.ts" "$RESOLVE"; return
  fi
  local killer="" t output code
  for t in "$@"; do
    output=$(npm run -s "$t" 2>&1); code=$?
    if [ $code -ne 0 ] && echo "$output" | grep -qE "(❌ FAIL|✗ FAIL)" \
       && ! echo "$output" | grep -qE "(CRASH|✗ ERROR|Missing script|Cannot find module|SyntaxError|ReferenceError)"; then
      killer="$t"; break
    fi
  done
  if [ -n "$killer" ]; then
    echo "  ✓ KILLED by $killer"; KILLED=$((KILLED + 1))
  else
    echo "  ✗ SURVIVED ($*)"; SURVIVED=$((SURVIVED + 1))
  fi
  cp "$PRISTINE/resolve.ts" "$RESOLVE"
}

FIX='  if (shownDate === planTargetDate(sessionLocalDate, userLocalToday)) return true;'
MAIN_RULE='  return todayOrTomorrow && shownDate > sessionLocalDate;'

echo "Baseline: unmutated tests pass in the scratch copy"
for t in "$T_WEST" "$T_ACTION" "$T_RESOLVE"; do
  if ! npm run -s "$t" >/dev/null 2>&1; then echo "  baseline $t FAILED"; exit 1; fi
  echo "  ✓ $t"
done

run_mutant "WT1. Fix reverted (only today/tomorrow accepted: the west dead end)" \
  "$FIX" '' "$T_WEST"

run_mutant "WT2. Accept session.local_date + 1 without the MED-4 clamp" \
  "$FIX" '  if (shownDate === sessionPlanTargetDate(sessionLocalDate)) return true;' "$T_WEST" "$T_ACTION"

run_mutant "WT3. Accept any day from the rule's day onward (>=)" \
  "$FIX" '  if (shownDate >= planTargetDate(sessionLocalDate, userLocalToday)) return true;' "$T_WEST" "$T_ACTION"

run_mutant "WT4. West move accepts any day after the session's day" \
  "$FIX" '  if (sessionLocalDate > userLocalToday) return shownDate > sessionLocalDate;' "$T_WEST"

run_mutant "WT5. Only the rule's day accepted (main's today/tomorrow rule dropped)" \
  "$MAIN_RULE" '  return false;' "$T_WEST" "$T_ACTION"

run_mutant "WT6. Accept today + 2 instead of the rule's day" \
  "$FIX" '  if (shownDate === addDays(userLocalToday, 2)) return true;' "$T_WEST"

run_mutant "WT7. Accept the rule's day only when the session is not after today" \
  "$FIX" '  if (sessionLocalDate <= userLocalToday && shownDate === planTargetDate(sessionLocalDate, userLocalToday)) return true;' "$T_WEST"

cd "$REPO_ROOT" || exit 1
STATUS_AFTER="$(git status --porcelain 2>/dev/null | sha256sum)"
echo ""
echo "Killed: $KILLED  Survived: $SURVIVED  Skipped: $SKIPPED"
if [ "$STATUS_BEFORE" != "$STATUS_AFTER" ]; then
  echo "❌ The checkout's git status changed during the mutant run"
  exit 1
fi
echo "Checkout status unchanged"
if [ "$SURVIVED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then exit 1; fi
echo "✓ All mutants killed"
