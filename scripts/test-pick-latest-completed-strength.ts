/**
 * Tests for pickLatestCompletedStrength with mutant coverage.
 * 
 * These tests kill the surviving mutants from the QA Bot report:
 * - P1: sort ascending (oldest instead of latest)
 * - P2: drop the status==="completed" filter  
 * - P3: drop the strength filter
 */

import { pickLatestCompletedStrength } from "../src/lib/today/pick-latest-completed-strength";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test 1: Pick latest by created_at (kills P1: oldest-first sort)
test("Returns latest completed strength session by created_at", () => {
  const sessions = [
    { id: "s1", status: "completed", actual_type: "weights", created_at: "2026-10-25T10:00:00Z" },
    { id: "s2", status: "completed", actual_type: "weights", created_at: "2026-10-25T14:00:00Z" },
    { id: "s3", status: "completed", actual_type: "weights", created_at: "2026-10-25T08:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result?.created_at === "2026-10-25T14:00:00Z", "Should return the latest session");
});

// Test 2: Filter out non-completed sessions (kills P2: drop completed filter)
test("Excludes in_progress sessions", () => {
  const sessions = [
    { id: "s1", status: "in_progress", actual_type: "weights", created_at: "2026-10-25T14:00:00Z" },
    { id: "s2", status: "completed", actual_type: "weights", created_at: "2026-10-25T10:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result?.created_at === "2026-10-25T10:00:00Z", "Should exclude in_progress sessions");
});

// Test 3: Filter out yoga sessions (kills P3: drop strength filter)
test("Excludes yoga sessions", () => {
  const sessions = [
    { id: "s1", status: "completed", actual_type: "yoga", created_at: "2026-10-25T14:00:00Z" },
    { id: "s2", status: "completed", actual_type: "weights", created_at: "2026-10-25T10:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result?.actual_type === "weights", "Should exclude yoga sessions");
});

// Test 4: Filter out meditation sessions (strength filter coverage)
test("Excludes meditation sessions", () => {
  const sessions = [
    { id: "s1", status: "completed", actual_type: "meditation", created_at: "2026-10-25T14:00:00Z" },
    { id: "s2", status: "completed", actual_type: "bodyweight", created_at: "2026-10-25T10:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result?.actual_type === "bodyweight", "Should exclude meditation sessions");
});

// Test 5: Return undefined when no completed strength sessions exist
test("Returns undefined when no completed strength sessions", () => {
  const sessions = [
    { id: "s1", status: "in_progress", actual_type: "weights", created_at: "2026-10-25T10:00:00Z" },
    { id: "s2", status: "completed", actual_type: "yoga", created_at: "2026-10-25T11:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result === undefined, "Should return undefined when no completed strength sessions");
});

// Test 6: Handle empty sessions array
test("Returns undefined for empty sessions array", () => {
  const sessions: Array<{ id: string; status: string | null; actual_type: string | null; created_at: string | null }> = [];
  const result = pickLatestCompletedStrength(sessions);
  assert(result === undefined, "Should return undefined for empty array");
});

// Test 7: Bodyweight counts as strength
test("Includes bodyweight as strength", () => {
  const sessions = [
    { id: "s1", status: "completed", actual_type: "bodyweight", created_at: "2026-10-25T10:00:00Z" },
  ];
  const result = pickLatestCompletedStrength(sessions);
  assert(result?.actual_type === "bodyweight", "Should include bodyweight sessions");
});

console.log("\nAll pickLatestCompletedStrength tests passed! ✓");
