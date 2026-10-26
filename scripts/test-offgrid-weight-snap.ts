#!/usr/bin/env tsx
/**
 * Test L-4b: Off-grid stored weights must snap to equipment grid before progression step.
 * 
 * If stored weight is 72.35 kg with barbell (2.5 kg grid), snap to 72.5 kg, then step to 75 kg.
 * Without equipment, 72.35 + 5 would round to 75 or 80 (wrong).
 */

import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n🧪 Off-grid weight snapping (L-4b)\n");

async function runTests() {
  console.log("1. Barbell: 72.35 kg → snap 72.5 → step 75 kg");
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

    console.log(`  Stored: ${progress.current_working_weight_kg} kg`);
    console.log(`  Decision: ${decision.outcome}, next ${decision.nextWorkingWeightKg} kg`);
    console.log(`  Message: "${decision.message}"`);

    check("Equipment passed to input", input.equipmentIds?.includes("barbell") ?? false);
    check("Next weight is 75 kg (not 75.35 or 77.35)", decision.nextWorkingWeightKg === 75);
    check("Outcome is progressed", decision.outcome === "progressed");
  }

  console.log("2. Dumbbell: 71.44 kg → snap 72.5 → step 75 kg");
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

    // User actually lifted 72 kg (already snapped by them), but 71.44 kg is stored
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

    console.log(`  Stored: ${progress.current_working_weight_kg} kg`);
    console.log(`  Lifted: 72 kg (already snapped by user)`);
    console.log(`  Decision: ${decision.outcome}, next ${decision.nextWorkingWeightKg} kg`);
    console.log(`  Message: "${decision.message}"`);

    check("Equipment passed to input", input.equipmentIds?.includes("dumbbell") ?? false);
    // Next grid point above 72 kg is 72.5, then +2.5 = 75
    check("Next weight is 75 kg (72 kg + one 2.5 kg step, rounded up)", decision.nextWorkingWeightKg === 75);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    // Kill mutant that drops equipmentIds: throw if missing
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
  }

  console.log("\n3. Barbell imperial: 159.4 lb → snap 160 → step 165 lb");
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

    // User lifted at 160 lb (72.57 kg)
    const sets = [
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
      { reps: 12, weight_kg: "72.57", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "72.3", // Off-grid, ≈159.4 lb
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

    console.log(`  Stored: ${progress.current_working_weight_kg} kg (≈159.4 lb)`);
    console.log(`  Lifted: 72.57 kg (160 lb, already snapped by user)`);
    console.log(`  Decision: ${decision.outcome}, next ${decision.nextWorkingWeightKg} kg`);
    console.log(`  Message: "${decision.message}"`);

    check("Equipment passed to input", input.equipmentIds?.includes("barbell") ?? false);
    // 160 lb = 72.57 kg, next grid point = 75 kg = 165.5 lb, but should show as "165 lb" after rounding
    check("Message contains '165 lb' or '165.5 lb'", decision.message.includes("165"));
    check("Outcome is progressed", decision.outcome === "progressed");
  }

  console.log("\n=== SUMMARY ===");
  if (failures === 0) {
    console.log("✅ ALL PASS");
    console.log("Kills mutant: equipment dropped from progression input");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} failure(s)`);
    process.exit(1);
  }
}

runTests();
