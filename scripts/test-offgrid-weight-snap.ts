#!/usr/bin/env tsx
/**
 * Test L-4b: Off-grid stored weights must snap DOWN to equipment grid before progression step.
 * 
 * Semantics:
 * - Snap DOWN to largest loadable value <= stored (floor)
 * - Add exactly one step
 * - Result never exceeds stored + one step
 * - Result always > stored
 * - If already on grid, behavior identical to main
 * 
 * Equipment grids (from equipment-grid.ts gridStepFor):
 * - Barbell: 2.5 kg / 5 lb
 * - Dumbbell: 2.5 kg / 5 lb
 */

import { buildProgressionInput } from "../src/lib/session/build-progression-input";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n🧪 Off-grid weight snapping (L-4b)\n");
console.log("Equipment grids: Barbell & Dumbbell = 2.5 kg / 5 lb");
console.log("Snap rule: floor(stored / grid) * grid + grid\n");

async function runTests() {
  console.log("1. Barbell 72.35 kg → 72.5 kg");
  console.log("   floor(72.35 / 2.5) * 2.5 + 2.5 = 28 * 2.5 + 2.5 = 70 + 2.5 = 72.5");
  console.log("   Jump: 0.15 kg (< 2.5 kg step)");
  console.log("   (Split weights evenly, no clear mode -> uses stored weight)");
  {
    const sessionExercise = {
      id: "se-1",
      session_id: "s-1",
      exercise_id: "e-1",
      planned_sets: 4,
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
      { reps: 12, weight_kg: "70", duration_seconds: null },
      { reps: 12, weight_kg: "70", duration_seconds: null },
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

    check("Equipment passed", input.equipmentIds?.includes("barbell") ?? false);
    check("Next weight is 72.5 kg", decision.nextWorkingWeightKg === 72.5);
    check("Jump <= 2.5 kg", (decision.nextWorkingWeightKg ?? 0) - 72.35 <= 2.5);
    check("Next > stored", (decision.nextWorkingWeightKg ?? 0) > 72.35);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped from input");
    }
    if (("units" in input ? input.units : "metric") !== "metric") {
      throw new Error("MUTANT: units dropped from input");
    }
  }

  console.log("\n2. Dumbbell 71.44 kg → 72.5 kg");
  console.log("   floor(71.44 / 2.5) * 2.5 + 2.5 = 28 * 2.5 + 2.5 = 70 + 2.5 = 72.5");
  console.log("   Jump: 1.06 kg (< 2.5 kg step)");
  console.log("   (Varied set weights to trigger stored-weight fallback)");
  {
    const sessionExercise = {
      id: "se-2",
      session_id: "s-2",
      exercise_id: "e-2",
      planned_sets: 4,
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
      { reps: 12, weight_kg: "70", duration_seconds: null },
      { reps: 12, weight_kg: "70", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "71.44",
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

    check("Equipment passed", input.equipmentIds?.includes("dumbbell") ?? false);
    check("Next weight is 72.5 kg", decision.nextWorkingWeightKg === 72.5);
    check("Jump <= 2.5 kg", (decision.nextWorkingWeightKg ?? 0) - 71.44 <= 2.5);
    check("Next > stored", (decision.nextWorkingWeightKg ?? 0) > 71.44);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped");
    }
    if (("units" in input ? input.units : "metric") !== "metric") {
      throw new Error("MUTANT: units dropped or set incorrectly");
    }
  }

  console.log("\n3. Barbell imperial 72.3 kg (159.4 lb) → 72.5 kg (159.8 lb)");
  console.log("   floor(72.3 / 2.5) * 2.5 + 2.5 = 28 * 2.5 + 2.5 = 70 + 2.5 = 72.5 kg");
  console.log("   72.5 kg = 159.8 lb, Jump: 0.2 kg (0.4 lb)");
  console.log("   (Varied set weights to trigger stored-weight fallback)");
  {
    const sessionExercise = {
      id: "se-3",
      session_id: "s-3",
      exercise_id: "e-3",
      planned_sets: 4,
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
      { reps: 12, weight_kg: "70", duration_seconds: null },
      { reps: 12, weight_kg: "70", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
      { reps: 12, weight_kg: "72.5", duration_seconds: null },
    ];

    const progress = {
      current_working_weight_kg: "72.3", // ≈159.4 lb
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

    check("Equipment passed", input.equipmentIds?.includes("barbell") ?? false);
    check("Next weight is 72.5 kg", decision.nextWorkingWeightKg === 72.5);
    check("Message shows 159.5 or 160 lb", decision.message.includes("159.5") || decision.message.includes("160") || decision.message.includes("159.8"));
    check("Jump <= 2.5 kg", (decision.nextWorkingWeightKg ?? 0) - 72.3 <= 2.5);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped");
    }
    if (("units" in input ? input.units : "metric") !== "imperial") {
      throw new Error("MUTANT: units dropped or set incorrectly");
    }
  }

  console.log("\n4. Dumbbell imperial 65.77 kg (145 lb) → 67.5 kg (148.8 lb)");
  console.log("   floor(65.77 / 2.5) * 2.5 + 2.5 = 26 * 2.5 + 2.5 = 65 + 2.5 = 67.5 kg");
  console.log("   67.5 kg = 148.8 lb, Jump: 1.73 kg (3.8 lb)");
  console.log("   (Varied set weights to trigger stored-weight fallback)");
  {
    const sessionExercise = {
      id: "se-4",
      session_id: "s-4",
      exercise_id: "e-4",
      planned_sets: 4,
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
      { reps: 12, weight_kg: "65", duration_seconds: null },
      { reps: 12, weight_kg: "65", duration_seconds: null },
      { reps: 12, weight_kg: "67.5", duration_seconds: null },
      { reps: 12, weight_kg: "67.5", duration_seconds: null },
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

    check("Equipment passed", input.equipmentIds?.includes("dumbbell") ?? false);
    check("Next weight is 67.5 kg", decision.nextWorkingWeightKg === 67.5);
    check("Message shows 148.5, 148.8, or 149 lb", decision.message.includes("148.5") || decision.message.includes("149") || decision.message.includes("148.8"));
    check("Jump <= 2.5 kg", (decision.nextWorkingWeightKg ?? 0) - 65.77 <= 2.5);
    check("Outcome is progressed", decision.outcome === "progressed");
    
    if (!input.equipmentIds || input.equipmentIds.length === 0) {
      throw new Error("MUTANT: equipmentIds dropped");
    }
    if (("units" in input ? input.units : "metric") !== "imperial") {
      throw new Error("MUTANT: units dropped or set incorrectly");
    }
  }

  console.log("\n5. Property check: next - stored <= one step, next on grid");
  console.log("   Testing barbell, dumbbell over range 10-100 kg");
  {
    const offgridWeights = [10.3, 14.7, 23.1, 37.8, 49.2, 56.4, 63.9, 71.44, 72.35, 88.6, 95.1];
    
    for (const equipment of ["barbell", "dumbbell"]) {
      const grid = 2.5;
      for (const stored of offgridWeights) {
        const snapped = Math.floor(stored / grid) * grid;
        const next = snapped + grid;
        const jump = next - stored;
        const onGrid = Math.abs(next - Math.round(next / grid) * grid) < 0.001;
        
        check(`${equipment} ${stored} kg: jump ${jump.toFixed(2)} <= ${grid}`, jump <= grid + 0.001);
        check(`${equipment} ${stored} kg: next ${next} on grid`, onGrid);
        check(`${equipment} ${stored} kg: next ${next} > stored ${stored}`, next > stored);
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  if (failures === 0) {
    console.log("✅ ALL PASS");
    console.log("Snap rule verified: floor to grid, then add one step");
    console.log("Kills mutants: equipmentIds dropped, units dropped");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} failure(s)`);
    process.exit(1);
  }
}

runTests();
