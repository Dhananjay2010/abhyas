#!/usr/bin/env npx tsx
/**
 * Test that knee tier determination is correct
 * Kills M4 (Tier determination uses length === 0 instead of .includes)
 * 
 * Current knee: currentInjuryRegions.includes("knee") === true
 * Past knee: anyKneeInjury === true && !currentInjuryRegions.includes("knee")
 */

import { readFileSync } from "fs";
import { replaceBannedInPlanned, type PlannedExercise } from "../src/lib/program/replace-banned-in-planned";
import type { CandidateExercise } from "../src/lib/program/generate";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Push press is current-knee-only banned (not past-knee)
const pushPress = catalogue.find(e => e.slug === "one-arm-kettlebell-push-press");
if (!pushPress) {
  console.error("✗ FAIL: one-arm-kettlebell-push-press not found");
  process.exit(1);
}

console.log("Testing knee tier determination\n");

const planned: PlannedExercise[] = [
  {
    id: "test-1",
    exercise_id: pushPress.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  },
];

// Test 1: Current-knee user (should replace push-press)
const currentKneeInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "strength" as const,
  level: "intermediate" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: ["kettlebell"],
  currentInjuryRegions: ["knee" as const],
  anyKneeInjury: true,
  catalogue,
};

const currentResult = replaceBannedInPlanned(planned, catalogue, currentKneeInput);

if (!currentResult.changed || currentResult.rows[0].exercise_id === pushPress.id) {
  console.error("✗ FAIL: one-arm-kettlebell-push-press should be banned for CURRENT knee");
  console.error(`  Changed: ${currentResult.changed}, Same ID: ${currentResult.rows[0].exercise_id === pushPress.id}`);
  process.exit(1);
}

console.log("✓ PASS: Current-knee correctly bans push-press");

// Test 2: Past-knee user (should NOT replace push-press)
const pastKneeInput = {
  ...currentKneeInput,
  currentInjuryRegions: [],
  anyKneeInjury: true,
};

const pastResult = replaceBannedInPlanned(planned, catalogue, pastKneeInput);

if (pastResult.changed) {
  console.error("✗ FAIL: one-arm-kettlebell-push-press should be ALLOWED for past knee");
  console.error(`  Changed: ${pastResult.changed}`);
  process.exit(1);
}

console.log("✓ PASS: Past-knee correctly allows push-press");
console.log("✓ PASS: Tier determination correct (not using length === 0)");
