#!/usr/bin/env tsx
/**
 * Source code validation: startSession must use buildSessionExerciseRows
 * to apply deload transformations when creating session exercises.
 */

import { readFileSync } from "fs";
import { join } from "path";

const actionsPath = join(process.cwd(), "src/app/session/actions.ts");
const source = readFileSync(actionsPath, "utf-8");

console.log("Validating startSession uses buildSessionExerciseRows...\n");

// Find the startSession function
const startSessionMatch = source.match(
  /export async function startSession\(\)[^{]*{([\s\S]*?)^}/m,
);

if (!startSessionMatch) {
  throw new Error("Could not find startSession function in actions.ts");
}

const startSessionBody = startSessionMatch[1];

// Check that it calls buildSessionExerciseRows
if (!startSessionBody.includes("buildSessionExerciseRows")) {
  throw new Error(
    "startSession must call buildSessionExerciseRows to apply deload transformations",
  );
}

// Check that it passes isDeload context
if (
  !startSessionBody.includes("{ isDeload:") &&
  !startSessionBody.includes("{isDeload:")
) {
  throw new Error(
    "startSession must pass isDeload context to buildSessionExerciseRows",
  );
}

// Check that it doesn't directly map planned.target_sets to planned_sets
// (which would bypass deload)
const directSetMapping = /planned_sets:\s*p\.target_sets/;
if (directSetMapping.test(startSessionBody)) {
  throw new Error(
    "startSession must not directly copy target_sets to planned_sets; use buildSessionExerciseRows instead",
  );
}

console.log("  ✓  startSession calls buildSessionExerciseRows");
console.log("  ✓  startSession passes isDeload context");
console.log("  ✓  startSession does not bypass deload transformation");

console.log("\n✅ Source code validation passed");
