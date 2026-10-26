/**
 * Test: Demo path anchoring - new plans start on sign-up day
 * 
 * Requirement: A new plan's first training day = the day they sign up (started_on)
 * 
 * Run: npx tsx scripts/test-new-plan-anchoring.ts
 */

import { strict as assert } from "assert";

console.log("Test: New plan anchoring\n");

// Key requirement: For a NEW plan, started_on should ALWAYS be a training day (day 1)
// regardless of what weekday it is.

console.log("Requirement:");
console.log("- New user signs up on any day → that day becomes training day 1");
console.log("- Subsequent training days follow the plan's spacing pattern");
console.log("- Existing plans keep their current schedule (no re-anchoring)\n");

// This will be implemented by:
// 1. In persist.ts: set started_on = today when creating first block
// 2. In generate.ts: use started_on to compute which weekdays get which training days
// 3. In splits.ts: add activeDayIndicesAnchored(started_on, daysPerWeek) function

console.log("✅ Test framework ready");
console.log("\nImplementation steps:");
console.log("1. Add activeDayIndicesAnchored() to splits.ts");
console.log("2. Pass started_on to generateProgram()");
console.log("3. Use anchored indices for new plans, keep old logic for existing");
console.log("4. Test with real program generation");
