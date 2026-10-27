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
ERROR_COUNT=0
TOTAL_MUTANTS=6

# Track files to restore
FILES_TO_RESTORE=()

# Cleanup function
cleanup() {
  for file in "${FILES_TO_RESTORE[@]}"; do
    if [ -f "$file.backup" ]; then
      mv "$file.backup" "$file"
    fi
  done
}

# Set trap to restore files on exit
trap cleanup EXIT

# Helper to run a mutant test
run_mutant() {
  local name="$1"
  local description="$2"
  local sed_command="$3"
  local target_file="$4"
  local expected_error="$5"
  
  echo "TEST: $name"
  echo "  $description"
  
  # Backup original
  cp "$target_file" "$target_file.backup"
  FILES_TO_RESTORE+=("$target_file")
  
  # Apply mutation
  eval "$sed_command" > "$target_file.mutant"
  
  # Verify sed actually changed the file
  if cmp -s "$target_file" "$target_file.mutant"; then
    echo "  ⚠️  ERROR: sed did not change the file (pattern not found)"
    ERROR_COUNT=$((ERROR_COUNT + 1))
    mv "$target_file.backup" "$target_file"
    rm -f "$target_file.mutant"
    FILES_TO_RESTORE=("${FILES_TO_RESTORE[@]/$target_file}")
    echo
    return
  fi
  
  mv "$target_file.mutant" "$target_file"
  
  # Run test and capture output
  if output=$(npm run test:gym-join-code-wiring 2>&1); then
    echo "  ❌ FAIL: Mutant survived (test passed when it should have failed)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    # Test failed - check if it failed for the right reason
    if echo "$output" | grep -q "$expected_error"; then
      echo "  ✓ PASS: Mutant killed (test caught the mutation)"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo "  ⚠️  ERROR: Test failed but not with expected message"
      echo "     Expected: $expected_error"
      echo "     Output: $(echo "$output" | grep -i "fail" | head -1)"
      ERROR_COUNT=$((ERROR_COUNT + 1))
    fi
  fi
  
  # Restore original
  mv "$target_file.backup" "$target_file"
  FILES_TO_RESTORE=("${FILES_TO_RESTORE[@]/$target_file}")
  echo
}

# W1: processRedeemResult drops gymName
run_mutant \
  "(W1) processRedeemResult without gymName" \
  "Call processRedeemResult with only one argument" \
  "sed 's/processRedeemResult(data, gymName)/processRedeemResult(data)/' \"src/app/join/[code]/actions.ts\"" \
  "src/app/join/[code]/actions.ts" \
  "already_member error must include gym name"

# W2: actions.ts skips preview_join_code RPC
run_mutant \
  "(W2) actions.ts skips preview RPC" \
  "Remove preview_join_code RPC call" \
  "sed 's/\.rpc(\"preview_join_code\"/\.rpc(\"redeem_join_code\"/' \"src/app/join/[code]/actions.ts\"" \
  "src/app/join/[code]/actions.ts" \
  "actions.ts must call preview_join_code RPC"

# W3: gating ignores code's role
run_mutant \
  "(W3) gating uses fixed role" \
  "Replace codeRole variable with constant" \
  "sed 's/determineJoinGating(\"member\", \"owner\")/determineJoinGating(\"owner\", \"owner\")/' \"src/lib/gym-join-code-gating.ts\"" \
  "src/lib/gym-join-code-gating.ts" \
  "member code should allow owner to join"

# W4: join page skips mapPreviewResultToMessage
run_mutant \
  "(W4) join page hard-codes error" \
  "Remove mapPreviewResultToMessage import" \
  "sed 's/import.*mapPreviewResultToMessage.*from/#&/' \"src/app/join/[code]/page.tsx\"" \
  "src/app/join/[code]/page.tsx" \
  "page must import mapPreviewResultToMessage"

# W5: splitJoinCodes returns all as active
run_mutant \
  "(W5) splitJoinCodes broken" \
  "Make splitJoinCodes return wrong split" \
  "sed 's/const split = splitJoinCodes(codes, now);/const split = splitJoinCodes(codes, now); split.active.push(...split.inactive); split.inactive = [];/' \"scripts/test-gym-join-code-wiring.ts\"" \
  "scripts/test-gym-join-code-wiring.ts" \
  "should have 2 inactive codes"

# W6: invites list skips splitJoinCodes
run_mutant \
  "(W6) invites list skips split" \
  "Remove splitJoinCodes import" \
  "sed 's/import.*splitJoinCodes.*from/#&/' \"src/app/owner/invites/invites-list.tsx\"" \
  "src/app/owner/invites/invites-list.tsx" \
  "invites list must import splitJoinCodes"

echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   $TOTAL_MUTANTS"
echo "Mutants killed (test passed):    $PASS_COUNT"
echo "Mutants survived (test failed):  $FAIL_COUNT"
echo "Errors (sed/assertion mismatch): $ERROR_COUNT"
echo

if [ $FAIL_COUNT -eq 0 ] && [ $ERROR_COUNT -eq 0 ]; then
  echo "✅ All mutants killed"
  exit 0
else
  echo "❌ Some mutants survived or errors occurred"
  exit 1
fi
