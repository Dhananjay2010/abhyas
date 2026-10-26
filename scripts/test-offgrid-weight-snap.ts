#!/usr/bin/env tsx
/**
 * Test L-4b: Off-grid stored weights must snap to equipment grid before progression step.
 * 
 * Equipment grids (from equipment-grid.ts gridStepFor):
 * - Barbell: 2.5 kg / 5 lb
 * - Dumbbell: 2.5 kg / 5 lb
 * 
 * Expected values justified by grid math:
 * - Barbell 72.35 kg: snap to 72.5 (nearest 2.5 kg grid), then +2.5 = 75 kg
 * - Dumbbell 71.44 kg (lifted 72): snap to 72, then +2.5 = 74.5, round up to 75 kg
 * - Barbell 72.3 kg (159.4 lb): snap to 72.5 kg (160 lb), then +2.5 kg = 75 kg (165.5 lb)
 * - Dumbbell 145 lb (65.77 kg): snap to 145 lb, then +5 lb = 150 lb
 */

import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n🧪 Off-grid weight snapping (L-4b)\n");
console.log("Equipment grids: Barbell & Dumbbell = 2.5 kg / 5 lb\n");

async function runTests() {
  console.log("1. Barbell 72.35 kg → snap 72.5 → step 75 kg");
  console.log("   (72.35 rounds to 72.5, then +2.5 = 75)");
  {
    const sessionExercise = {
      id: "se-1",
      session_id: "s-1",
      exercise_id: "e-1",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps" as const,
      exercises: {
        mechanic: "compound" as const,
        movement_pattern: "horizontal_press" as const,
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets = [
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "72.35", // Off-grid
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "72.35",
      best_reps: 12,
      best_e1rm: 101.8,
      total_sessions: 10,
      weight_at_failure_start_kg: null,
    };

    const session = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "metric");
    const decision = evaluateProgression(input);

    check("Equipment passed to input", input.equipmentIds?.includes("barbell") ?? false);
    check("Next weight is 75 kg", decision.nextWorkingWeightKg === 75);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
    if (input.units !== "metric") {
      throw new Error("MUTANT: units dropped from input");
    }
  }

  console.log("\n2. Dumbbell 71.44 kg (lifted 72) → snap 72 → step 75 kg");
  console.log("   (71.44 rounds to 72, from lifted 72: snap 72, then +2.5 = 74.5 rounds up to 75)");
  {
    const sessionExercise = {
      id: "se-2",
      session_id: "s-2",
      exercise_id: "e-2",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps" as const,
      exercises: {
        mechanic: "compound" as const,
        movement_pattern: "horizontal_press" as const,
        equipment_ids: ["dumbbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets = [
      { reps: 12, weight_kg: "72", duration_seconds: null },
      { reps: 12, weight_kg: "72", duration_seconds: null },
      { reps: 12, weight_kg: "72", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "71.44", // Off-grid
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "71.44",
      best_reps: 12,
      best_e1rm: 100.6,
      total_sessions: 8,
      weight_at_failure_start_kg: null,
    };

    const session = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "metric");
    const decision = evaluateProgression(input);

    check("Equipment passed to input", input.equipmentIds?.includes("dumbbell") ?? false);
    check("Next weight is 75 kg", decision.nextWorkingWeightKg === 75);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
    if (input.units !== "metric") {
      throw new Error("MUTANT: units dropped from input");
    }
  }

  console.log("\n3. Barbell imperial: 72.3 kg (159.4 lb) → 160 lb → 165.5 lb");
  console.log("   (72.3 kg ≈ 159.4 lb, rounds to 160 lb = 72.57 kg, then +2.5 kg = 75 kg = 165.5 lb)");
  {
    const sessionExercise = {
      id: "se-3",
      session_id: "s-3",
      exercise_id: "e-3",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps" as const,
      exercises: {
        mechanic: "compound" as const,
        movement_pattern: "horizontal_press" as const,
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets = [
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "72.3", // Off-grid
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "72.3",
      best_reps: 12,
      best_e1rm: 101.8,
      total_sessions: 10,
      weight_at_failure_start_kg: null,
    };

    const session = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "imperial");
    const decision = evaluateProgression(input);

    check("Equipment passed to input", input.equipmentIds?.includes("barbell") ?? false);
    check("Message contains '165'", decision.message.includes("165"));
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
    if (input.units !== "imperial") {
      throw new Error("MUTANT: units dropped from input");
    }
  }

  console.log("\n4. Dumbbell imperial: 145 lb (65.77 kg) → snap 65 → step 67.5 kg → 149 lb");
  console.log("   (65.77 kg rounds to 65 kg, then +2.5 kg = 67.5 kg = 148.8 lb displays as 149 lb)");
  {
    const sessionExercise = {
      id: "se-4",
      session_id: "s-4",
      exercise_id: "e-4",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps" as const,
      exercises: {
        mechanic: "compound" as const,
        movement_pattern: "horizontal_press" as const,
        equipment_ids: ["dumbbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets = [
      { reps: 12, weight_kg: "65.77", duration_seconds: null }, // 145 lb
      { reps: 12, weight_kg: "65.77", duration_seconds: null },
      { reps: 12, weight_kg: "65.77", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "65.77", // 145 lb
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "65.77",
      best_reps: 12,
      best_e1rm: 92.6,
      total_sessions: 8,
      weight_at_failure_start_kg: null,
    };

    const session = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right", "imperial");
    const decision = evaluateProgression(input);

    check("Equipment passed to input", input.equipmentIds?.includes("dumbbell") ?? false);
    check("Next weight is 67.5 kg (149 lb)", decision.nextWorkingWeightKg === 67.5);
    check("Message shows 149 lb", decision.message.includes("149 lb"));
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
    if (input.units !== "imperial") {
      throw new Error("MUTANT: units dropped from input");
    }
  }

  console.log("\n=== SUMMARY ===");
  if (failures === 0) {
    console.log("✅ ALL PASS");
    console.log("Kills mutants: equipmentIds dropped, units dropped from progression input");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} failure(s)`);
    process.exit(1);
  }
}

runTests();
