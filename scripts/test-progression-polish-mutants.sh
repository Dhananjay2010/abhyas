#!/usr/bin/env bash
# Mutation check for the progression polish PR:
#   item 1  barbell back-off / step-down floor at the empty bar   (B*)
#           no barbell prescription under the bar, from any start (N*)
#           two-miss copy without an exact-10% claim               (C*)
#   item 2  QA2 M-1: one lb formatter, hold decided on the display (F*)
#   item 3  QA2 L-2: a successful session never lowers the weight  (L*)
#
# Every mutant is applied to a mktemp COPY of the repository's files; tracked
# files are never edited in place. The script first proves the unmutated copy
# passes, then that each mutant is killed (the test exits non-zero), and finally
# that `git status` is unchanged. Not part of the `npm test` chain.
#
#   bash scripts/test-progression-polish-mutants.sh
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

FLOOR="scripts/test-barbell-backoff-bar-floor.ts"
LBFMT="scripts/test-lb-display-one-formatter.tsx"
NEVER="scripts/test-success-never-lowers.ts"
PROG="src/lib/program/progression.ts"
RUNNER="src/app/session/[id]/session-runner.tsx"

# Returns 0 if every test passes, 1 if one fails on an assertion, and 2 if one
# exits non-zero WITHOUT an assertion failure (a crash does not count as a kill).
run_tests() {
  local t
  for t in "$@"; do
    if ! (cd "$COPY" && "$TSX" "$t" >"$WORK/last.log" 2>&1); then
      if grep -q "FAIL" "$WORK/last.log"; then
        echo "    killed by $t: $(grep -m1 "FAIL" "$WORK/last.log" | sed 's/^ *//')"
        return 1
      fi
      echo "    $t exited non-zero without an assertion failure:"
      tail -5 "$WORK/last.log" | sed 's/^/      /'
      return 2
    fi
  done
  return 0
}

echo "Baseline (unmutated copy):"
if ! run_tests "$FLOOR" "$LBFMT" "$NEVER"; then
  cat "$WORK/last.log"
  echo "FAIL: baseline does not pass"
  exit 1
fi
echo "  ✓ baseline passes"

total=0
survived=0
# mutate <id> <description> <file> <old> <new> <tests...>
mutate() {
  local id="$1" desc="$2" file="$3" old="$4" new="$5"
  shift 5
  total=$((total + 1))
  echo "Mutant $id: $desc"
  python3 - "$COPY/$file" "$old" "$new" <<'PY'
import sys
path = sys.argv[1]
# Several replacements may be given, separated by a line holding only "|||".
olds, news = sys.argv[2].split("\n|||\n"), sys.argv[3].split("\n|||\n")
s = open(path, encoding="utf-8").read()
for old, new in zip(olds, news, strict=True):
    if s.count(old) != 1:
        sys.exit(f"FAIL: mutant anchor found {s.count(old)} times in {path}")
    s = s.replace(old, new)
open(path, "w", encoding="utf-8").write(s)
PY
  local rc=0
  run_tests "$@" || rc=$?
  if [ "$rc" -eq 1 ]; then
    echo "  ✓ killed"
  elif [ "$rc" -eq 2 ]; then
    echo "  ❌ CRASHED (not counted as killed)"
    survived=$((survived + 1))
  else
    echo "  ❌ SURVIVED"
    survived=$((survived + 1))
  fi
  cp "$ROOT/$file" "$COPY/$file"
}

