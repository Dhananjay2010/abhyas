#!/usr/bin/env bash
# Mutants for scripts/test-weight-display-units.ts (QA3 MED-2 / LOW-7).
# Each mutant must make the real-render test report an assertion FAIL.
# A crash (Test error:/no FAIL line) is ERROR, never KILLED.
set -euo pipefail

TEST="scripts/test-weight-display-units.ts"
FILES=(src/components/charts.tsx src/lib/progress/strength-charts.ts src/app/progress/page.tsx "src/app/history/[id]/page.tsx")
TMP=$(mktemp -d)
for i in "${!FILES[@]}"; do cp "${FILES[$i]}" "$TMP/f$i"; done
restore() { for i in "${!FILES[@]}"; do cp "$TMP/f$i" "${FILES[$i]}"; done; }
trap 'restore; rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

# Literal (not regex) single replacement; fails if the text is not found
mutate() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1:4]
s = open(p).read()
if old not in s:
    sys.exit(f"mutation target not found in {p}: {old!r}")
open(p, "w").write(s.replace(old, new, 1))
PY
}

classify() { # name -> 0 killed, 1 survived/error
  local name="$1" log="$TMP/$1.log"
  if npx tsx "$TEST" > "$log" 2>&1; then echo "✗ $name: SURVIVED"; return 1; fi
  if grep -qE '^\s+FAIL ' "$log"; then
    echo "✓ $name: KILLED — $(grep -m1 -E '^\s+FAIL ' "$log" | sed 's/^ *//')"; return 0
  fi
  echo "✗ $name: ERROR (no assertion failed) — $(grep -m1 -E 'Test error:|Error' "$log" || tail -1 "$log")"; return 1
}

echo "Baseline"
npx tsx "$TEST" > "$TMP/baseline.log" 2>&1 || { echo "✗ BASELINE FAILED"; tail -20 "$TMP/baseline.log"; exit 1; }
echo "✓ Baseline passed"

run() { local name="$1" file="$2" old="$3" new="$4"; restore; mutate "$file" "$old" "$new"; classify "$name" || exit 1; }

run U1_readout_bypass src/components/charts.tsx \
  'const fmt = (v: number) => (weightUnits ? formatWeight(v, weightUnits) : formatValueExact(v, unit));' \
  'const fmt = (v: number) => formatValueExact(v, unit);'
run U2_axis_bypass src/components/charts.tsx \
  'weightUnits ? formatWeight(v, weightUnits, false, "0") : Math.round(v).toLocaleString("en-US");' \
  'Math.round(v).toLocaleString("en-US");'
run U3_table_bypass src/components/charts.tsx \
  '<ValueTable points={points} fmt={fmt} caption={title} />' \
  '<ValueTable points={points} fmt={(v) => formatValueExact(v, unit)} caption={title} />'
run U4_page_drops_units src/app/progress/page.tsx \
  ' weightUnits={e.units}' ''
run U5_double_convert src/lib/progress/strength-charts.ts \
  'const value = Number(row.best_e1rm);' \
  'const value = units === "imperial" ? Number(row.best_e1rm) * 2.20462 : Number(row.best_e1rm);'
run U6_history_hardcoded_kg "src/app/history/[id]/page.tsx" \
  '{s.weight_kg ? ` · ${formatWeight(Number(s.weight_kg), units)}` : ""}' \
  '{s.weight_kg ? ` · ${Number(s.weight_kg)} kg` : ""}'
run U7_history_metric_only "src/app/history/[id]/page.tsx" \
  'formatWeight(Number(s.weight_kg), units)' 'formatWeight(Number(s.weight_kg), "metric")'

echo ""
echo "Self-test: a crash must be ERROR, not KILLED"
restore
echo "const = ;" >> src/components/charts.tsx
if classify crash_selftest; then echo "✗ SELF-TEST FAILED: crash counted as KILLED"; exit 1; fi
echo "✓ Self-test passed"
restore
echo ""
echo "✅ All weight display unit mutants killed"
