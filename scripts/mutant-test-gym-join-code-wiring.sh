#!/usr/bin/env bash
set -euo pipefail

# Mutant testing for gym join code wiring
# Verifies that the wiring test catches each mutation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "========================================="
echo "Mutant Test: Gym Join Code Wiring"
echo "========================================="
echo

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_MUTANTS=6

# Helper to run a mutant test
run_mutant() {
  local name="$1"
  local description="$2"
  local sed_command="$3"
  local target_file="$4"
  
  echo "TEST: $name"
  echo "  $description"
  
  # Backup original
  cp "$target_file" "$target_file.backup"
  
  # Apply mutation
  eval "$sed_command" > "$target_file.mutant"
  mv "$target_file.mutant" "$target_file"
  
  # Run test (should fail)
  if npm run test:gym-join-code-wiring > /dev/null 2>&1; then
    echo "  ❌ FAIL: Mutant survived (test passed when it should have failed)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "  ✓ PASS: Mutant killed (test caught the mutation)"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
  
  # Restore original
  mv "$target_file.backup" "$target_file"
  echo
}

# W1: actions.ts drops gymName from processRedeemResult call
run_mutant \
  "(W1) actions.ts drops gymName" \
  "Remove gymName parameter from processRedeemResult call" \
  "sed 's/processRedeemResult(data, gymName)/processRedeemResult(data)/' \"src/app/join/[code]/actions.ts\"" \
  "src/app/join/[code]/actions.ts"

# W2: actions.ts accepts gymName from client (revert server-side lookup)
run_mutant \
  "(W2) actions.ts accepts gymName from client" \
  "Add gymName parameter to redeemJoinCode signature" \
  "sed 's/export async function redeemJoinCode(code: string)/export async function redeemJoinCode(code: string, gymName?: string)/' \"src/app/join/[code]/actions.ts\"" \
  "src/app/join/[code]/actions.ts"

# W3: gating ignores code's role
run_mutant \
  "(W3) gating ignores code role" \
  "Replace codeRole with a constant in roleOrder lookup" \
  "sed 's/roleOrder\[codeRole\]/roleOrder[\"member\"]/' \"src/lib/gym-join-code-gating.ts\"" \
  "src/lib/gym-join-code-gating.ts"

# W4: join page hard-codes error message
run_mutant \
  "(W4) join page hard-codes error message" \
  "Replace mapPreviewResultToMessage call with hard-coded string" \
  "sed 's/const errorMessage = mapPreviewResultToMessage(failureResult);/const errorMessage = \"Invalid invite code\";/' \"src/app/join/[code]/page.tsx\"" \
  "src/app/join/[code]/page.tsx"

# W5: invites list skips splitJoinCodes
run_mutant \
  "(W5) invites list skips splitJoinCodes" \
  "Replace splitJoinCodes with inline { active: codes, inactive: [] }" \
  "sed 's/const { active, inactive } = splitJoinCodes(codes);/const active = codes; const inactive: typeof codes = [];/' \"src/app/owner/invites/invites-list.tsx\"" \
  "src/app/owner/invites/invites-list.tsx"

# W6: confirm button re-enables after success
run_mutant \
  "(W6) confirm button re-enables after success" \
  "Add setRedeeming(false) after router.push in success path" \
  "sed 's/router\.push(\"\/today\");/router.push(\"\/today\"); setRedeeming(false);/' \"src/app/join/[code]/join-confirmation.tsx\"" \
  "src/app/join/[code]/join-confirmation.tsx"

echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   $TOTAL_MUTANTS"
echo "Mutants killed (test passed):    $PASS_COUNT"
echo "Mutants survived (test failed):  $FAIL_COUNT"
echo

if [ $FAIL_COUNT -eq 0 ]; then
  echo "✅ All mutants killed"
  exit 0
else
  echo "❌ Some mutants survived"
  exit 1
fi