mutate B1 "no clamp on the two-miss back-off (main's behaviour: 20 kg -> 17.5)" "$PROG" \
  'const reduced = barFloor !== null && twoMissResult < barFloor' \
  'const reduced = false && barFloor !== null && twoMissResult < barFloor' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B2 "no clamp on the third-miss step-down (barbell falls back to the grid-step floor)" "$PROG" \
  '} else if (barFloor !== null) {' \
  '} else if (false && barFloor !== null) {' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B3 "no hold at the bar in the step-down (generic hold message instead)" "$PROG" \
  'if (currentWeight <= barFloor + 0.005) {' \
  'if (false) {' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B4 "floor hold resets the miss counter" "$PROG" \
  $'              consecutiveFailures: failures,\n              weightAtFailureStartKg: state.weightAtFailureStartKg,\n              message: (() => {\n                const weightDisplay = displayWeight(currentWeight);\n                if (!weightDisplay) {\n                  return "Staying at this weight — aim for clean reps.";\n                }\n                return `Staying at ${weightDisplay} — aim for clean reps.`;\n              })(),\n            };\n          }\n          // Barbell' \
  $'              consecutiveFailures: 0,\n              weightAtFailureStartKg: state.weightAtFailureStartKg,\n              message: (() => {\n                const weightDisplay = displayWeight(currentWeight);\n                if (!weightDisplay) {\n                  return "Staying at this weight — aim for clean reps.";\n                }\n                return `Staying at ${weightDisplay} — aim for clean reps.`;\n              })(),\n            };\n          }\n          // Barbell' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B5 "imperial users get the 20 kg bar instead of 45 lb" "$PROG" \
  'return unit === "lb" ? Math.round(lbToKg(BARBELL_EMPTY_LB) * 100) / 100 : BARBELL_EMPTY_KG;' \
  'return BARBELL_EMPTY_KG;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B6 "floor applied to every equipment type, not just barbell" "$PROG" \
  'if (!equipmentIds || !equipmentIds.includes("barbell")) return null;' \
  'if (!equipmentIds) return null;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B7 "at the bar the clamp returns the bar constant, not the current weight" "$PROG" \
  '? (currentWeight <= barFloor + 0.005 ? currentWeight : barFloor)' \
  '? barFloor' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B8 "no storage tolerance (unrounded 45 lb backs off by 0.0017 kg)" "$PROG" \
  '? (currentWeight <= barFloor + 0.005 ? currentWeight : barFloor)' \
  '? (currentWeight <= barFloor ? currentWeight : barFloor)' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate B9 "EZ bar treated as a barbell" "$PROG" \
  'if (!equipmentIds || !equipmentIds.includes("barbell")) return null;' \
  'if (!equipmentIds || !(equipmentIds.includes("barbell") || equipmentIds.includes("ez_bar"))) return null;' \
  "$FLOOR" "$LBFMT" "$NEVER"

mutate N1 "under-bar stored / failure-start weight not lifted to the bar" "$PROG" \
  $'  const state: ProgressState = barFloor === null\n    ? input.state' \
  $'  const state: ProgressState = true\n    ? input.state' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate N2 "under-bar logged sets not lifted to the bar" "$PROG" \
  '.map((set) => (barFloor === null ? set : { ...set, weightKg: atLeastBar(set.weightKg) }));' \
  '.map((set) => set);' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate N3 "normal-week prefill not clamped at the bar" "$PROG" \
  'return barFloor !== null && w < barFloor - 0.005 ? barFloor : w;' \
  'return w;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate N4 "deload-week prefill not clamped at the bar" "$PROG" \
  'return barFloor !== null && deload < barFloor - 0.005 ? barFloor : deload;' \
  'return deload;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate N5 "prefill ignores the imperial bar" "$PROG" \
  'const barFloor = barbellFloorKg(equipmentIds, unit);
  
  // Non-deload' \
  'const barFloor = barbellFloorKg(equipmentIds, "kg");
  
  // Non-deload' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate C1 "two-miss hold copy claims an exact 10% again (main's wording)" "$PROG" \
  $'          : equipmentIds\n            ? "Missed twice in a row but no lighter loadable weight is close enough — holding to build back up."' \
  $'          : equipmentIds\n            ? "Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up."' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate C2 "two-miss back-off copy claims a 10% drop" "$PROG" \
  ': `Missed twice in a row — dropping to ${reducedDisplay} to build back.`)' \
  ': `Missed twice in a row — dropping 10% to ${reducedDisplay} to build back.`)' \
  "$FLOOR" "$LBFMT" "$NEVER"

