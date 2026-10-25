#!/usr/bin/env tsx
/**
 * Real-path test: buildProgressionInput from actions.ts with real DB row mapping
 * 
 * Tests the REAL production code path that maps database rows into evaluateProgression input.
 * This is the extracted mapping from src/app/session/actions.ts applyProgression.
 * 
 * HIGH-2: Kills mutants in the production builder (buildProgressionInput):
 * - repsMin <- planned_reps_max (brings the bug back)
 * - repsMin dropped (defaulting to 0)
 * - wrong state weight source
 * - inRange guard removed (caught by test-progression-in-range-mutants.sh)
 * 
 * Run: npm run test:progression-real-path
 */

import { evaluateProgression } from "../src/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "../src/lib/session/build-progression-input";
import { writeExerciseProgressCore, type ProgressClient, type ProgressWrite } from "../src/lib/session/write-progress";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeClient(): { client: ProgressClient; getWritten: () => ProgressWrite | null } {
  let written: ProgressWrite | null = null;

  const client: ProgressClient = {
    from: () => ({
      upsert: async (data: ProgressWrite, _opts: { onConflict: string }) => {
        written = data;
        return { data: null, error: null };
      },
    }),
  };

  return {
    client,
    getWritten: () => written,
  };
}

console.log("\nTest: Real-path progression through buildProgressionInput\n");
console.log("(Tests the REAL extracted mapping from actions.ts applyProgression)\n");

async function main() {
  console.log("1. In-range session (4×10 in 8-12): holds weight and resets failures");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-1",
      session_id: "sess-1",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 10, weight_kg: "40", duration_seconds: null },
      { reps: 10, weight_kg: "40", duration_seconds: null },
      { reps: 10, weight_kg: "40", duration_seconds: null },
      { reps: 10, weight_kg: "40", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 12,
      best_e1rm: "56",
      total_sessions: 1,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("In-range: outcome hold", decision.outcome === "hold", decision.outcome);
    check("In-range: weight held at 40", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
    check("In-range: failures reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);

    // Persist and verify
    const fake = createFakeClient();
    await writeExerciseProgressCore(
      fake.client,
      "user-1",
      "ex-bench",
      decision,
      1,
      "2026-10-25",
    );

    const written = fake.getWritten();
    check("Persisted: consecutive_failures=0", written?.consecutive_failures === 0, `${written?.consecutive_failures}`);
    check("Persisted: weight=40", written?.current_working_weight_kg === 40, `${written?.current_working_weight_kg}`);
  }

  console.log("\n2. Real miss (4×7 below min=8): increments failures, holds weight (no equipment)");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-2",
      session_id: "sess-2",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 7, weight_kg: "60", duration_seconds: null },
      { reps: 7, weight_kg: "60", duration_seconds: null },
      { reps: 7, weight_kg: "60", duration_seconds: null },
      { reps: 7, weight_kg: "60", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "60",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "60",
      best_reps: 12,
      best_e1rm: "84",
      total_sessions: 2,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Miss: outcome hold (first miss)", decision.outcome === "hold", decision.outcome);
    check("Miss: failures=1", decision.consecutiveFailures === 1, `${decision.consecutiveFailures}`);
    check("Miss: weight holds at 60 (no equipmentIds/unit)", decision.nextWorkingWeightKg === 60, `${decision.nextWorkingWeightKg}`);
    check("Builder: no equipmentIds", input.equipmentIds === undefined, `${input.equipmentIds}`);
    check("Builder: no unit", input.unit === undefined, `${input.unit}`);
  }

  console.log("\n3. State weight test: current=50 vs best=60 (would catch best_weight_kg swap)");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-3",
      session_id: "sess-3",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 10, weight_kg: "50", duration_seconds: null },
      { reps: 10, weight_kg: "50", duration_seconds: null },
      { reps: 10, weight_kg: "50", duration_seconds: null },
      { reps: 10, weight_kg: "50", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "50", // Current prescribed weight
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "60", // Historical best is higher
      best_reps: 12,
      best_e1rm: "84",
      total_sessions: 5,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("State weight: outcome hold (in-range)", decision.outcome === "hold", decision.outcome);
    check("State weight: next weight is current (50), not best (60)", decision.nextWorkingWeightKg === 50, `${decision.nextWorkingWeightKg}`);
    check("State weight: failures reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  }

  console.log("\n4. Two consecutive misses: deload ~10% (even without equipmentIds)");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-4",
      session_id: "sess-4",
      exercise_id: "ex-bench",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: ["barbell"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 7, weight_kg: "40", duration_seconds: null },
      { reps: 7, weight_kg: "40", duration_seconds: null },
      { reps: 7, weight_kg: "40", duration_seconds: null },
      { reps: 7, weight_kg: "40", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 1, // Already failed once
      best_weight_kg: "60",
      best_reps: 12,
      best_e1rm: "84",
      total_sessions: 3,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Two misses: outcome backed_off", decision.outcome === "backed_off", decision.outcome);
    check("Two misses: deloads to 35 kg (-12.5%, ~10%)", decision.nextWorkingWeightKg === 35, `${decision.nextWorkingWeightKg}`);
    check("Two misses: failures reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  
  if (failures === 0) {
    console.log("✅ Real-path test passed");
    console.log("\nTo verify mutants, run:");
    console.log("  npm run test:progression-real-path-mutants");
  }
  
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
