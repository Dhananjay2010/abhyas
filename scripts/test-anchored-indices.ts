/**
 * Test: activeDayIndicesAnchored correctly anchors training days to start date
 * 
 * Run: npx tsx scripts/test-anchored-indices.ts
 */

import { strict as assert } from "assert";
import { activeDayIndicesAnchored } from "../src/lib/program/splits";

console.log("Test: activeDayIndicesAnchored\n");

// Test 1: 3-day plan starting Tuesday
console.log("1. 3-day plan starting Tuesday (weekday 2)");
{
  const result = activeDayIndicesAnchored("2026-10-27", 3); // Tuesday
  console.log("  Result:", result);
  assert.ok(result.includes(2), "Must include Tuesday");
  assert.equal(result.length, 3, "Must have 3 training days");
  
  // For 3-day plan, base spacing is 2 days
  // Starting Tuesday: Tue, Thu, Sat
  assert.deepEqual(result.sort(), [2, 4, 6].sort(), "Tue, Thu, Sat");
  console.log("  ✓ Tuesday, Thursday, Saturday");
}

// Test 2: 3-day plan starting Thursday
console.log("\n2. 3-day plan starting Thursday (weekday 4)");
{
  const result = activeDayIndicesAnchored("2026-10-29", 3); // Thursday
  console.log("  Result:", result);
  assert.ok(result.includes(4), "Must include Thursday");
  
  // Starting Thursday: Thu, Sat, Mon (wraps)
  assert.deepEqual(result.sort(), [1, 4, 6].sort(), "Thu, Sat, Mon");
  console.log("  ✓ Thursday, Saturday, Monday (wraps)");
}

// Test 3: 3-day plan starting Saturday
console.log("\n3. 3-day plan starting Saturday (weekday 6)");
{
  const result = activeDayIndicesAnchored("2026-10-31", 3); // Saturday
  console.log("  Result:", result);
  assert.ok(result.includes(6), "Must include Saturday");
  
  // Starting Saturday: Sat, Mon, Wed (wraps)
  assert.deepEqual(result.sort(), [1, 3, 6].sort(), "Sat, Mon, Wed");
  console.log("  ✓ Saturday, Monday, Wednesday");
}

// Test 4: 4-day plan starting Wednesday
console.log("\n4. 4-day plan starting Wednesday (weekday 3)");
{
  const result = activeDayIndicesAnchored("2026-10-28", 4); // Wednesday
  console.log("  Result:", result);
  assert.ok(result.includes(3), "Must include Wednesday");
  assert.equal(result.length, 4, "Must have 4 training days");
  
  // Base pattern [1,2,4,5] has spacing: 1, 2, 1
  // Starting Wed: Wed, Thu, Sat, Sun
  assert.deepEqual(result.sort(), [3, 4, 6, 7].sort(), "Wed, Thu, Sat, Sun");
  console.log("  ✓ Wednesday, Thursday, Saturday, Sunday");
}

// Test 5: 5-day plan starting Friday
console.log("\n5. 5-day plan starting Friday (weekday 5)");
{
  const result = activeDayIndicesAnchored("2026-10-30", 5); // Friday
  console.log("  Result:", result);
  assert.ok(result.includes(5), "Must include Friday");
  assert.equal(result.length, 5, "Must have 5 training days");
  
  // Base pattern [1,2,3,5,6] has spacing: 1, 1, 2, 1
  // Starting Fri: Fri, Sat, Sun, Tue, Wed
  assert.deepEqual(result.sort(), [2, 3, 5, 6, 7].sort(), "Fri, Sat, Sun, Tue, Wed");
  console.log("  ✓ Friday, Saturday, Sunday, Tuesday, Wednesday");
}

// Test 6: All weekdays for 3-day plan produce 3 training days
console.log("\n6. All weekdays produce correct count");
{
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
  
  for (let i = 0; i < 7; i++) {
    const result = activeDayIndicesAnchored(dates[i], 3);
    assert.equal(result.length, 3, `${weekdays[i]}: must have 3 training days`);
    assert.ok(result.includes(i + 1), `${weekdays[i]}: must include start day`);
  }
  console.log("  ✓ All 7 weekdays produce 3 training days each");
}

console.log("\n✅ All anchored indices tests passed");
