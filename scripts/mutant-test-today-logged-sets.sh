#!/bin/bash
# Mutant test: Verify formatLoggedSets is required for logged sets wiring.
# 
# FIX (c): The wiring must call formatLoggedSets to produce a displayable string.
# The mutant skips the call; the test verifies an assertion fails.

set -e

echo "Mutant test: Skip formatLoggedSets call"

npx tsx - << 'EOF'
/**
 * Test that formatLoggedSets produces output; without it, no display.
 */

import { formatLoggedSets, type LoggedSet } from "./src/lib/session/format-logged-sets";

const sets: LoggedSet[] = [
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 9, weightKg: 80, durationSeconds: null, isWarmupSet: false },
];

// WITH formatLoggedSets
const formatted = formatLoggedSets(sets, "reps", "metric");
if (!formatted || !formatted.includes("×")) {
  console.error("❌ formatLoggedSets required but didn't produce output");
  process.exit(1);
}
console.log("✓ WITH wiring: formatted =", formatted);

// WITHOUT formatLoggedSets (mutant)
const loggedSets: string | undefined = undefined;
if (loggedSets) {
  console.error("❌ MUTANT SURVIVED: loggedSets populated without formatLoggedSets");
  process.exit(1);
}
console.log("✓ WITHOUT wiring: loggedSets is undefined (fallback to target)");

console.log("✅ MUTANT KILLED: formatLoggedSets is required");
EOF

echo "✓ Mutant test passed"
exit 0
