#!/usr/bin/env bash
# Mutant test for MEDIUM-1: Make summary use raw elapsed time instead of saved duration.
# The test must fail on this assertion.

set -e

# Create a backup
cp src/lib/session/summary-duration.ts src/lib/session/summary-duration.ts.backup

# Apply mutant: Make summary always use elapsed time (break the stale fix)
cat > src/lib/session/summary-duration.ts << 'EOF'
/**
 * Decide what duration to show in the finish summary.
 *
 * MUTANT: Always use elapsed timer (breaks stale session handling)
 */
export function summaryDurationSeconds(params: {
  savedDurationSeconds: number | null;
  elapsedSeconds: number;
  isStale: boolean;
  nowMs: number;
}): number {
  // MUTANT: Always return elapsed, ignoring saved duration
  return params.elapsedSeconds;
}
EOF

echo "Applied mutant: summary now uses raw elapsed time"

# Run the test - it MUST fail
if npm run test:stale-finish-summary-duration 2>&1 | grep -q "FAIL"; then
  echo "✅ PASS: Mutant was killed by test (test failed as expected)"
  # Restore original
  mv src/lib/session/summary-duration.ts.backup src/lib/session/summary-duration.ts
  exit 0
else
  echo "❌ FAIL: Mutant survived! Test did not catch the bug."
  # Restore original
  mv src/lib/session/summary-duration.ts.backup src/lib/session/summary-duration.ts
  exit 1
fi
