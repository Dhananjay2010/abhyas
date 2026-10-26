#!/bin/bash
# Shared harness for the History / Progress empty-state mutant scripts (PR #153).
# Source it, then call: mutant_init <file>...; run_baseline; test_mutant ...; crash_self_test ...; mutant_summary
#
# Guarantees:
# - Backups and logs live in a fresh mktemp dir; nothing is read from fixed /tmp paths.
# - Every file a mutant may touch is backed up first, and is restored after every mutant AND on
#   EXIT/INT/TERM, so an interrupted run never leaves a mutated source behind.
# - Only files this run backed up are restored.
# - Classification: exit 0 = SURVIVED; exit 1 with FAIL lines and no crash = KILLED; anything else
#   (crash, non-1 exit, no FAIL line) = ERROR. SURVIVED and ERROR both make the script exit non-zero.

MUTANT_WORK=$(mktemp -d)
MUTANT_FILES=()
MUTANT_TESTS=()
MUTANT_BAD=0
MUTANT_KILLED=0

mutant_restore() {
  local i
  for i in "${!MUTANT_FILES[@]}"; do
    [ -f "$MUTANT_WORK/bak.$i" ] && cp "$MUTANT_WORK/bak.$i" "${MUTANT_FILES[$i]}"
  done
  return 0
}
mutant_cleanup() { mutant_restore; rm -rf "$MUTANT_WORK"; }
trap mutant_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# mutant_init <test-script-name>... -- <file>...
mutant_init() {
  while [ "$1" != "--" ]; do MUTANT_TESTS+=("$1"); shift; done
  shift
  local i=0 f
  for f in "$@"; do
    cp "$f" "$MUTANT_WORK/bak.$i" || { echo "ERROR: cannot back up $f"; exit 1; }
    MUTANT_FILES+=("$f"); i=$((i + 1))
  done
}

# Runs every test in MUTANT_TESTS, stopping at the first failure. Sets MUTANT_RC.
mutant_run_tests() {
  local log=$1 t
  : > "$log"
  MUTANT_RC=0
  for t in "${MUTANT_TESTS[@]}"; do
    npm run -s "$t" >> "$log" 2>&1 || { MUTANT_RC=$?; return 0; }
  done
}

# Prints SURVIVED, KILLED or ERROR for the last run.
mutant_classify() {
  local log=$1
  if [ "$MUTANT_RC" -eq 0 ]; then echo SURVIVED
  elif [ "$MUTANT_RC" -eq 1 ] && grep -qE '^[[:space:]]*FAIL[[:space:]]' "$log" \
       && ! grep -qE '(Test error:|TransformError|SyntaxError|ReferenceError|TypeError|Cannot find module)' "$log"; then
    echo KILLED
  else echo ERROR
  fi
}

run_baseline() {
  mutant_run_tests "$MUTANT_WORK/baseline.log"
  if [ "$MUTANT_RC" -ne 0 ]; then
    echo "ERROR: baseline failed (exit $MUTANT_RC)"; cat "$MUTANT_WORK/baseline.log"; exit 1
  fi
  echo "✓ Baseline passed"
}

# mutate <mode literal|regex> <file> <find> <replace>; the pattern must match exactly once.
mutate() {
  python3 - "$@" <<'PYEOF'
import re, sys
mode, path, find, replace = sys.argv[1:5]
s = open(path).read()
if mode == "literal":
    n = s.count(find)
    out = s.replace(find, replace, 1)
else:
    n = len(re.findall(find, s))
    out = re.sub(find, replace, s, count=1)
if n != 1:
    print(f"pattern matched {n} times (need exactly 1) in {path}")
    sys.exit(2)
open(path, "w").write(out)
PYEOF
}

# test_mutant <id> <desc> <mode> <file> <find> <replace> [expected=KILLED]
test_mutant() {
  local id=$1 desc=$2 mode=$3 file=$4 find=$5 replace=$6 expect=${7:-KILLED} verdict
  echo ""
  echo "Mutant $id: $desc"
  if ! mutate "$mode" "$file" "$find" "$replace"; then
    echo "ERROR: Mutant $id could not be applied"; mutant_restore; MUTANT_BAD=$((MUTANT_BAD + 1)); return 0
  fi
  mutant_run_tests "$MUTANT_WORK/mutant-$id.log"
  verdict=$(mutant_classify "$MUTANT_WORK/mutant-$id.log")
  mutant_restore
  if [ "$verdict" = "$expect" ]; then
    if [ "$expect" = KILLED ]; then echo "✓ KILLED: Mutant $id"; MUTANT_KILLED=$((MUTANT_KILLED + 1))
    else echo "✓ $verdict as expected (self-test $id)"; fi
  else
    echo "✗ $verdict: Mutant $id (expected $expect, exit $MUTANT_RC)"
    tail -n 20 "$MUTANT_WORK/mutant-$id.log"
    MUTANT_BAD=$((MUTANT_BAD + 1))
  fi
}

# Self-tests: a syntax error and a silent non-1 exit must both be classified ERROR, never KILLED.
crash_self_test() {
  local file=$1 anchor=$2
  test_mutant crash-syntax "self-test: syntax error is ERROR" literal "$file" "$anchor" "const = ; $anchor" ERROR
  test_mutant crash-exit "self-test: silent process.exit(3) is ERROR" literal "$file" "$anchor" "process.exit(3); $anchor" ERROR
}

mutant_summary() {
  echo ""
  if [ "$MUTANT_BAD" -ne 0 ]; then echo "=== $MUTANT_BAD mutant(s) SURVIVED or ERROR ==="; exit 1; fi
  echo "=== All $MUTANT_KILLED mutants killed; crash self-tests report ERROR ==="
}
