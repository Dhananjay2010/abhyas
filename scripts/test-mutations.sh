#!/usr/bin/env bash
#
# Mutation testing for PR #73 (knee-safety rules)
#
# MUST kill all these mutants:
# 1. KNEE_SAFE_LUNGE_EXERCISES (any set member change or type removal)
# 2. UNSAFE_KNEE_LUNGES (any set member change)
# 3. anyKneeInjury flag reads
# 4. High-impact lower-body exclusion logic
# 5. Pistol/deficit/sissy exclusion logic
# 6. Lunge pattern fallback gate (hasKneeInjury check in buildPatternList)
#
# Exits 0 when all mutants are killed, 1 otherwise.

set -euo pipefail

PASS='\033[0;32m✓\033[0m'
FAIL='\033[0;31m✗\033[0m'
mutants_killed=0
mutants_survived=0

test_mutation() {
  local desc="$1"
  local file="$2"
  local old_text="$3"
  local new_text="$4"
  
  # Apply mutation
  sed -i.bak "s/${old_text}/${new_text}/g" "${file}"
  
  # Run tests (redirect stderr to avoid noise)
  if npm test >/dev/null 2>&1; then
    echo -e "  ${FAIL} ${desc}"
    ((mutants_survived++))
  else
    echo -e "  ${PASS} ${desc}"
    ((mutants_killed++))
  fi
  
  # Restore original
  mv "${file}.bak" "${file}"
}

echo "Knee Safety Mutation Testing"
echo "────────────────────────────────────────────────────────────"

# Mutant 1: Remove a knee-safe lunge exercise
test_mutation \
  "Remove step-up-with-knee-raise from KNEE_SAFE_LUNGE_EXERCISES" \
  "src/lib/program/generate.ts" \
  '"step-up-with-knee-raise",' \
  '\/\* removed \*\/'

# Mutant 2: Add unsafe exercise to knee-safe list
test_mutation \
  "Add barbell-lunge to KNEE_SAFE_LUNGE_EXERCISES (unsafe)" \
  "src/lib/program/generate.ts" \
  'export const KNEE_SAFE_LUNGE_EXERCISES' \
  'export const KNEE_SAFE_LUNGE_EXERCISES = new Set([...Array.from(KNEE_SAFE_LUNGE_EXERCISES), "barbell-lunge"]) as any; const _unused'

# Mutant 3: Disable anyKneeInjury flag (current-only behavior)
test_mutation \
  "Disable anyKneeInjury check in buildPatternList" \
  "src/lib/program/alternatives.ts" \
  'if (hasKneeInjury && movement_pattern === "lunge")' \
  'if (false \&\& hasKneeInjury \&\& movement_pattern === "lunge")'

# Mutant 4: Remove high-impact lower-body ban
test_mutation \
  "Remove high-impact lower-body ban for knee injury" \
  "src/lib/program/generate.ts" \
  'is_knee_high_impact_lower && hasAnyKneeInjury' \
  'is_knee_high_impact_lower \&\& false'

# Mutant 5: Remove pistol ban
test_mutation \
  "Remove pistol ban for knee injury" \
  "src/lib/program/generate.ts" \
  'isPistol && hasAnyKneeInjury' \
  'isPistol \&\& false'

# Mutant 6: Remove sissy squat ban
test_mutation \
  "Remove sissy squat ban for knee injury" \
  "src/lib/program/generate.ts" \
  'isSissySquat && hasAnyKneeInjury' \
  'isSissySquat \&\& false'

# Mutant 7: Remove deficit lunge ban
test_mutation \
  "Remove elevated-back-lunge (deficit) ban for knee injury" \
  "src/lib/program/generate.ts" \
  'slug === "elevated-back-lunge" && hasAnyKneeInjury' \
  'slug === "elevated-back-lunge" \&\& false'

# Mutant 8: Remove side split squat ban
test_mutation \
  "Remove barbell-side-split-squat ban for knee injury" \
  "src/lib/program/generate.ts" \
  'slug === "barbell-side-split-squat" && hasAnyKneeInjury' \
  'slug === "barbell-side-split-squat" \&\& false'

echo ""
echo "────────────────────────────────────────────────────────────"
echo "Mutants killed: ${mutants_killed}"
echo "Mutants survived: ${mutants_survived}"
echo ""

if [ ${mutants_survived} -gt 0 ]; then
  echo "FAILED: ${mutants_survived} mutant(s) survived"
  exit 1
else
  echo "PASSED: All mutants killed"
  exit 0
fi
