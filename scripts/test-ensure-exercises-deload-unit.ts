#!/usr/bin/env tsx
/**
 * Unit test: ensureSessionExercises must apply deload when is_deload=true
 */

import { buildSessionExerciseRows } from "../src/lib/session/build-session-exercises.js";

console.log("Testing buildSessionExerciseRows with deload context...\n");

const planned = [
  {
    exercise_id: "ex1",
    order_index: 0,
    target_sets: 5,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 120,
    exercises: { metric: "reps" },
  },
  {
    exercise_id: "ex2",
    order_index: 1,
    target_sets: 4,
    target_reps_min: 10,
    target_reps_max: 15,
    rest_seconds: 90,
    exercises: { metric: "reps" },
  },
];

// Test deload=true reduces sets
const deloaded = buildSessionExerciseRows(planned, { isDeload: true });

if (deloaded[0].planned_sets !== 3) {
  throw new Error(
    `Expected ex1 to have 3 sets with deload, got ${deloaded[0].planned_sets}`,
  );
}

if (deloaded[1].planned_sets !== 2) {
  throw new Error(
    `Expected ex2 to have 2 sets with deload, got ${deloaded[1].planned_sets}`,
  );
}

// Test deload=false keeps original sets
const normal = buildSessionExerciseRows(planned, { isDeload: false });

if (normal[0].planned_sets !== 5) {
  throw new Error(
    `Expected ex1 to have 5 sets without deload, got ${normal[0].planned_sets}`,
  );
}

if (normal[1].planned_sets !== 4) {
  throw new Error(
    `Expected ex2 to have 4 sets without deload, got ${normal[1].planned_sets}`,
  );
}

console.log("✅ All buildSessionExerciseRows deload tests passed");
