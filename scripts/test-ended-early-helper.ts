/**
 * Unit tests for isEndedEarly helper.
 * 
 * Tests all branches of the ended-early logic:
 * - Pending exercise with working sets < planned sets
 * - Completed strength session with 0 working sets and pending exercises
 * - Completed strength session with 0 working sets and no exercises
 * - False cases (completed all sets, non-strength, non-completed status)
 */

import { isEndedEarly } from "../src/lib/session/ended-early";

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

// Test 1: Pending exercise with working sets < planned sets
test("Returns true when pending exercise and working sets < planned sets", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: true,
    plannedSets: 12,
    workingSetCount: 5,
    hasNoExercises: false,
  });
  assert(result === true, "Should return true for pending with incomplete sets");
});

// Test 2: Completed strength session with 0 working sets and pending exercise
test("Returns true when strength session with 0 working sets and pending exercise", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: true,
    plannedSets: 12,
    workingSetCount: 0,
    hasNoExercises: false,
  });
  assert(result === true, "Should return true for 0 sets with pending exercise");
});

// Test 3: Completed strength session with 0 working sets and no exercises
test("Returns true when strength session with 0 working sets and no exercises", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: false,
    plannedSets: 0,
    workingSetCount: 0,
    hasNoExercises: true,
  });
  assert(result === true, "Should return true for 0 sets with no exercises");
});

// Test 4: False case - completed all planned sets
test("Returns false when all planned sets completed", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: false,
    plannedSets: 12,
    workingSetCount: 12,
    hasNoExercises: false,
  });
  assert(result === false, "Should return false when all sets completed");
});

// Test 5: False case - completed more than planned sets
test("Returns false when working sets exceed planned sets", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: false,
    plannedSets: 12,
    workingSetCount: 15,
    hasNoExercises: false,
  });
  assert(result === false, "Should return false when more sets than planned");
});

// Test 6: False case - non-strength session (yoga)
test("Returns false for non-strength session", () => {
  const result = isEndedEarly({
    isStrength: false,
    status: "completed",
    hasPendingExercise: true,
    plannedSets: 12,
    workingSetCount: 5,
    hasNoExercises: false,
  });
  assert(result === false, "Should return false for non-strength sessions");
});

// Test 7: False case - non-completed status
test("Returns false when status is not completed", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "in_progress",
    hasPendingExercise: true,
    plannedSets: 12,
    workingSetCount: 5,
    hasNoExercises: false,
  });
  assert(result === false, "Should return false for non-completed status");
});

// Test 8: Edge case - no planned sets with pending exercise and 0 working sets
// This is considered ended early by the second branch (0 working sets + pending exercise)
test("Returns true when 0 planned sets with pending exercise and 0 working sets", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: true,
    plannedSets: 0,
    workingSetCount: 0,
    hasNoExercises: false,
  });
  assert(result === true, "Should return true - edge case of 0 working sets with pending exercise");
});

// Test 9: Edge case - undefined planned sets with pending exercise and 0 working sets
// This is considered ended early by the second branch (0 working sets + pending exercise)
test("Returns true when planned sets is undefined with pending exercise and 0 working sets", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: true,
    plannedSets: undefined,
    workingSetCount: 0,
    hasNoExercises: false,
  });
  assert(result === true, "Should return true - edge case of 0 working sets with pending exercise");
});

// Test 10: Edge case - completed with some sets but all exercises completed (no pending)
test("Returns false when some sets logged but no pending exercises", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: false,
    plannedSets: 12,
    workingSetCount: 8,
    hasNoExercises: false,
  });
  assert(result === false, "Should return false when no pending exercises despite incomplete sets");
});

// Test 11: All exercises skipped (0 working sets, no completed exercises)
test("Returns true when all exercises skipped (0 working sets, no completed exercises)", () => {
  const result = isEndedEarly({
    isStrength: true,
    status: "completed",
    hasPendingExercise: false,
    plannedSets: 0,
    workingSetCount: 0,
    hasNoExercises: true,
  });
  assert(result === true, "Should return true when all exercises skipped");
});

console.log("\nAll tests passed! ✓");
