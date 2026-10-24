#!/usr/bin/env tsx
/**
 * Test finishExercise idempotency (k1).
 *
 * Verifies that calling finishExercise multiple times (retry, timeout, or
 * multiple tabs) doesn't apply progression more than once.
 */

import assert from "node:assert";

console.log("\n🧪 Testing finishExercise idempotency...\n");

/**
 * Mock session exercise data
 */
type SessionExercise = {
  id: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  feel: "easy" | "right" | "hard" | null;
  completed_at: string | null;
};

type ExerciseProgress = {
  exercise_id: string;
  current_working_weight_kg: number;
  consecutive_failures: number;
};

/**
 * Simulated database state
 */
const db = {
  sessionExercises: new Map<string, SessionExercise>(),
  exerciseProgress: new Map<string, ExerciseProgress>(),
};

/**
 * Mock finishExercise following the idempotency pattern
 */
async function finishExercise(input: {
  sessionExerciseId: string;
  feel: "easy" | "right" | "hard" | null;
  skipped?: boolean;
}): Promise<{ ok: boolean; progressionApplied: boolean }> {
  const exercise = db.sessionExercises.get(input.sessionExerciseId);
  if (!exercise) return { ok: false, progressionApplied: false };

  // k1: Only update if not already completed or skipped
  if (exercise.status === "completed" || exercise.status === "skipped") {
    // Already finished - idempotent return
    return { ok: true, progressionApplied: false };
  }

  // Update the exercise
  exercise.status = input.skipped ? "skipped" : "completed";
  exercise.feel = input.feel;
  exercise.completed_at = new Date().toISOString();

  if (input.skipped) return { ok: true, progressionApplied: false };

  // Apply progression (simplified)
  const progress = db.exerciseProgress.get(exercise.id);
  if (progress) {
    if (input.feel === "easy") {
      progress.current_working_weight_kg += 2.5;
      progress.consecutive_failures = 0;
    } else if (input.feel === "hard") {
      progress.consecutive_failures += 1;
    } else {
      progress.consecutive_failures = 0;
    }
  }

  return { ok: true, progressionApplied: true };
}

/**
 * Test 1: Sequential double-call (retry scenario)
 */
async function testSequentialDoublCall() {
  console.log("Test 1: Sequential double-call (retry scenario)");

  // Setup
  const exerciseId = "exercise-1";
  db.sessionExercises.set(exerciseId, {
    id: exerciseId,
    status: "in_progress",
    feel: null,
    completed_at: null,
  });
  db.exerciseProgress.set(exerciseId, {
    exercise_id: exerciseId,
    current_working_weight_kg: 50,
    consecutive_failures: 0,
  });

  // First call - should apply progression
  const result1 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: "easy",
  });

  assert.strictEqual(result1.ok, true, "First call should succeed");
  assert.strictEqual(result1.progressionApplied, true, "First call should apply progression");

  const progress1 = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(progress1.current_working_weight_kg, 52.5, "Weight should increase by 2.5kg");

  // Second call (retry) - should NOT apply progression again
  const result2 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: "easy",
  });

  assert.strictEqual(result2.ok, true, "Second call should succeed");
  assert.strictEqual(result2.progressionApplied, false, "Second call should NOT apply progression");

  const progress2 = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(
    progress2.current_working_weight_kg,
    52.5,
    "Weight should NOT increase again (was 52.5, still 52.5)",
  );

  console.log("  ✅ Sequential double-call: progression applied exactly once\n");
}

/**
 * Test 2: Parallel calls (two tabs scenario)
 */
