#!/usr/bin/env tsx
/**
 * Test: Call-site wiring is correct
 * 
 * Verifies that actions.ts and page.tsx actually wire the helper output
 * to the progression functions. This kills the call-site mutants:
 * - M4: missing helper spread in buildProgressionInput
 * 
 * Also tests the helper's behavior directly.
 */

import * as fs from "fs";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs";
import { buildRunnerExercise, type RunnerExerciseInput } from "../src/lib/session/build-runner-exercises";
import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

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
const feedbackContent = fs.readFileSync("src/lib/session/progression-feedback.ts", "utf8");

check(
  "actions.ts imports buildProgressionFeedbackForUser",
  actionsContent.includes('import { buildProgressionFeedbackForUser } from "@/lib/session/progression-feedback"') ||
  actionsContent.includes('import { progressionFeedback, buildProgressionFeedbackForUser } from "@/lib/session/progression-feedback"') &&
  feedbackContent.includes('import { buildProgressionInput } from "./build-progression-input"')
);

check(
  "actions.ts calls buildProgressionFeedbackForUser (units loaded internally)",
  actionsContent.includes('buildProgressionFeedbackForUser(supabase, userId, sessionExerciseId, feel)'),
  "buildProgressionFeedbackForUser calls getProfileUnits internally"
);

check(
  "progression-feedback.ts passes units to buildProgressionInput",
  feedbackContent.includes('units,') || feedbackContent.includes('units)'),
  "units parameter passed"
);

// U1: Static assertion that applyProgression is passed to finishExerciseCore
check(
  "actions.ts passes applyProgression to finishExerciseCore (U1)",
  (actionsContent.includes('finishExerciseCore(supabase, user.id, input, { applyProgression })') ||
   actionsContent.includes('makeFinishExerciseDeps(supabase, applyProgression)')) &&
  actionsContent.includes('async function applyProgression('),
  "U1: finishExerciseCore must receive applyProgression"
);

console.log("\n2. Check page.tsx wiring");
const pageContent = fs.readFileSync("src/app/session/[id]/page.tsx", "utf8");

check(
  "queries mechanic from exercises",
  pageContent.includes('mechanic') && pageContent.includes('equipment_ids') && pageContent.includes('exercises!'),
  "mechanic in exercises select"
);

check(
  "queries units from profiles (coordinator units rule)",
  pageContent.includes('profileRes.data?.units'),
  "units passed per coordinator rule"
);

check(
  "does NOT pass units to buildRunnerExercise",
  !pageContent.includes('userUnits:'),
  "userUnits parameter removed per M2"
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

console.log("\n4. Helper behavior tests");

// With equipment (M2: no unit parameter)
const withEquip = progressionInputsFromExercise({ equipment_ids: ["barbell", "cable"] });
check("returns equipmentIds when equipment present", withEquip.equipmentIds !== undefined);
check("equipmentIds is the array", JSON.stringify(withEquip.equipmentIds) === '["barbell","cable"]');
check("unit is NOT returned (M2: removed)", !("unit" in withEquip));

// No equipment
const noEquip = progressionInputsFromExercise({ equipment_ids: [] });
check("returns empty object for empty array", Object.keys(noEquip).length === 0);
check("equipmentIds undefined for no equipment", noEquip.equipmentIds === undefined);

// Test backward compatibility: old code path
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
  totalSessions: 3, weightAtFailureStartKg: null,
};

const sets = Array.from({ length: 4 }, () => ({ reps: 5, weightKg: 40, durationSeconds: null }));

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

// New call: spread empty helper result (M2: no unit)
const helperResult = progressionInputsFromExercise({ equipment_ids: [] });
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

console.log("\n5. Real buildProgressionInput + evaluateProgression tests");

