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
import { buildRunnerExercise, type RunnerExerciseInput } from "../src/lib/session/build-runner-exercises";

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
  "imports applyProgressionCore and buildApplyProgressionInput",
  actionsContent.includes('import { applyProgressionCore, buildApplyProgressionInput } from "@/lib/session/apply-progression-core"')
);

check(
  "applyProgression queries units from profiles",
  actionsContent.includes('supabase.from("profiles").select("units")') &&
  actionsContent.indexOf('profileRes') !== -1 && actionsContent.indexOf('Promise.all') !== -1
);

check(
  "actions.ts calls buildApplyProgressionInput with profileRes.data?.units",
  actionsContent.includes('buildApplyProgressionInput(') &&
  actionsContent.includes('profileRes.data?.units')
);

check(
  "actions.ts passes ex (not {...ex, equipment_ids: []}) to buildApplyProgressionInput",
  /buildApplyProgressionInput\(\s*se,\s*ex,/.test(actionsContent)
);

check(
  "actions.ts calls applyProgressionCore",
  actionsContent.includes('await applyProgressionCore(supabase, userId, input)')
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


// Behavioral wiring tests (async)
import { applyProgressionCore, buildApplyProgressionInput, type ApplyProgressionInput } from "../src/lib/session/apply-progression-core";
import type { ProgressClient, ProgressWrite } from "../src/lib/session/write-progress";

// Type narrowing helpers
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

class TestProgressClient implements ProgressClient {
  private lastWrite: ProgressWrite | null = null;

  from(table: string) {
    if (table !== "exercise_progress") throw new Error(`Unexpected table: ${table}`);
    return {
      upsert: async (data: Record<string, unknown>) => {
        const row: ProgressWrite = {
          user_id: String(data.user_id),
          exercise_id: String(data.exercise_id),
          current_working_weight_kg: numOrNull(data.current_working_weight_kg),
          current_target_reps: numOrNull(data.current_target_reps),
          consecutive_failures: Number(data.consecutive_failures),
          last_performed_on: strOrNull(data.last_performed_on),
          best_weight_kg: numOrNull(data.best_weight_kg),
          best_reps: numOrNull(data.best_reps),
          best_e1rm: numOrNull(data.best_e1rm),
          total_sessions: Number(data.total_sessions),
          updated_at: String(data.updated_at),
        };
        this.lastWrite = row;
        return { data: row, error: null };
      },
    };
  }

  getLastWrite(): ProgressWrite | null {
    return this.lastWrite;
  }
}

async function runBehavioralTests() {
  const testClient = new TestProgressClient();

  const progressionInput: ApplyProgressionInput = {
    sessionExercise: {
      id: "se_test",
      exercise_id: "ex_test",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
    },
    exercise: {
      mechanic: "compound",
      movement_pattern: "other",
      equipment_ids: ["machine_generic"],
      progression_chain: null,
      progression_rank: null,
    },
    session: {
      is_deload: false,
      local_date: "2026-10-25",
    },
    sets: [
      { reps: 12, weight_kg: 40, duration_seconds: null },
      { reps: 12, weight_kg: 40, duration_seconds: null },
      { reps: 12, weight_kg: 40, duration_seconds: null },
    ],
    progress: {
      current_working_weight_kg: 40,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 40,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
    },
    userUnits: "metric",
    feel: "right",
  };

  // Test 1: machine_generic with metric
  const decision1 = await applyProgressionCore(testClient, "user_test", progressionInput);
  check(
    "machine_generic 40 kg → 45 kg (not 41.25)",
    decision1.nextWorkingWeightKg === 45,
    `got ${decision1.nextWorkingWeightKg}`
  );

  // Test 2: metric - must see " kg" in message
  check(
    "metric: message contains ' kg' (not ' lb')",
    decision1.message.includes(" kg") && !decision1.message.includes(" lb"),
    `got: ${decision1.message}`
  );

  // Test 3: imperial - must see " lb" in message (dumbbell 7.5 kg → next)
  const imperialInput: ApplyProgressionInput = {
    sessionExercise: {
      id: "se_imperial",
      exercise_id: "ex_imperial",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
    },
    exercise: {
      mechanic: "isolation",
      movement_pattern: "other",
      equipment_ids: ["dumbbell"],
      progression_chain: null,
      progression_rank: null,
    },
    session: {
      is_deload: false,
      local_date: "2026-10-25",
    },
    sets: [
      { reps: 12, weight_kg: 7.5, duration_seconds: null },
      { reps: 12, weight_kg: 7.5, duration_seconds: null },
      { reps: 12, weight_kg: 7.5, duration_seconds: null },
    ],
    progress: {
      current_working_weight_kg: 7.5,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: 7.5,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
    },
    userUnits: "imperial",
    feel: "right",
  };

  const decision2 = await applyProgressionCore(testClient, "user_test2", imperialInput);
  check(
    "imperial: message contains ' lb' (not ' kg')",
    decision2.message.includes(" lb") && !decision2.message.includes(" kg"),
    `got: ${decision2.message}`
  );

  // Test 4: buildApplyProgressionInput preserves equipment and units
  const exerciseData = {
    mechanic: "compound" as const,
    movement_pattern: "other" as const,
    equipment_ids: ["machine_generic"],
    progression_chain: null,
    progression_rank: null,
  };

  const builtInput = buildApplyProgressionInput(
    { id: "se1", exercise_id: "ex1", planned_sets: 3, planned_reps_min: 8, planned_reps_max: 12, metric: "reps" },
    exerciseData,
    { is_deload: false, local_date: "2026-10-25" },
    [],
    null,
    "metric",
    null
  );

  check(
    "buildApplyProgressionInput: preserves equipment_ids",
    JSON.stringify(builtInput.exercise.equipment_ids) === '["machine_generic"]',
    `got ${JSON.stringify(builtInput.exercise.equipment_ids)}`
  );

  check(
    "buildApplyProgressionInput: preserves userUnits",
    builtInput.userUnits === "metric",
    `got ${builtInput.userUnits}`
  );

  // Test 5: buildRunnerExercise deload - equipment grid snapping
  // 70% of 52 = 36.4, which snaps to 35 on 5kg grid (machine_generic)
  const deloadInput: RunnerExerciseInput = {
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
    userUnits: "kg",
  };
  
  const deloadRunner = buildRunnerExercise(deloadInput);
  
  check(
    "buildRunnerExercise deload: machine_generic 52kg → 35kg (5kg grid, not 36.25 on 2.5kg grid)",
    deloadRunner.suggestedWeightKg === 35,
    `got ${deloadRunner.suggestedWeightKg}`
  );
}

// Run async tests and exit
runBehavioralTests().then(() => {
  console.log("\n=== SUMMARY ===");
  if (failures > 0) {
    console.log(`FAILED: ${failures} checks`);
    process.exit(1);
  } else {
    console.log("✅ ALL CHECKS PASSED");
    process.exit(0);
  }
}).catch((err: Error) => {
  console.error("Test error:", err);
  process.exit(1);
});
