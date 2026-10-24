#!/usr/bin/env tsx
/**
 * Test: First-session "Start it now" must use real start flow, not broken link.
 * 
 * Verifies that the first-session offer produces a valid plan for planDay,
 * not a broken /session/start?programDayId=... link that hits notFound().
 */

import { buildFirstSessionPlan } from "../src/components/today/start-first-session-button";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log("=== Test: First-session start flow ===\n");

// The first-session offer should produce a plan with kind: "training" and the program day ID
const testProgramDayId = "d5e6f7a8-b9c0-1d2e-3f4a-5b6c7d8e9f0a";
const plan = buildFirstSessionPlan(testProgramDayId);

console.log(`Plan for first session: ${JSON.stringify(plan)}`);

assert(plan.kind === "training", "Plan kind must be 'training'");
assert(plan.programDayId === testProgramDayId, "Plan must include the program day ID");
assert(typeof plan.programDayId === "string", "Program day ID must be a string");
assert(plan.programDayId.length > 0, "Program day ID must not be empty");

// The plan should NOT be a URL string
assert(!plan.programDayId.startsWith("/session/start"), "Must not use broken /session/start?programDayId= link");
assert(!plan.programDayId.includes("?"), "Program day ID must be a UUID, not a URL query string");

console.log("\n✅ First-session start flow uses correct planDay structure\n");
