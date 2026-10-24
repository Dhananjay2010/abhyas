#!/bin/bash
set -e

# Mutation testing script
# Applies each mutation, runs npm test, records result, restores original

RESULTS_FILE="/tmp/mutant-results.txt"
echo "Mutant,File:Line,Status,Failing Test" > "$RESULTS_FILE"

run_mutant() {
  local name="$1"
  local file="$2"
  local line="$3"
  local search="$4"
  local replace="$5"
  
  echo "Testing mutant: $name"
  
  # Save original
  cp "$file" "${file}.backup"
  
  # Apply mutation
  if ! sed -i "${line}s|${search}|${replace}|" "$file" 2>/dev/null; then
    echo "  SKIP: sed failed"
    cp "${file}.backup" "$file"
    echo "$name,$file:$line,SKIP,sed failed" >> "$RESULTS_FILE"
    return
  fi
  
  # Run tests
  if npm test >/tmp/mutant-test.log 2>&1; then
    echo "  SURVIVED (tests passed)"
    grep -A2 "FAIL" /tmp/mutant-test.log | head -5 || echo "No failures found"
    echo "$name,$file:$line,SURVIVED,Tests still passed" >> "$RESULTS_FILE"
  else
    echo "  KILLED (tests failed)"
    local failing=$(grep "FAIL" /tmp/mutant-test.log | head -1 || echo "unknown")
    echo "$name,$file:$line,KILLED,${failing:0:80}" >> "$RESULTS_FILE"
  fi
  
  # Restore
  cp "${file}.backup" "$file"
  rm "${file}.backup"
}

# Form key mutant: remove exerciseId from key
run_mutant "form-key-no-exerciseId" \
  "src/lib/session/form-key.ts" \
  "8" \
  'return `\${sessionExerciseId}:\${exerciseId}:\${setNumber}`;' \
  'return `\${sessionExerciseId}:\${setNumber}`;'

# Swap reads old exercise progress (O1)
run_mutant "swap-old-progress" \
  "src/app/session/actions.ts" \
  "820" \
  '.eq("exercise_id", input.newExerciseId)' \
  '.eq("exercise_id", current.exercise_id)'

# Swap ignores daily_menu (O2)
run_mutant "swap-ignores-daily-menu" \
  "src/app/session/actions.ts" \
  "814" \
  'const remembersWeights = settingsRes.data?.planning_mode !== "daily_menu";' \
  'const remembersWeights = true;'

# Swap ignores deload (O3)
run_mutant "swap-ignores-deload" \
  "src/app/session/actions.ts" \
  "833" \
  'const isDeload = !!(sessionRes.data as unknown as { sessions?: { is_deload: boolean } })' \
  'const isDeload = false; //'

# Today ignores progressed target
run_mutant "today-ignores-progressed" \
  "src/app/today/page.tsx" \
  "424" \
  'progressedTarget: progress?.current_target_reps,' \
  'progressedTarget: null,'

# Runner effectiveRepsMax
run_mutant "runner-no-effectiveRepsMax" \
  "src/app/session/[id]/session-runner.tsx" \
  "910" \
  'repsMax: effectiveMax,' \
  'repsMax: swapped.repsMax ?? current.repsMax,'

# Kettlebell 32 holds instead of progressing
run_mutant "kb-32-holds" \
  "src/lib/program/progression.ts" \
  "412" \
  'const atKettlebellTop = hasKettlebell && from >= 48 && next === 48;' \
  'const atKettlebellTop = hasKettlebell && from >= 32 && next >= 32;'

# Kettlebell 28 backs to wrong bell
run_mutant "kb-28-backoff-24" \
  "src/lib/program/progression.ts" \
  "170" \
  'if (KETTLEBELL_SIZES[i] < from) return KETTLEBELL_SIZES[i];' \
  'if (KETTLEBELL_SIZES[i] <= from * 0.85) return KETTLEBELL_SIZES[i];'

echo ""
echo "=== MUTATION TEST RESULTS ==="
cat "$RESULTS_FILE"
