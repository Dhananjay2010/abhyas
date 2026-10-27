#!/usr/bin/env bash
#
# Mutation tests for D7 rest-day prompt changes.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# Exit 1 on any skip or survivor.

set -u

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
trap restore EXIT INT TERM

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
  local killer=""
  for t in "$@"; do
    if ! npm run -s "$t" >/dev/null 2>&1; then
      killer="$t"
      break
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

COMPONENT=src/components/day-plan-prompt.tsx
T=test:day-plan-rest-prompt

echo "D7 Rest-Day Prompt Mutation Testing"
echo "──────────────────────────────────────────────────────────"

npm run -s "$T" >/dev/null 2>&1 || { echo "FATAL: baseline $T fails"; exit 1; }

run_mutant "1. Rest day detection: always false" "$COMPONENT" \
  'const isRestDay = plannedLabel.toLowerCase() === "rest";' \
  'const isRestDay = false;' "$T"

run_mutant "2. Tomorrow label detection: always false" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = false;' "$T"

run_mutant "3. Show new UI gate: always false" "$COMPONENT" \
  'const showNewRestUI = isRestDay && isTomorrowLabel;' \
  'const showNewRestUI = false;' "$T"

run_mutant "4. Rest day line text: change 'Train anyway?' to 'Rest today?'" "$COMPONENT" \
  '{dayLabel}: rest day. Train anyway?' \
  '{dayLabel}: rest day. Rest today?' "$T"

run_mutant "5. Train anyway button: change to 'Swap it'" "$COMPONENT" \
  '<Choice disabled={pending} onClick={() => setChoosing(true)}>
              Train anyway
            </Choice>' \
  '<Choice disabled={pending} onClick={() => setChoosing(true)}>
              Swap it
            </Choice>' "$T"

run_mutant "6. Keep rest button: change to 'Dismiss'" "$COMPONENT" \
  '<Choice disabled={pending} onClick={() => choose({ kind: "keep" }, plannedLabel)}>
              Keep rest
            </Choice>' \
  '<Choice disabled={pending} onClick={() => choose({ kind: "keep" }, plannedLabel)}>
              Dismiss
            </Choice>' "$T"

run_mutant "7. Keep rest action: call with rest instead of keep" "$COMPONENT" \
  '<Choice disabled={pending} onClick={() => choose({ kind: "keep" }, plannedLabel)}>
              Keep rest' \
  '<Choice disabled={pending} onClick={() => choose({ kind: "rest" }, "a rest day")}>
              Keep rest' "$T"

run_mutant "8. Training days list in new UI: add Yoga button" "$COMPONENT" \
  '{days.map((d) => (
              <Choice
                key={d.programDayId}
                wide
                disabled={pending}
                onClick={() =>
                  choose({ kind: "training", programDayId: d.programDayId }, d.label)
                }
              >
                {d.label}
              </Choice>
            ))}
            <button
              onClick={() => setChoosing(false)}' \
  '{days.map((d) => (
              <Choice
                key={d.programDayId}
                wide
                disabled={pending}
                onClick={() =>
                  choose({ kind: "training", programDayId: d.programDayId }, d.label)
                }
              >
                {d.label}
              </Choice>
            ))}
            <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
              Yoga
            </Choice>
            <button
              onClick={() => setChoosing(false)}' "$T"

run_mutant "9. Rest day detection: case-sensitive (accept 'Rest' but not 'rest')" "$COMPONENT" \
  'const isRestDay = plannedLabel.toLowerCase() === "rest";' \
  'const isRestDay = plannedLabel === "Rest";' "$T"

run_mutant "10. Tomorrow detection: case-sensitive check is strict" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = dayLabel.toLowerCase() === "tomorrow";' "$T"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi
echo "✅ PASSED: All mutants killed"
