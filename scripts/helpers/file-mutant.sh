#!/usr/bin/env bash
# Shared file-mutant runner, sourced by scripts/mutant-test-*.sh.
#
#   run_mutant <label> <file> <from> <to> <test command...>
#
# - <from> must occur EXACTLY once in <file> (otherwise ERROR: the mutant no
#   longer targets the code, which is how a refactor silently disarms it);
# - the file is restored on every exit path (trap), and checked with cmp;
# - KILLED only when the test fails with a reported check failure ("✗ FAIL",
#   "check(s) failed"); a crash or any other non-zero exit is ERROR, not a kill.
#
# Call baseline <test command...> first: the unmutated test must pass.

MUTANT_BACKUPS=()
MUTANT_FAILED=0
_restore_all() {
  for pair in "${MUTANT_BACKUPS[@]}"; do
    local f="${pair%%|*}" b="${pair#*|}"
    [ -f "$b" ] && cp "$b" "$f" && rm -f "$b"
  done
}
trap _restore_all EXIT INT TERM

baseline() {
  if ! "$@" >/tmp/mutant-baseline.$$.log 2>&1; then
    echo "✗ ERROR baseline failed: $*"
    tail -20 /tmp/mutant-baseline.$$.log
    exit 2
  fi
  echo "✓ baseline passes: $*"
}

run_mutant() {
  local label="$1" file="$2" from="$3" to="$4"
  shift 4
  local backup
  backup="$(mktemp)"
  cp "$file" "$backup"
  MUTANT_BACKUPS+=("$file|$backup")

  if ! MUTANT_FILE="$file" MUTANT_FROM="$from" MUTANT_TO="$to" node -e '
    const fs = require("fs");
    const f = process.env.MUTANT_FILE, from = process.env.MUTANT_FROM, to = process.env.MUTANT_TO;
    const src = fs.readFileSync(f, "utf8");
    const n = src.split(from).length - 1;
    if (n !== 1) { console.error(`target occurs ${n} times`); process.exit(1); }
    fs.writeFileSync(f, src.replace(from, () => to));
  '; then
    echo "✗ ERROR [$label] mutation target not found exactly once in $file"
    MUTANT_FAILED=1
    cp "$backup" "$file"
    return
  fi
  if cmp -s "$file" "$backup"; then
    echo "✗ ERROR [$label] mutation did not change $file"
    MUTANT_FAILED=1
    return
  fi

  local out code
  set +e
  out="$("$@" 2>&1)"
  code=$?
  set -e
  cp "$backup" "$file"
  cmp -s "$file" "$backup" || { echo "✗ ERROR [$label] restore failed"; exit 2; }

  if [ $code -eq 0 ]; then
    echo "✗ SURVIVED [$label]"
    MUTANT_FAILED=1
  elif echo "$out" | grep -qE "✗ FAIL|check\(s\) failed"; then
    echo "✓ KILLED [$label]: $(echo "$out" | grep -m1 -E "✗ FAIL|check\(s\) failed" | sed 's/^ *//')"
  else
    echo "✗ ERROR [$label] test crashed (exit $code), not a kill: $(echo "$out" | grep -m1 -iE "error|✗" | sed 's/^ *//')"
    MUTANT_FAILED=1
  fi
}

finish_mutants() {
  if [ "$MUTANT_FAILED" -ne 0 ]; then
    echo "❌ mutant run FAILED"
    exit 1
  fi
  echo "✅ all mutants killed"
}
