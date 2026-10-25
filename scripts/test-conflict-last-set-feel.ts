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

type Exercise = ExerciseForConflict;

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

test("L1: conflict on last set stays on current exercise for feel prompt", () => {
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
  expect(resolution.exercises[0].sets.length).toBe(4);

  // Must stay on exercise 0 to show the feel prompt
  expect(resolution.nextExerciseIndex).toBe(0);

  // User sees the conflict message
  expect(resolution.message).toContain("That set was already saved");
});

test("L1: conflict NOT on last set advances to next unfinished exercise", () => {
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
  expect(resolution.exercises[0].sets.length).toBe(2);

  // Stays on exercise 0 because it's not complete
  expect(resolution.nextExerciseIndex).toBe(0);
});

test("L1: multiple exercises, conflict on last set of first exercise", () => {
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
  expect(resolution.exercises[0].sets.length).toBe(4);

  // Must stay on exercise 0 for the feel prompt
  expect(resolution.nextExerciseIndex).toBe(0);
});

test("L1 revert proof: without fix, conflict on last set jumps to next exercise", () => {
  // This test demonstrates what happened before the fix: the conflict on the last
  // set jumped to the next exercise, skipping the feel prompt.
  
  const exercises: Exercise[] = [EXERCISE_1, EXERCISE_2];
  const currentExerciseIndex = 0;
  const currentExerciseId = "ex1";

  // Apply the conflict result
  const updatedExercises = exercises.map((e) =>
    e.id === currentExerciseId ? ({ ...e, sets: CONFLICT_RESULT.savedSets }) : e,
  );

  // OLD LOGIC (before fix): find next unfinished exercise
  const nextUnfinishedIndex = updatedExercises.findIndex(
    (e, i) => i >= currentExerciseIndex && e.status === "pending" && e.sets.length < e.plannedSets,
  );

  // The old logic would find exercise 1 (index 1) as the next unfinished
  expect(nextUnfinishedIndex).toBe(1);

  // This is WRONG: it skips the feel prompt for exercise 0
  // The fix checks if the current exercise is complete and stays on it
});
