#!/bin/bash
# Quick mutation testing - runs only relevant tests for each mutant
set +e  # Don't exit on first failure

echo "Mutant,File,Test,Status,Output" > /tmp/mutant-quick-results.csv

test_mutant() {
  local name="$1"
  local file="$2"
  local find="$3"
  local replace="$4"
  local test_cmd="$5"
  
  echo "Testing: $name"
  
  # Backup
  cp "$file" "${file}.bak"
  
  # Mutate
  if ! grep -qF "$find" "$file"; then
    echo "  SKIP: pattern not found"
    echo "$name,$file,$test_cmd,SKIP,Pattern not found" >> /tmp/mutant-quick-results.csv
    return
  fi
  
  # Apply mutation with perl for better literal matching
  perl -i -pe "s/\Q$find\E/$replace/" "$file"
  
  # Run test
  if $test_cmd > /tmp/mut.log 2>&1; then
    echo "  ❌ SURVIVED"
    echo "$name,$file,$test_cmd,SURVIVED,Tests passed" >> /tmp/mutant-quick-results.csv
  else
    local fail=$(grep "FAIL\|error" /tmp/mut.log | head -1 | cut -c1-60)
    echo "  ✅ KILLED: $fail"
    echo "$name,$file,$test_cmd,KILLED,$fail" >> /tmp/mutant-quick-results.csv
  fi
  
  # Restore
  cp "${file}.bak" "$file"
  rm "${file}.bak"
}

# Form key: remove exerciseId
test_mutant "M1-form-key" \
  "src/lib/session/form-key.ts" \
  'return `${sessionExerciseId}:${exerciseId}:${setNumber}`;' \
  'return `${sessionExerciseId}:${setNumber}`;' \
  "npm run test:form-key"

# KB 32→36
test_mutant "M2-kb-32-holds" \
  "src/lib/program/progression.ts" \
  'const atKettlebellTop = hasKettlebell && from >= 48 && next === 48;' \
  'const atKettlebellTop = hasKettlebell && from >= 32;' \
  "npm run test:progression"

# KB 17→18 snap
test_mutant "M3-kb-17-no-snap" \
  "src/lib/program/progression.ts" \
  'if (hasKettlebell) {' \
  'if (false && hasKettlebell) {' \
  "npm run test:progression"

# Swap effectiveRepsMax
test_mutant "M4-swap-no-effective" \
  "src/app/session/[id]/session-runner.tsx" \
  'repsMax: effectiveMax,' \
  'repsMax: swapped.repsMax ?? current.repsMax,' \
  "npm run test:wiring-real"

echo ""
echo "Results:"
cat /tmp/mutant-quick-results.csv | column -t -s,
