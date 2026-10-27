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
    if echo "$output" | grep -qF "$expected_error"; then
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

# W1: processRedeemResult ignores server gym_name
run_mutant \
  "(W1) processRedeemResult ignores server gym_name" \
  "Replace gym_name with undefined in mapRedeemResultToMessage call" \
  "sed 's/mapRedeemResultToMessage(result, serverGymName)/mapRedeemResultToMessage(result, undefined)/' \"src/lib/redeem-join-code-errors.ts\"" \
  "src/lib/redeem-join-code-errors.ts" \
  "processRedeemResult must use server gym_name from already_member result"

# W2: actions.ts skips processRedeemResult
run_mutant \
  "(W2) actions.ts skips processRedeemResult" \
  "Replace processRedeemResult call with inline object" \
  "sed 's/return processRedeemResult(data);/return { ok: true };/' \"src/app/join/[code]/actions.ts\"" \
  "src/app/join/[code]/actions.ts" \
  "actions.ts must call processRedeemResult with RPC data"

# W3: gating uses fixed role instead of codeRole
run_mutant \
  "(W3) gating uses fixed role" \
  "Replace codeRole with constant in roleOrder lookup" \
  "sed 's/roleOrder\\[codeRole\\]/roleOrder[\"member\"]/' \"src/lib/gym-join-code-gating.ts\"" \
  "src/lib/gym-join-code-gating.ts" \
  "FAIL: member can redeem owner code"

# W4: join page skips mapPreviewResultToMessage
run_mutant \
  "(W4) join page removes mapPreviewResultToMessage import" \
  "Comment out mapPreviewResultToMessage import" \
  "sed '/^import.*mapPreviewResultToMessage/s/^/\\/\\/ /' \"src/app/join/[code]/page.tsx\"" \
  "src/app/join/[code]/page.tsx" \
  "join page must import mapPreviewResultToMessage"

# W5: splitJoinCodes flips <= to < (expiry boundary mutant)
run_mutant \
  "(W5) splitJoinCodes changes <= to <" \
  "Change expires_at <= now to expires_at < now" \
  "sed 's/expires_at) <= now/expires_at) < now/' \"src/lib/split-join-codes.ts\"" \
  "src/lib/split-join-codes.ts" \
  "code expiring exactly now must be inactive (kills <= to < mutant)"

# W6: invites list removes splitJoinCodes import
run_mutant \
  "(W6) invites list removes splitJoinCodes import" \
  "Comment out splitJoinCodes import" \
  "sed '/^import.*splitJoinCodes/s/^/\\/\\/ /' \"src/app/owner/invites/invites-list.tsx\"" \
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