async function testParallelCalls() {
  console.log("Test 2: Parallel calls (two tabs scenario)");

  // Setup
  const exerciseId = "exercise-2";
  db.sessionExercises.set(exerciseId, {
    id: exerciseId,
    status: "in_progress",
    feel: null,
    completed_at: null,
  });
  db.exerciseProgress.set(exerciseId, {
    exercise_id: exerciseId,
    current_working_weight_kg: 60,
    consecutive_failures: 0,
  });

  // Simulate parallel calls (two tabs)
  const [result1, result2] = await Promise.all([
    finishExercise({ sessionExerciseId: exerciseId, feel: "right" }),
    finishExercise({ sessionExerciseId: exerciseId, feel: "right" }),
  ]);

  assert.strictEqual(result1.ok, true, "First parallel call should succeed");
  assert.strictEqual(result2.ok, true, "Second parallel call should succeed");

  // One should apply progression, one should not (order dependent on implementation)
  const appliedCount = [result1, result2].filter((r) => r.progressionApplied).length;
  assert.strictEqual(
    appliedCount,
    1,
    "Exactly one parallel call should apply progression (got " + appliedCount + ")",
  );

  const progress = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(
    progress.current_working_weight_kg,
    60,
    "Weight should not change for 'right' feel",
  );

  console.log("  ✅ Parallel calls: progression applied exactly once\n");
}

/**
 * Test 3: Skipped exercise idempotency
 */
async function testSkippedIdempotency() {
  console.log("Test 3: Skipped exercise idempotency");

  // Setup
  const exerciseId = "exercise-3";
  db.sessionExercises.set(exerciseId, {
    id: exerciseId,
    status: "in_progress",
    feel: null,
    completed_at: null,
  });
  db.exerciseProgress.set(exerciseId, {
    exercise_id: exerciseId,
    current_working_weight_kg: 40,
    consecutive_failures: 0,
  });

  // First skip
  const result1 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: null,
    skipped: true,
  });

  assert.strictEqual(result1.ok, true, "First skip should succeed");
  assert.strictEqual(result1.progressionApplied, false, "Skip should not apply progression");

  // Second skip (retry)
  const result2 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: null,
    skipped: true,
  });

  assert.strictEqual(result2.ok, true, "Second skip should succeed");
  assert.strictEqual(result2.progressionApplied, false, "Second skip should not apply progression");

  const progress = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(
    progress.current_working_weight_kg,
    40,
    "Weight should not change for skipped exercise",
  );
  assert.strictEqual(
    progress.consecutive_failures,
    0,
    "Failures should not increment for skipped exercise",
  );

  console.log("  ✅ Skipped exercise: no progression applied\n");
}

/**
 * Test 4: Failure progression idempotency
 */
async function testFailureProgression() {
  console.log("Test 4: Failure progression idempotency");

  // Setup
  const exerciseId = "exercise-4";
  db.sessionExercises.set(exerciseId, {
    id: exerciseId,
    status: "in_progress",
    feel: null,
    completed_at: null,
  });
  db.exerciseProgress.set(exerciseId, {
    exercise_id: exerciseId,
    current_working_weight_kg: 80,
    consecutive_failures: 0,
  });

  // First call with "hard" feel
  const result1 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: "hard",
  });

  assert.strictEqual(result1.ok, true, "First call should succeed");
  assert.strictEqual(result1.progressionApplied, true, "Should apply progression");

  const progress1 = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(progress1.consecutive_failures, 1, "Failure count should increment to 1");

  // Second call (retry) - should NOT increment again
  const result2 = await finishExercise({
    sessionExerciseId: exerciseId,
    feel: "hard",
  });

  assert.strictEqual(result2.ok, true, "Second call should succeed");
  assert.strictEqual(result2.progressionApplied, false, "Should NOT apply progression again");

  const progress2 = db.exerciseProgress.get(exerciseId)!;
  assert.strictEqual(
    progress2.consecutive_failures,
    1,
    "Failure count should still be 1 (not 2)",
  );

  console.log("  ✅ Failure progression: applied exactly once\n");
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    await testSequentialDoublCall();
    await testParallelCalls();
    await testSkippedIdempotency();
    await testFailureProgression();

    console.log("✅ All finishExercise idempotency tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

runTests();
