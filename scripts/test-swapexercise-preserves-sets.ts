#!/usr/bin/env tsx
/**
 * Source code validation: swapExercise must preserve planned_sets
 * to maintain deload transformations when swapping exercises.
 */

import { readFileSync } from "fs";
import { join } from "path";

const actionsPath = join(process.cwd(), "src/app/session/actions.ts");
const source = readFileSync(actionsPath, "utf-8");

console.log("Validating swapExercise preserves planned_sets...\n");

// Find the swapExercise function
const swapExerciseMatch = source.match(
  /export async function swapExercise\([^)]*\)[^{]*{([\s\S]*?)^}/m,
);

if (!swapExerciseMatch) {
  throw new Error("Could not find swapExercise function in actions.ts");
}

const swapExerciseBody = swapExerciseMatch[1];

// Find the update statement
const updateMatch = swapExerciseBody.match(
  /\.update\(\s*{([^}]*)}\s*\)/s,
);

if (!updateMatch) {
  throw new Error("Could not find update statement in swapExercise");
}

const updateFields = updateMatch[1];

// Check that planned_sets is NOT in the update (it should be preserved)
if (updateFields.includes("planned_sets")) {
  throw new Error(
    "swapExercise must NOT update planned_sets - it must preserve the deloaded value from the session",
  );
}

// Verify that it DOES update the exercise_id (sanity check)
if (!updateFields.includes("exercise_id")) {
  throw new Error(
    "swapExercise update statement is malformed - expected to update exercise_id",
  );
}

console.log("  ✓  swapExercise does not modify planned_sets");
console.log("  ✓  swapExercise preserves deload set counts");

console.log("\n✅ Source code validation passed");
