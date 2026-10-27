#!/usr/bin/env npx tsx
/**
 * Test that replaceBannedInPlanned excludes kettlebell-thruster for current-knee users.
 * Consumer paths:
 * - Today page line ~189 (in-memory cleanup)
 * - ensure-session-exercises line ~81 (via applyBannedCleanup)
 * - cleanBannedExercises action line ~50 (via cleanBannedPlannedExercises)
 */

import { readFileSync } from "fs";
import { replaceBannedInPlanned, type PlannedExercise } from "../src/lib/program/replace-banned-in-planned";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as ExerciseRow[];

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
if (!thruster) {
  console.error("✗ FAIL: kettlebell-thruster not found in catalogue");
  process.exit(1);
}

// Simulate planned exercises with kettlebell-thruster for current-knee user
const planned: PlannedExercise[] = [
  {
    id: "test-1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "strength",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: ["barbell", "dumbbell", "kettlebell"],
  currentInjuryRegions: ["knee"], // Current knee injury
  anyKneeInjury: true,
  catalogue: catalogue as CandidateExercise[],
};

const result = replaceBannedInPlanned(planned, catalogue as CandidateExercise[], input);

// Check that kettlebell-thruster was replaced
const thrusterKept = result.rows.some(r => r.exercise_id === thruster.id);

if (thrusterKept) {
  console.error("✗ FAIL: kettlebell-thruster not replaced for current-knee user");
  console.error("  Rows:", result.rows);
  process.exit(1);
}

if (result.report.length === 0) {
  console.error("✗ FAIL: No replacements reported");
  process.exit(1);
}

const thrusterReplaced = result.report.some(r => r.from === "kettlebell-thruster");
if (!thrusterReplaced) {
  console.error("✗ FAIL: kettlebell-thruster not in replacement report");
  console.error("  Report:", result.report);
  process.exit(1);
}

console.log("✓ PASS: kettlebell-thruster replaced for current-knee user in replaceBannedInPlanned");