# --- item 2: QA2 M-1, one lb formatter ---
IMPORT_P='import { formatPrescribedWeight, lbToKg, type UnitsPreference } from "@/lib/units";'
IMPORT_P_FW='import { formatPrescribedWeight, formatWeight, lbToKg, type UnitsPreference } from "@/lib/units";'
IMPORT_R='import { formatPrescribedWeight, computeRunnerWeightPrefill,'
IMPORT_R_FL='import { formatLoad, formatPrescribedWeight, computeRunnerWeightPrefill,'
mutate F1 "banner messages bypass the shared formatter (nearest 0.5 lb, main's formatWeight)" "$PROG" \
  "$IMPORT_P"$'\n|||\n''? (kg > 0 ? formatPrescribedWeight(kg, "imperial") : "0 lb")' \
  "$IMPORT_P_FW"$'\n|||\n''? formatWeight(kg, "imperial", true, "0 lb")' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F2 "hold decided on raw kg instead of the displayed weight" "$PROG" \
  'if (nextDisplay !== null && fromDisplay !== null && nextDisplay === fromDisplay) {' \
  'if (nextDisplay !== null && fromDisplay !== null && next === from) {' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F3 "banner 'up to X' bypasses the shared formatter" "$PROG" \
  "$IMPORT_P"$'\n|||\n''      : unit === "lb"
        ? formatPrescribedWeight(kg, "imperial")' \
  "$IMPORT_P_FW"$'\n|||\n''      : unit === "lb"
        ? formatWeight(kg, "imperial")' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F4 "PB toast (heaviest set) bypasses the shared formatter" "$PROG" \
  "$IMPORT_P"$'\n|||\n''return `Heaviest set yet — ${formatPrescribedWeight(pb.value, units)}`;' \
  "$IMPORT_P_FW"$'\n|||\n''return `Heaviest set yet — ${formatWeight(pb.value, units)}`;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F5 "PB toast (e1RM) bypasses the shared formatter" "$PROG" \
  "$IMPORT_P"$'\n|||\n''return `Best estimated one-rep max yet — ${formatPrescribedWeight(pb.value, units)}`;' \
  "$IMPORT_P_FW"$'\n|||\n''return `Best estimated one-rep max yet — ${formatWeight(pb.value, units)}`;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F6 "runner logged-set rows bypass the shared formatter (main's formatLoad)" "$RUNNER" \
  "$IMPORT_R"$'\n|||\n''` · ${formatPrescribedWeight(logged.weightKg, settings.units)}`' \
  "$IMPORT_R_FL"$'\n|||\n''` · ${formatLoad(logged.weightKg, settings.units)}`' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate F7 "runner working-weight line bypasses the shared formatter" "$RUNNER" \
  "$IMPORT_R"$'\n|||\n''Working weight {formatPrescribedWeight(' \
  "$IMPORT_R_FL"$'\n|||\n''Working weight {formatLoad(' \
  "$FLOOR" "$LBFMT" "$NEVER"

# --- item 3: QA2 L-2, success never lowers ---
FROM='const from = Math.max(state.currentWorkingWeightKg ?? 0, heaviestQualifying);'
mutate L1 "min instead of max" "$PROG" \
  "$FROM" \
  'const from = Math.min(state.currentWorkingWeightKg ?? Infinity, heaviestQualifying);' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate L2 "ignores the heaviest qualifying set (stored weight only)" "$PROG" \
  "$FROM" \
  'const from = state.currentWorkingWeightKg ?? heaviestQualifying;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate L3 "ignores the stored weight (lifted weight only)" "$PROG" \
  "$FROM" \
  'const from = heaviestQualifying;' \
  "$FLOOR" "$LBFMT" "$NEVER"
mutate L4 "steps from the lightest qualifying set" "$PROG" \
  'const heaviestQualifying = Math.max(
      0,' \
  'const heaviestQualifying = Math.min(
      Infinity,' \
  "$FLOOR" "$LBFMT" "$NEVER"

AFTER="$(git status --porcelain)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "FAIL: tracked files changed during the mutant run"
  exit 1
fi
echo "  ✓ git status unchanged (no tracked file modified)"

if [ "$survived" -ne 0 ]; then
  echo "FAIL: $survived of $total mutant(s) survived"
  exit 1
fi
echo "All $total mutants killed."
