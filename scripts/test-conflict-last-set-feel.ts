#!/usr/bin/env tsx
/**
 * Test: conflict on an exercise's last set stays on that exercise for feel prompt.
 * 
 * L1 (QA Bot 1, PR #79): when two tabs race on an exercise's LAST set,
 * resolveSetConflict jumps to the next exercise and skips the feel prompt,
 * so the exercise stays pending, the summary says "5 of 6", and no progression
 * is saved.
 * 
 * Fix: when the conflict result shows all sets done, stay on the current exercise
 * to show the feel prompt.
 * 
 * This test fails when the fix is reverted: the conflict jumps to the next exercise.
 */
import { resolveSetConflict, type ConflictResult, type ExerciseForConflict } from "../src/lib/session/conflict-reducer";

export {};

type Exercise = ExerciseForConflict;

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

const EXERCISE_1: Exercise = {
  id: "ex1",
  sets: [
    { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
    { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
    { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
  ],
  plannedSets: 4,
  status: "pending",
};

const EXERCISE_2: Exercise = {
  id: "ex2",
  sets: [],
  plannedSets: 3,
  status: "pending",
};

const CONFLICT_RESULT: ConflictResult = {
  ok: false,
  reason: "set_exists",
  savedSets: [
    { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
    { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
    { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
    { setNumber: 4, reps: 10, weightKg: 60, durationSeconds: null },
  ],
};

async function main() {
  console.log("Testing conflict resolution on last set\n");

await test("L1: conflict on last set stays on current exercise for feel prompt", () => {
  const exercises: Exercise[] = [EXERCISE_1, EXERCISE_2];
  const currentExerciseIndex = 0;
  const currentExerciseId = "ex1";

  const resolution = resolveSetConflict(
    exercises,
    currentExerciseId,
    currentExerciseIndex,
    CONFLICT_RESULT
  );

  // The current exercise now has 4 sets (all planned sets done)
  if (resolution.exercises[0].sets.length !== 4) {
    throw new Error(`Expected 4 sets, got ${resolution.exercises[0].sets.length}`);
  }

  // Must stay on exercise 0 to show the feel prompt
  if (resolution.nextExerciseIndex !== 0) {
    throw new Error(`Expected index 0, got ${resolution.nextExerciseIndex}`);
  }

  // User sees the conflict message
  if (!resolution.message.includes("That set was already saved")) {
    throw new Error(`Expected conflict message, got: ${resolution.message}`);
  }
});

await test("L1: conflict NOT on last set stays on current when it's unfinished", () => {
  const exercises: Exercise[] = [
    {
      id: "ex1",
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
      ],
      plannedSets: 4,
      status: "pending",
    },
    EXERCISE_2,
  ];
  const currentExerciseIndex = 0;
  const currentExerciseId = "ex1";

  const conflictResult: ConflictResult = {
    ok: false,
    reason: "set_exists",
    savedSets: [
      { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
    ],
  };

  const resolution = resolveSetConflict(
    exercises,
    currentExerciseId,
    currentExerciseIndex,
    conflictResult
  );

  // Exercise 1 now has 2 sets (not yet complete)
  if (resolution.exercises[0].sets.length !== 2) {
    throw new Error(`Expected 2 sets, got ${resolution.exercises[0].sets.length}`);
  }

  // Stays on exercise 0 because it's not complete
  if (resolution.nextExerciseIndex !== 0) {
    throw new Error(`Expected index 0, got ${resolution.nextExerciseIndex}`);
  }
});

await test("L1: multiple exercises, conflict on last set of first exercise", () => {
  const exercises: Exercise[] = [
    {
      id: "ex1",
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
      ],
      plannedSets: 4,
      status: "pending",
    },
    {
      id: "ex2",
      sets: [],
      plannedSets: 3,
      status: "pending",
    },
    {
      id: "ex3",
      sets: [],
      plannedSets: 3,
      status: "pending",
    },
  ];

  const conflictResult: ConflictResult = {
    ok: false,
    reason: "set_exists",
    savedSets: [
      { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 4, reps: 10, weightKg: 60, durationSeconds: null },
    ],
  };

  const resolution = resolveSetConflict(exercises, "ex1", 0, conflictResult);

  // Exercise 1 is now complete
  if (resolution.exercises[0].sets.length !== 4) {
    throw new Error(`Expected 4 sets, got ${resolution.exercises[0].sets.length}`);
  }

  // Must stay on exercise 0 for the feel prompt
  if (resolution.nextExerciseIndex !== 0) {
    throw new Error(`Expected index 0, got ${resolution.nextExerciseIndex}`);
  }
});

await test("L1: conflict when current has no remaining work advances to next pending", () => {
  // Scenario: current exercise (index 0) was already completed in another tab.
  // A conflict for exercise 0 confirms all sets exist, but since status is "completed",
  // it doesn't match the "pending" filter in findIndex, so we look for the next pending exercise.
  const exercises: Exercise[] = [
    {
      id: "ex1",
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
      ],
      plannedSets: 3,
      status: "completed",  // Already completed
    },
    {
      id: "ex2",
      sets: [],
      plannedSets: 3,
      status: "pending",  // Still needs work
    },
  ];
  const currentExerciseIndex = 0;
  const currentExerciseId = "ex1";

  const conflictResult: ConflictResult = {
    ok: false,
    reason: "set_exists",
    savedSets: [
      { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null },
      { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null },
    ],
  };

  const resolution = resolveSetConflict(
    exercises,
    currentExerciseId,
    currentExerciseIndex,
    conflictResult
  );

  // Exercise 1 has all 3 sets
  if (resolution.exercises[0].sets.length !== 3) {
    throw new Error(`Expected 3 sets, got ${resolution.exercises[0].sets.length}`);
  }

  // Should advance to exercise 2 (index 1) because exercise 1 is completed (not pending)
  if (resolution.nextExerciseIndex !== 1) {
    throw new Error(`Expected index 1, got ${resolution.nextExerciseIndex}`);
  }
});

  console.log(`\nPassed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
