#!/usr/bin/env tsx
/**
 * Test exerciseCompletion helper for partial exercises (coordinator's rule nm-06).
 */

import { exerciseCompletion } from "../src/lib/session/completion";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nTesting exerciseCompletion helper\n");

console.log("1. Zero working sets logged → skipped");
check(
  "0 of 5 sets",
  exerciseCompletion(0, 5) === "skipped",
  `got '${exerciseCompletion(0, 5)}'`
);
check(
  "0 of 1 set",
  exerciseCompletion(0, 1) === "skipped",
  `got '${exerciseCompletion(0, 1)}'`
);
check(
  "0 of 10 sets",
  exerciseCompletion(0, 10) === "skipped",
  `got '${exerciseCompletion(0, 10)}'`
);

console.log("\n2. All planned sets logged → completed");
check(
  "5 of 5 sets",
  exerciseCompletion(5, 5) === "completed",
  `got '${exerciseCompletion(5, 5)}'`
);
check(
  "1 of 1 set",
  exerciseCompletion(1, 1) === "completed",
  `got '${exerciseCompletion(1, 1)}'`
);
check(
  "10 of 10 sets",
  exerciseCompletion(10, 10) === "completed",
  `got '${exerciseCompletion(10, 10)}'`
);

console.log("\n3. More than planned sets logged → completed");
check(
  "6 of 5 sets (extra)",
  exerciseCompletion(6, 5) === "completed",
  `got '${exerciseCompletion(6, 5)}'`
);
check(
  "11 of 10 sets (extra)",
  exerciseCompletion(11, 10) === "completed",
  `got '${exerciseCompletion(11, 10)}'`
);

console.log("\n4. Some but not all planned sets logged → partial");
check(
  "1 of 5 sets",
  exerciseCompletion(1, 5) === "partial",
  `got '${exerciseCompletion(1, 5)}'`
);
check(
  "2 of 5 sets",
  exerciseCompletion(2, 5) === "partial",
  `got '${exerciseCompletion(2, 5)}'`
);
check(
  "4 of 5 sets",
  exerciseCompletion(4, 5) === "partial",
  `got '${exerciseCompletion(4, 5)}'`
);
check(
  "3 of 10 sets",
  exerciseCompletion(3, 10) === "partial",
  `got '${exerciseCompletion(3, 10)}'`
);

console.log("\n5. No plan information → completed");
check(
  "5 sets, no plan (undefined)",
  exerciseCompletion(5, undefined) === "completed",
  `got '${exerciseCompletion(5, undefined)}'`
);
check(
  "1 set, no plan (null)",
  exerciseCompletion(1, null) === "completed",
  `got '${exerciseCompletion(1, null)}'`
);
check(
  "3 sets, planned 0",
  exerciseCompletion(3, 0) === "completed",
  `got '${exerciseCompletion(3, 0)}'`
);

console.log("\n6. Edge case: 0 sets with no plan → skipped");
check(
  "0 sets, no plan",
  exerciseCompletion(0, undefined) === "skipped",
  `got '${exerciseCompletion(0, undefined)}'`
);
check(
  "0 sets, planned 0",
  exerciseCompletion(0, 0) === "skipped",
  `got '${exerciseCompletion(0, 0)}'`
);

console.log("\n7. Product rule: partial exercises count toward volume/PRs/streaks");
console.log("  (This is behavioral - verified in integration tests)");
check("partial status exists", exerciseCompletion(2, 5) === "partial");

if (failures === 0) {
  console.log("\n✅ All exerciseCompletion tests passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
