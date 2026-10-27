/**
 * Test: activeDayIndicesAnchored unit test
 * 
 * Verifies activeDayIndicesAnchored correctly computes weekday indices
 * relative to a start date for new plan anchoring.
 */

import { strict as assert } from "assert";
import { activeDayIndicesAnchored } from "../src/lib/program/splits";

console.log("Test: activeDayIndicesAnchored\n");

// Test 1: 3-day plan on different weekdays
console.log("1. 3-day plans anchor correctly");
{
  // Tuesday start
  const tue = activeDayIndicesAnchored("2026-10-27", 3); // weekday 2
  assert.deepEqual(tue.sort(), [2, 4, 6].sort(), "Tue: [2,4,6]");
  
  // Thursday start
  const thu = activeDayIndicesAnchored("2026-10-29", 3); // weekday 4
  assert.deepEqual(thu.sort(), [1, 4, 6].sort(), "Thu: [1,4,6]");
  
  // Sunday start
  const sun = activeDayIndicesAnchored("2026-11-01", 3); // weekday 7
  assert.deepEqual(sun.sort(), [2, 4, 7].sort(), "Sun: [2,4,7]");
  
  console.log("  ✓ 3-day patterns correct for Tue, Thu, Sun");
}

// Test 2: All 7 weekdays for 3-day plan
console.log("\n2. All 7 weekdays work for 3-day plan");
{
  const dates = [
    "2026-10-26", // Monday
    "2026-10-27", // Tuesday
    "2026-10-28", // Wednesday
    "2026-10-29", // Thursday
    "2026-10-30", // Friday
    "2026-10-31", // Saturday
    "2026-11-01", // Sunday
  ];
  
  for (let i = 0; i < 7; i++) {
    const indices = activeDayIndicesAnchored(dates[i], 3);
    assert.equal(indices.length, 3, `Day ${i+1}: must have 3 training days`);
    assert.ok(indices.includes(i + 1), `Day ${i+1}: must include start weekday`);
  }
  
  console.log("  ✓ All 7 weekdays produce 3 training days with start day included");
}

// Test 3: 4-day and 5-day plans
console.log("\n3. 4-day and 5-day plans");
{
  // 4-day Wednesday start
  const wed4 = activeDayIndicesAnchored("2026-10-28", 4);
  assert.equal(wed4.length, 4, "4-day: 4 training days");
  assert.ok(wed4.includes(3), "4-day: includes Wednesday");
  
  // 5-day Friday start
  const fri5 = activeDayIndicesAnchored("2026-10-30", 5);
  assert.equal(fri5.length, 5, "5-day: 5 training days");
  assert.ok(fri5.includes(5), "5-day: includes Friday");
  
  console.log("  ✓ 4-day and 5-day plans work correctly");
}

// Test 4: Maintains spacing pattern
console.log("\n4. Spacing pattern maintained");
{
  // Check that anchored version maintains 2-day spacing
  const anchored = activeDayIndicesAnchored("2026-10-27", 3);
  const sorted = anchored.sort((a, b) => a - b);
  
  // Check spacing between consecutive days (accounting for wrap)
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i+1] - sorted[i];
    assert.ok(gap === 2 || gap === 3, `Spacing should be 2 or 3, got ${gap}`);
  }
  
  console.log("  ✓ Spacing pattern maintained");
}

console.log("\n✅ All activeDayIndicesAnchored tests passed");
