/**
 * Test computeDoneDays with real session data structure.
 *
 * FIX (b): Verifies that completed sessions mark days as done.
 */

import { computeDoneDays } from "@/lib/today/compute-done-days";

const sessions = [
  {
    local_date: "2026-10-25",
    status: "completed",
    actual_type: "strength",
  },
  {
    local_date: "2026-10-26",
    status: "in_progress",
    actual_type: "strength",
  },
  {
    local_date: "2026-10-27",
    status: "completed",
    actual_type: "yoga",
  },
  {
    local_date: "2026-10-28",
    status: "completed",
    actual_type: null, // Rest day
  },
];

const doneDays = computeDoneDays(sessions);

// Test 1: Completed strength session marks day done
if (!doneDays.has("2026-10-25")) {
  console.error("✗ Completed strength session should mark day done");
  process.exit(1);
}

// Test 2: In-progress session does NOT mark day done
if (doneDays.has("2026-10-26")) {
  console.error("✗ In-progress session should NOT mark day done");
  process.exit(1);
}

// Test 3: Completed yoga marks day done
if (!doneDays.has("2026-10-27")) {
  console.error("✗ Completed yoga session should mark day done");
  process.exit(1);
}

// Test 4: Completed with null actual_type does NOT mark done
if (doneDays.has("2026-10-28")) {
  console.error("✗ Session with null actual_type should NOT mark day done");
  process.exit(1);
}

console.log("✓ computeDoneDays test passed");
console.log(`  Done days: ${Array.from(doneDays).join(", ")}`);
