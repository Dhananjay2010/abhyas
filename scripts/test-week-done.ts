/**
 * Test computeCompletedDays (FIX b): marks days done in week view.
 *
 * Must FAIL on main: week view didn't show today as done after session completed.
 */

import { computeCompletedDays } from "../src/lib/today/completed-days";

console.log("Test computeCompletedDays (FIX b)\n");

// Test 1: Completed strength session marks the day done
const sessions1 = [
  { local_date: "2026-10-25", status: "completed", actual_type: "weights" },
];
const done1 = computeCompletedDays(sessions1);
if (!done1.has("2026-10-25")) {
  console.error("✗ Completed strength session didn't mark day done");
  process.exit(1);
}
console.log("✓ Completed strength session marks day done");

// Test 2: In-progress session does NOT mark day done
const sessions2 = [
  { local_date: "2026-10-25", status: "in_progress", actual_type: "weights" },
];
const done2 = computeCompletedDays(sessions2);
if (done2.has("2026-10-25")) {
  console.error("✗ In-progress session marked day done (should not)");
  process.exit(1);
}
console.log("✓ In-progress session does not mark day done");

// Test 3: Day swap - Monday planned Upper, Lower completed on Monday → Monday done
// Keys on actual local_date, not original plan day
const sessions3 = [
  // User swapped Monday from Upper to Lower and completed it
  { local_date: "2026-10-27", status: "completed", actual_type: "weights" },
];
const done3 = computeCompletedDays(sessions3);
if (!done3.has("2026-10-27")) {
  console.error("✗ Swapped day not marked done (should key on actual local_date)");
  process.exit(1);
}
console.log("✓ Day swap: completed session marks actual local_date done");

// Test 4: Timezone edge - session completed at 23:30 IST marks the IST day
// (The function takes local_date already resolved, so it just checks the date string)
const sessions4 = [
  // Session completed 2026-10-25 23:30 IST (which is 2026-10-25 in IST, but might be 2026-10-26 UTC)
  // The local_date is already resolved to IST date
  { local_date: "2026-10-25", status: "completed", actual_type: "weights" },
];
const done4 = computeCompletedDays(sessions4);
if (!done4.has("2026-10-25")) {
  console.error("✗ Timezone-resolved date not marked done");
  process.exit(1);
}
console.log("✓ Timezone edge: session marks the timezone-resolved date done");

// Test 5: Completed yoga session marks day done
const sessions5 = [
  { local_date: "2026-10-25", status: "completed", actual_type: "yoga" },
];
const done5 = computeCompletedDays(sessions5);
if (!done5.has("2026-10-25")) {
  console.error("✗ Completed yoga session didn't mark day done");
  process.exit(1);
}
console.log("✓ Completed yoga session marks day done");

// Test 6: Completed breathing session marks day done
const sessions6 = [
  { local_date: "2026-10-25", status: "completed", actual_type: "breathe" },
];
const done6 = computeCompletedDays(sessions6);
if (!done6.has("2026-10-25")) {
  console.error("✗ Completed breathing session didn't mark day done");
  process.exit(1);
}
console.log("✓ Completed breathing session marks day done");

// Test 7: Multiple sessions on same day - day is marked done once
const sessions7 = [
  { local_date: "2026-10-25", status: "completed", actual_type: "weights" },
  { local_date: "2026-10-25", status: "completed", actual_type: "yoga" },
];
const done7 = computeCompletedDays(sessions7);
if (!done7.has("2026-10-25") || done7.size !== 1) {
  console.error("✗ Multiple sessions on same day not handled correctly");
  process.exit(1);
}
console.log("✓ Multiple sessions on same day handled correctly");

console.log("\n✅ All computeCompletedDays tests passed");
console.log("  On main: would not mark days done (no done-marking logic)");
console.log("  With fix: marks completed sessions (any type) as done");
