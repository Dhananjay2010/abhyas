#!/usr/bin/env bash
# Mutant verification for PR #169 follow-up fixes
# Each mutant must fail a NEW chained test on an assertion

set -e

echo "=== PR #169 Follow-up Mutant Verification ==="
echo ""

RESULTS=()

# Helper to run mutant test
test_mutant() {
  local item="$1"
  local file="$2"
  local mutant_desc="$3"
  local restore_line="$4"
  local test_cmd="$5"
  
  echo "Testing: $item - $mutant_desc"
  echo "  File: $file"
  
  # Backup
  cp "$file" "${file}.backup"
  
  # Apply mutant (specific to each case)
  case "$item" in
    "item1")
      # Mutant: stale close uses warm-up rest instead of working set rest
      sed -i 's/lastWorkingSetRestSeconds/lastSetRestSeconds/g' "$file"
      ;;
    "item2")
      # Mutant: Done handler never sets retry (setNeedsFinishRetry(false) hardcoded)
      sed -i '768s/setNeedsFinishRetry(shouldShowFinishRetry(!!result))/setNeedsFinishRetry(false)/' "$file"
      ;;
    "item4")
      # Mutant: drop warm-up filter from buildHistoryDetailView
      sed -i '/\.filter((s) => !s\.is_warmup_set)/d' "$file"
      ;;
    "item5")
      # Mutant: runner shows raw error text (pass through err.message)
      sed -i '60,64s|"That didn.*"|err instanceof Error ? err.message : String(err)|' "$file"
      ;;
    "item6-detail")
      # Mutant: buildHistoryDetailView uses inline minute formatting
      sed -i 's/formatDurationMinutes(/(() => { const s = /; s/session\.status,/; return s === null ? "—" : s === 0 ? null : `${Math.round(s \/ 60)} min`; })(/; s/session\.actual_type//' "$file"
      ;;
    "item6-list")
      # Mutant: buildHistoryListRow uses inline minute formatting
      sed -i 's/formatDurationMinutes(/(() => { const s = /; s/"completed",/; return s === null || s === 0 ? "—" : `${Math.round(s \/ 60)} min`; })(/; s/"weights"//' "$file"
      ;;
  esac
  
  # Run test
  if npm run "$test_cmd" > /tmp/mutant-output.txt 2>&1; then
    echo "  ❌ SURVIVED - test passed with mutant (BAD)"
    RESULTS+=("$item: SURVIVED")
    tail -20 /tmp/mutant-output.txt
  else
    echo "  ✅ KILLED - test failed as expected"
    RESULTS+=("$item: KILLED")
  fi
  
  # Restore
  mv "${file}.backup" "$file"
  echo ""
}

# Item 1: stale close uses warm-up rest
test_mutant "item1" \
  "src/lib/session/close-stale.ts" \
  "use warm-up rest instead of working set rest" \
  "lastWorkingSetRestSeconds" \
  "test:pr169-stale-close-warmup-rest"

# Item 2: Done handler never sets retry
test_mutant "item2" \
  "src/app/session/[id]/session-runner.tsx" \
  "Done handler never sets needsFinishRetry to true" \
  "setNeedsFinishRetry(shouldShowFinishRetry(!!result))" \
  "test:pr169-runner-done-retry-wiring"

# Item 4: drop warm-up filter
test_mutant "item4" \
  "src/lib/history/build-detail-view.ts" \
  "drop .filter((s) => !s.is_warmup_set) from buildHistoryDetailView" \
  ".filter" \
  "test:pr169-history-detail-page"

# Item 5: show raw error text
test_mutant "item5" \
  "src/lib/session/runner-error-message.ts" \
  "pass through raw error text (revert item 5)" \
  "That didn" \
  "test:runner-jsdom-wiring"

# Item 6-detail: inline minute formatting
test_mutant "item6-detail" \
  "src/lib/history/build-detail-view.ts" \
  "buildHistoryDetailView uses inline Math.round(s/60) formatting" \
  "formatDurationMinutes" \
  "test:pr169-history-detail-page"

# Item 6-list: inline minute formatting
test_mutant "item6-list" \
  "src/lib/history/build-list-row.ts" \
  "buildHistoryListRow uses inline Math.round(s/60) formatting" \
  "formatDurationMinutes" \
  "test:pr169-history-list-page"

echo "=== Mutant Verification Summary ==="
for result in "${RESULTS[@]}"; do
  echo "  $result"
done

# Check if all killed
KILLED_COUNT=$(echo "${RESULTS[@]}" | grep -o "KILLED" | wc -l)
TOTAL=${#RESULTS[@]}

echo ""
if [ "$KILLED_COUNT" -eq "$TOTAL" ]; then
  echo "✅ All $TOTAL mutants killed"
  exit 0
else
  echo "❌ $((TOTAL - KILLED_COUNT))/$TOTAL mutants survived"
  exit 1
fi
