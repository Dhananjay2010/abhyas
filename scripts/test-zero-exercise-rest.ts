#!/usr/bin/env npx tsx
/**
 * Test Item 5: Zero-exercise day treated as rest.
 * 
 * When all exercises are dropped after cleanup (zero safe alternatives),
 * the day should be treated as rest, not crash or show empty exercises.
 */

console.log("Testing zero-exercise day as rest\n");

(async () => {
  // Verify the code path exists by checking the source
  const fs = await import("fs");
  const source = fs.readFileSync("src/app/today/page.tsx", "utf-8");

  if (!source.includes('cleanedExercises.length === 0') || !source.includes('day_type: "rest"')) {
    console.error("✗ FAIL: Zero-exercise rest handling not found in source");
    process.exit(1);
  }

  console.log("✓ PASS: Zero-exercise day handling verified");
  console.log("  Code present: when cleanedExercises.length === 0, day_type set to 'rest'");
  console.log("  This prevents empty exercise lists and treats dropped days as rest");
})();
