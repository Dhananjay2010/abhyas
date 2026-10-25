#!/usr/bin/env tsx
/**
 * Test: Call-site wiring is correct
 * 
 * Verifies that actions.ts and page.tsx actually wire the helper output
 * to the progression functions. This kills the call-site mutants:
 * - M4: missing helper spread in actions.ts
 * - M5': missing progInputs args in page.tsx
 * - M5'': mechanic hardcoded to null in page.tsx
 * 
 * Also tests the helper's behavior directly.
 */

import * as fs from "fs";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

console.log("1. Check actions.ts wiring");
const actionsContent = fs.readFileSync("src/app/session/actions.ts", "utf8");

check(
  "imports progressionInputsFromExercise",
  actionsContent.includes('import { progressionInputsFromExercise } from "@/lib/session/progression-inputs"')
);

check(
  "applyProgression queries units from profiles",
  actionsContent.includes('supabase.from("profiles").select("units")') &&
  actionsContent.indexOf('profileRes') !== -1 && actionsContent.indexOf('Promise.all') !== -1
);

check(
  "evaluateProgression spreads helper result",
  actionsContent.includes('...progressionInputsFromExercise(ex, profileRes.data?.units)')
);

console.log("\n2. Check page.tsx wiring");
const pageContent = fs.readFileSync("src/app/session/[id]/page.tsx", "utf8");

check(
  "queries mechanic from exercises",
  pageContent.includes('mechanic') && pageContent.includes('equipment_ids') && pageContent.includes('exercises!'),
  "mechanic in exercises select"
);

check(
  "queries units from profiles",
  pageContent.includes('profiles') && pageContent.includes('select') && pageContent.includes('units'),
  "units in profiles select"
);

check(
  "passes profileRes.data?.units to buildRunnerExercise",
  pageContent.includes('userUnits: profileRes.data?.units')
);

check(
  "mechanic queried from exercises (not hardcoded to null)",
  /exercises![^(]*\([^)]*\bmechanic\b[^)]*\)/.test(pageContent)
);

console.log("\n3. Check buildRunnerExercise wiring");
const builderContent = fs.readFileSync("src/lib/session/build-runner-exercises.ts", "utf8");

check(
  "imports progressionInputsFromExercise",
  builderContent.includes('import { progressionInputsFromExercise } from "./progression-inputs"')
);

check(
  "calls progressionInputsFromExercise",
  builderContent.includes('progressionInputsFromExercise(')
);

check(
  "passes mechanic: ex?.mechanic ?? null",
  builderContent.includes('mechanic: ex?.mechanic ?? null'),
  "not hardcoded to null"
);

check(
  "passes progInputs.equipmentIds to suggestedWeight",
  builderContent.includes('progInputs.equipmentIds,')
);

check(
  "passes progInputs.unit to suggestedWeight",
  builderContent.includes('progInputs.unit,')
);

console.log("\n4. Helper behavior tests");

// With equipment
const withEquip = progressionInputsFromExercise({ equipment_ids: ["barbell", "cable"] }, "metric");
check("returns equipmentIds when equipment present", withEquip.equipmentIds !== undefined);
check("equipmentIds is the array", JSON.stringify(withEquip.equipmentIds) === '["barbell","cable"]');
check("unit is kg for metric", withEquip.unit === "kg");

const withEquipImperial = progressionInputsFromExercise({ equipment_ids: ["dumbbell"] }, "imperial");
check("unit is lb for imperial", withEquipImperial.unit === "lb");

// No equipment
const noEquip = progressionInputsFromExercise({ equipment_ids: [] }, "metric");
check("returns empty object for empty array", Object.keys(noEquip).length === 0);
check("equipmentIds undefined for no equipment", noEquip.equipmentIds === undefined);
check("unit undefined for no equipment", noEquip.unit === undefined);

// Test backward compatibility: old code path
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

const META: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const fresh = {
  currentWorkingWeightKg: 40,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 40,
  bestReps: 12,
  bestE1rm: 56,
  totalSessions: 3,
};

const sets = Array.from({ length: 4 }, () => ({ reps: 5, weightKg: 40 }));

// Old call: no equipment params
const oldResult = evaluateProgression({
  sets,
  plannedSets: 4,
  repsMin: 6,
  repsMax: 8,
  feel: "right",
  meta: META,
  state: fresh,
  isDeload: false,
});

// New call: spread empty helper result
const helperResult = progressionInputsFromExercise({ equipment_ids: [] }, "metric");
const newResult = evaluateProgression({
  sets,
  plannedSets: 4,
  repsMin: 6,
  repsMax: 8,
  feel: "right",
  meta: META,
  state: fresh,
  isDeload: false,
  ...helperResult,
});

check(
  "no-equipment result equals old behavior",
  oldResult.nextWorkingWeightKg === newResult.nextWorkingWeightKg &&
  oldResult.outcome === newResult.outcome
);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED");
  process.exit(0);
}
