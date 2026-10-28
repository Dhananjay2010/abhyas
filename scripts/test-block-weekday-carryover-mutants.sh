#!/usr/bin/env bash
# Mutation check for QA2 M-1 (block 2+ keeps the member's weekdays).
#
# Every mutant is applied to a mktemp COPY of the repository's files; tracked
# files are never edited in place. The script first proves the unmutated copy
# passes, then that each mutant is killed (a test exits non-zero), and finally
# that `git status` is unchanged. Not part of the `npm test` chain.
#
#   bash scripts/test-block-weekday-carryover-mutants.sh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BEFORE="$(git status --porcelain)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

COPY="$WORK/repo"
mkdir -p "$COPY"
git ls-files -z --cached --others --exclude-standard -- src scripts package.json tsconfig.json \
  | xargs -0 cp --parents -t "$COPY"
ln -s "$ROOT/node_modules" "$COPY/node_modules"
TSX="$ROOT/node_modules/.bin/tsx"

CARRY="scripts/test-block-weekday-carryover.ts"
GATE="scripts/test-generate-block-number-gate.ts"

run_tests() {
  local t
  for t in "$@"; do
    if ! (cd "$COPY" && "$TSX" "$t" >"$WORK/last.log" 2>&1); then
      echo "    killed by $t"
      return 1
    fi
  done
  return 0
}

echo "Baseline (unmutated copy):"
if ! run_tests "$CARRY" "$GATE"; then
  cat "$WORK/last.log"
  echo "FAIL: baseline does not pass"
  exit 1
fi
echo "  ✓ baseline passes"

survived=0
# mutate <id> <description> <file> <python-literal old> <python-literal new> <tests...>
mutate() {
  local id="$1" desc="$2" file="$3" old="$4" new="$5"
  shift 5
  echo "Mutant $id: $desc"
  python3 - "$COPY/$file" "$old" "$new" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
if s.count(old) != 1:
    sys.exit(f"FAIL: mutant anchor found {s.count(old)} times in {path}")
open(path, "w", encoding="utf-8").write(s.replace(old, new))
PY
  if run_tests "$@"; then
    echo "  ❌ SURVIVED"
    survived=$((survived + 1))
  else
    echo "  ✓ killed"
  fi
  cp "$ROOT/$file" "$COPY/$file"
}

mutate M1 "generator ignores the carried layout (main's behaviour)" src/lib/program/generate.ts \
  'const carried = input.blockNumber > 1 ? validWeekdayLayout(input.weekdayLayout, input.daysPerWeek) : null;' \
  'const carried = null as number[] | null;' \
  "$CARRY" "$GATE"
mutate M2 "generator also applies the layout to block 1" src/lib/program/generate.ts \
  'const carried = input.blockNumber > 1 ?' \
  'const carried = input.blockNumber >= 1 ?' \
  "$GATE"
mutate M3 "generator accepts a layout with the wrong number of days" src/lib/program/generate.ts \
  'if (!layout || layout.length !== daysPerWeek || layout.length === 0) return null;' \
  'if (!layout || layout.length === 0) return null;' \
  "$GATE"
mutate M4 "rollover does not pass the ended block's days" src/lib/program/rollover.ts \
  $'    weekdayLayout: carriedWeekdayLayout(\n      previousDays,' \
  $'    weekdayLayout: carriedWeekdayLayout(\n      [],' \
  "$CARRY"
mutate M5 "rollover ignores a failed program_days read" src/lib/program/rollover.ts \
  '? await callRolloverRPC(supabase, userId, today, carryOver, previous.days)' \
  '? await callRolloverRPC(supabase, userId, today, carryOver, previous.days) : previous.ok === false ? await callRolloverRPC(supabase, userId, today, carryOver, [])' \
  "$CARRY"
mutate M6 "createBlockForUser does not pass the layout (rebuild / new block 2+)" src/lib/program/persist.ts \
  $'    startedOn,\n    weekdayLayout,\n' \
  $'    startedOn,\n    weekdayLayout: null,\n' \
  "$CARRY"
mutate M7 "createBlockForUser reads the OLDEST block as the layout source" src/lib/program/persist.ts \
  $'.neq("status", "superseded")\n    .order("block_number", { ascending: false })' \
  $'.neq("status", "superseded")\n    .order("block_number", { ascending: true })' \
  "$CARRY"
mutate M8 "a days_per_week change keeps the first old weekdays (Settings change does not win)" src/lib/program/weekday-layout.ts \
  'if (weekdays.length === 0 || weekdays.length !== daysPerWeek) return null;' \
  'if (weekdays.length === 0) return null; if (weekdays.length !== daysPerWeek) return weekdays.slice(0, daysPerWeek);' \
  "$CARRY"
mutate M9 "layout always starts at the earliest weekday (sessions move between days)" src/lib/program/weekday-layout.ts \
  'if (score > bestScore) {' \
  'if (bestScore < 0) {' \
  "$CARRY"
mutate M10 "rest days counted as scheduled days" src/lib/program/weekday-layout.ts \
  '(d) => !RESTFUL_DAY_TYPES.has(d.day_type) && Number.isInteger(d.day_index)' \
  '(d) => Number.isInteger(d.day_index)' \
  "$CARRY"
mutate M11 "yoga days treated as rest (yoga days dropped from the carried week)" src/lib/program/weekday-layout.ts \
  'new Set(["rest", "active_recovery", "meditation"])' \
  'new Set(["rest", "active_recovery", "meditation", "yoga"])' \
  "$CARRY"

AFTER="$(git status --porcelain)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "FAIL: tracked files changed during the mutant run"
  exit 1
fi
echo "  ✓ git status unchanged (no tracked file modified)"

if [ "$survived" -ne 0 ]; then
  echo "FAIL: $survived mutant(s) survived"
  exit 1
fi
echo "All 11 mutants killed."