// Test that the real call path works with equipment (M2: no units)
const realInput1 = buildProgressionInput(
  {
    id: "se_test",
    session_id: "sess_test",
    exercise_id: "ex_test",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "compound",
      movement_pattern: "other",
      equipment_ids: ["machine_generic"],
      progression_chain: null,
      progression_rank: null,
    },
  },
  [
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
  ],
  {
    current_working_weight_kg: 40,
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: 40,
    best_reps: 12,
    best_e1rm: null,
    total_sessions: 3,
    weight_at_failure_start_kg: null,
  },
  {
    is_deload: false,
    local_date: "2026-10-25",
    program_id: null,
  },
  "right",
);

const decision1 = evaluateProgression(realInput1);
check(
  "machine_generic 40 kg → 45 kg (not 42.5)",
  decision1.nextWorkingWeightKg === 45,
  `got ${decision1.nextWorkingWeightKg}`
);

check(
  "M2: message contains ' kg' (not ' lb')",
  decision1.message.includes(" kg") && !decision1.message.includes(" lb"),
  `got: ${decision1.message}`
);

// M2: No imperial - test that kg is used consistently
const realInput2 = buildProgressionInput(
  {
    id: "se_test2",
    session_id: "sess_test2",
    exercise_id: "ex_test2",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "isolation",
      movement_pattern: "other",
      equipment_ids: ["dumbbell"],
      progression_chain: null,
      progression_rank: null,
    },
  },
  [
    { reps: 12, weight_kg: 7.5, duration_seconds: null },
    { reps: 12, weight_kg: 7.5, duration_seconds: null },
    { reps: 12, weight_kg: 7.5, duration_seconds: null },
  ],
  {
    current_working_weight_kg: 7.5,
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: 7.5,
    best_reps: 12,
    best_e1rm: null,
    total_sessions: 3,
    weight_at_failure_start_kg: null,
  },
  {
    is_deload: false,
    local_date: "2026-10-25",
    program_id: null,
  },
  "right",
);

const decision2 = evaluateProgression(realInput2);
check(
  "M2: dumbbell message contains ' kg' (not ' lb')",
  decision2.message.includes(" kg") && !decision2.message.includes(" lb"),
  `got: ${decision2.message}`
);

// Test deload
const deloadInput = buildProgressionInput(
  {
    id: "se_deload",
    session_id: "sess_deload",
    exercise_id: "ex_deload",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "compound",
      movement_pattern: "other",
      equipment_ids: ["machine_generic"],
      progression_chain: null,
      progression_rank: null,
    },
  },
  [
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
    { reps: 12, weight_kg: 40, duration_seconds: null },
  ],
  {
    current_working_weight_kg: 40,
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: 40,
    best_reps: 12,
    best_e1rm: null,
    total_sessions: 3,
    weight_at_failure_start_kg: null,
  },
  {
    is_deload: true,
    local_date: "2026-10-25",
    program_id: null,
  },
  "right",
);

const deloadDecision = evaluateProgression(deloadInput);
check(
  "deload session: deload_week outcome (not progressed)",
  deloadDecision.outcome === "deload_week",
  `got ${deloadDecision.outcome}`
);

// Test buildRunnerExercise deload - equipment grid snapping
// 70% of 52 = 36.4, which snaps to 35 on 5kg grid (machine_generic)
const deloadRunnerInput: RunnerExerciseInput = {
  row: {
    id: "se_test_deload",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    rest_seconds: 90,
    status: "pending",
    feel: null,
    exercises: {
      id: "ex_test",
      name: "Test Exercise",
      cue: null,
      mechanic: "compound",
      movement_pattern: "other",
      primary_muscles: ["chest"],
      equipment_ids: ["machine_generic"],
    },
    session_sets: [],
  },
  progress: {
    current_working_weight_kg: 52,
    current_target_reps: 12,
  },
  remembersWeights: true,
  isDeload: true,
};

const deloadRunner = buildRunnerExercise(deloadRunnerInput);

check(
  "buildRunnerExercise deload: machine_generic 52kg → 35kg (5kg grid, not 36.25 on 2.5kg grid)",
  deloadRunner.suggestedWeightKg === 35,
  `got ${deloadRunner.suggestedWeightKg}`
);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED");
  process.exit(0);
}
