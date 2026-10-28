#!/usr/bin/env npx tsx
/**
 * Test seed consistency between Today page and start-session paths.
 * Item 1: Verify that Today SSR (applyDayCleanup) and start-session
 * (applyBannedCleanup) choose identical replacements for the same exercise.
 * 
 * Both paths must use real program_day_exercises.id for deterministic
 * tie-breaking in buildEligibleSwapList hash("${sessionExerciseId}:${slug}").
 */

import { readFileSync } from "fs";
import { applyDayCleanup } from "../src/app/today/page";
import { applyBannedCleanup } from "../src/lib/program/apply-banned-cleanup";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const smithPistol = catalogue.find(e => e.slug === "smith-machine-pistol-squat");
if (!smithPistol) {
  console.error("✗ FAIL: smith-machine-pistol-squat not found in catalogue");
  process.exit(1);
}

const profile = {
  goal: "muscle_gain" as const,
  level: "beginner" as const,
  primary_track: "weights" as const,
  days_per_week: 4,
  yoga_days_per_week: 0,
  has_all_equipment: true,
};

const injuries = [{ body_region: "knee" as const, severity: "current" as const }];
const userId = "test-user";
const allEquipment = catalogue.flatMap(e => e.equipment_ids);

console.log("Testing Today vs start-session seed consistency\n");

// Simulate real program_day_exercises with real ids
const realPdeId = "pde-real-id-123";

// Today path: uses applyDayCleanup from page.tsx
const todayDay = {
  id: "day-1",
  day_index: 1,
  day_type: "weights" as const,
  focus: null,
  label: null,
  program_day_exercises: [{
    id: realPdeId,
    exercise_id: smithPistol.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: {
      name: "Smith Machine Pistol Squat",
      cue: null,
      movement_pattern: "squat",
      metric: "reps",
    },
  }],
};

const generatorInput = {
  userId,
  blockNumber: 1,
  goal: profile.goal,
  level: profile.level,
  primaryTrack: profile.primary_track,
  daysPerWeek: profile.days_per_week,
  yogaDaysPerWeek: profile.yoga_days_per_week,
  age: 30,
  bmi: 23,
  hasAllEquipment: profile.has_all_equipment,
  equipmentIds: allEquipment,
  currentInjuryRegions: ["knee" as const],
  anyKneeInjury: true,
  catalogue,
};

const todayCleanupResults: Array<{ changed: boolean }> = [];
const todayResult = applyDayCleanup(todayDay, catalogue, generatorInput, todayCleanupResults);

// Start-session path: uses applyBannedCleanup
const startPlanned = [{
  id: realPdeId,
  exercise_id: smithPistol.id,
  order_index: 0,
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 12,
  rest_seconds: 90,
}];

const startResult = applyBannedCleanup(
  startPlanned,
  catalogue,
  profile,
  injuries,
  userId,
  allEquipment
);

if (todayResult.program_day_exercises.length === 0) {
  console.error("✗ FAIL: Today path returned no exercises");
  process.exit(1);
}

if (!startResult.changed) {
  console.error("✗ FAIL: Start path did not replace exercise");
  process.exit(1);
}

const todayReplacement = todayResult.program_day_exercises[0].exercise_id;
const startReplacement = startResult.rows[0].exercise_id;

if (todayReplacement !== startReplacement) {
  console.error("✗ FAIL: Today and start-session chose different replacements");
  console.error(`  Today:  ${todayReplacement}`);
  console.error(`  Start:  ${startReplacement}`);
  console.error(`  Original PDE id: ${realPdeId}`);
  console.error("\n  This indicates different seed values for tie-breaking.");
  console.error("  Both paths must use real program_day_exercises.id.");
  process.exit(1);
}

const replacementExercise = catalogue.find(e => e.id === todayReplacement);

console.log("✓ PASS: Today and start-session chose identical replacement");
console.log(`  Banned:      ${smithPistol.slug} (${smithPistol.id})`);
console.log(`  Replacement: ${replacementExercise?.slug || 'unknown'} (${todayReplacement})`);
console.log(`  PDE id used: ${realPdeId}`);
