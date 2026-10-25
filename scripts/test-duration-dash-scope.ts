#!/usr/bin/env tsx
/**
 * Test formatDurationMinutes "—" scope (item 9).
 * 
 * Verify that "—" is only shown for finished strength sessions (completed or ended early)
 * with null duration. Other rows return null.
 * 
 *   npx tsx scripts/test-duration-dash-scope.ts
 */

import { formatDurationMinutes } from "../src/lib/history/compute-duration";

let failures = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    failures++;
    console.log(`❌ ${message}`);
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("Test '—' scope: finished strength sessions only\n");

// 1. Finished strength with null duration → "—"
console.log("1. Completed strength session, null duration → '—'");
assertEquals(
  formatDurationMinutes(null, "completed", "weights"),
  "—",
  "completed weights with null"
);

console.log("\n2. Skipped strength session, null duration → '—'");
assertEquals(
  formatDurationMinutes(null, "skipped", "bodyweight"),
  "—",
  "skipped bodyweight with null"
);

// 3. Non-strength sessions with null duration → null (not "—")
console.log("\n3. Completed breathing session, null duration → null");
assertEquals(
  formatDurationMinutes(null, "completed", "meditation"),
  null,
  "completed meditation with null"
);

console.log("\n4. Completed yoga session, null duration → null");
assertEquals(
  formatDurationMinutes(null, "completed", "yoga"),
  null,
  "completed yoga with null"
);

// 5. In-progress strength with null duration → null (not "—")
console.log("\n5. In-progress strength session, null duration → null");
assertEquals(
  formatDurationMinutes(null, "in_progress", "weights"),
  null,
  "in_progress weights with null"
);

// 6. Planned strength with null duration → null (not "—")
console.log("\n6. Planned strength session, null duration → null");
assertEquals(
  formatDurationMinutes(null, "planned", "weights"),
  null,
  "planned weights with null"
);

// 7. Finished strength with valid duration → formatted normally
console.log("\n7. Completed strength session, 1800s duration → '30 min'");
assertEquals(
  formatDurationMinutes(1800, "completed", "weights"),
  "30 min",
  "completed weights with 1800s"
);

// 8. Finished strength with 0 duration → null (for "Ended early" label)
console.log("\n8. Completed strength session, 0s duration → null");
assertEquals(
  formatDurationMinutes(0, "completed", "weights"),
  null,
  "completed weights with 0s"
);

// 9. Edge case: no status/type provided (backward compat)
console.log("\n9. No status/type provided, null duration → null");
assertEquals(
  formatDurationMinutes(null),
  null,
  "null duration, no metadata"
);

console.log("\n10. No status/type provided, valid duration → formatted");
assertEquals(
  formatDurationMinutes(3600),
  "60 min",
  "3600s, no metadata"
);

if (failures === 0) {
  console.log("\n✅ All tests passed");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}
