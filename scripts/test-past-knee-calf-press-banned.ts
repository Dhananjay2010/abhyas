#!/usr/bin/env npx tsx
/**
 * Test that calf-press-on-the-leg-press-machine is banned for past-knee users
 * Kills M1 (Past-tier ban dropped)
 */

import { readFileSync } from "fs";
import { replaceBannedInPlanned, type PlannedExercise } from "../src/lib/program/replace-banned-in-planned";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const calfPress = catalogue.find(e => e.slug === "calf-press-on-the-leg-press-machine");
if (!calfPress) {
  console.error("✗ FAIL: calf-press-on-the-leg-press-machine not found");
  process.exit(1);
}

console.log("Testing past-knee calf-press ban\n");

const planned: PlannedExercise[] = [
  {
    id: "test-1",
    exercise_id: calfPress.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 12,
    target_reps_max: 15,
    rest_seconds: 60,
  },
];

// Past-knee user (anyKneeInjury=true, currentInjuryRegions=[])
const pastKneeInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain" as const,
  level: "intermediate" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  catalogue,
};

const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput);

if (!result.changed) {
  console.error("✗ FAIL: calf-press should be replaced for past-knee user");
  process.exit(1);
}

if (result.rows[0].exercise_id === calfPress.id) {
  console.error("✗ FAIL: calf-press-on-the-leg-press-machine not replaced");
  process.exit(1);
}

console.log("✓ PASS: calf-press-on-the-leg-press-machine replaced for past-knee user");
