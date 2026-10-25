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
      total_sessions: 1, weight_at_failure_start_kg: null,
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

  console.log("\n2. Real miss (4×7 below min=8): increments failures, drops weight with equipment");
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
      total_sessions: 2, weight_at_failure_start_kg: null,
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
    // #120: Now wired with equipmentIds (M2: unit removed)
    check("Miss: weight drops to 57.5 (first-miss with equipment)", decision.nextWorkingWeightKg === 57.5, `${decision.nextWorkingWeightKg}`);
    check("Builder: has equipmentIds", "equipmentIds" in input && Array.isArray(input.equipmentIds), `${JSON.stringify(input.equipmentIds)}`);
    check("M2: unit removed (no longer in input)", !("unit" in input), "unit property removed");
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
      total_sessions: 5, weight_at_failure_start_kg: null,
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
      total_sessions: 3, weight_at_failure_start_kg: null,
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

  console.log("\n5. Unloaded stored target 12, best 12: 3×10 below target (miss)");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-5",
      session_id: "sess-5",
      exercise_id: "ex-pushup",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: [], // Bodyweight
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 10, weight_kg: null, duration_seconds: null },
      { reps: 10, weight_kg: null, duration_seconds: null },
      { reps: 10, weight_kg: null, duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 12, // #120: Restore main's stored target
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 12, // #120: Restore main's best
      best_e1rm: null,
      total_sessions: 3, weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    // #120: With stored target 12, resolveTarget returns 12 as min, so 3×10 is a miss (not in-range)
    check("Unloaded stored target: repsMin from stored (12)", input.repsMin === 12, `${input.repsMin}`);
    check("Unloaded stored target: repsMax from planned (12)", input.repsMax === 12, `${input.repsMax}`);
    check("Unloaded stored target: outcome hold (miss)", decision.outcome === "hold", decision.outcome);
    check("Unloaded stored target: failures incremented to 1", decision.consecutiveFailures === 1, `${decision.consecutiveFailures}`);
    check("Unloaded stored target: message 'Staying'", decision.message.includes("Staying"), decision.message);
  }

  console.log("\n6. Unloaded below-min miss: bodyweight 3×7 below min=8");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-6",
      session_id: "sess-6",
      exercise_id: "ex-pushup",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: [], // Bodyweight
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 7, weight_kg: null, duration_seconds: null },
      { reps: 7, weight_kg: null, duration_seconds: null },
      { reps: 7, weight_kg: null, duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3, weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    // #120: Unloaded uses resolveTarget for min; stored target=12, so min=12 (not plan min=8)
    check("Unloaded miss: repsMin from resolveTarget (12)", input.repsMin === 12, `${input.repsMin}`);
    check("Unloaded miss: outcome hold (below min)", decision.outcome === "hold", decision.outcome);
    check("Unloaded miss: failures=1", decision.consecutiveFailures === 1, `${decision.consecutiveFailures}`);
    check("Unloaded miss: target stays at 12", decision.nextTargetReps === 12, `${decision.nextTargetReps}`);
  }

  console.log("\n7. Timed stored target 45 s, best 45 s: 2×35s below target (miss)");
  {
    const sessionExercise: SessionExerciseRow = {
      id: "se-7",
      session_id: "sess-7",
      exercise_id: "ex-plank",
      planned_sets: 2,
      planned_reps_min: 20,
      planned_reps_max: 45,
      metric: "seconds",
      exercises: {
        mechanic: "compound",
        movement_pattern: "core",
        equipment_ids: [],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: null, weight_kg: null, duration_seconds: 35 },
      { reps: null, weight_kg: null, duration_seconds: 35 },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 45, // #120: Restore main's stored target
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 45, // #120: Restore main's best
      best_e1rm: null,
      total_sessions: 2, weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    // #120: With stored target 45 s, resolveTarget returns 45 as min, so 2×35s is a miss (not in-range)
    check("Timed stored target: repsMin from stored (45)", input.repsMin === 45, `${input.repsMin}`);
    check("Timed stored target: repsMax from planned (45)", input.repsMax === 45, `${input.repsMax}`);
    check("Timed stored target: outcome hold (miss)", decision.outcome === "hold", decision.outcome);
    check("Timed stored target: failures incremented to 1", decision.consecutiveFailures === 1, `${decision.consecutiveFailures}`);
    check("Timed stored target: message 'hold length'", decision.message.includes("hold length"), decision.message);
  }

  console.log("\n8. Success threshold consistency: stored 14, plan 8-12");
  {
    // #120: Test that success threshold matches minimum for unloaded exercises
    // Push-ups stored 14: 3×12 should NOT progress (below stored target)
    const sessionExercise1: SessionExerciseRow = {
      id: "se-8a",
      session_id: "sess-8a",
      exercise_id: "ex-pushup",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: [],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets1: SessionSetRow[] = [
      { reps: 12, weight_kg: null, duration_seconds: null },
      { reps: 12, weight_kg: null, duration_seconds: null },
      { reps: 12, weight_kg: null, duration_seconds: null },
    ];

    const progress1: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 14,
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 14,
      best_e1rm: null,
      total_sessions: 5, weight_at_failure_start_kg: null,
    };

    const session1: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input1 = buildProgressionInput(sessionExercise1, sets1, progress1, session1, "right");
    const decision1 = evaluateProgression(input1);

    // #120: 3×12 below stored target 14, should hold (not progress)
    check("Stored 14, 3×12: repsMin from stored (14)", input1.repsMin === 14, `${input1.repsMin}`);
    check("Stored 14, 3×12: outcome hold (below target)", decision1.outcome === "hold", decision1.outcome);
    check("Stored 14, 3×12: target stays at 14", decision1.nextTargetReps === 14, `${decision1.nextTargetReps}`);
    check("Stored 14, 3×12: failures=1", decision1.consecutiveFailures === 1, `${decision1.consecutiveFailures}`);

    // Now test 3×14: should progress
    const sets2: SessionSetRow[] = [
      { reps: 14, weight_kg: null, duration_seconds: null },
      { reps: 14, weight_kg: null, duration_seconds: null },
      { reps: 14, weight_kg: null, duration_seconds: null },
    ];

    const input2 = buildProgressionInput(sessionExercise1, sets2, progress1, session1, "right");
    const decision2 = evaluateProgression(input2);

    // #120: 3×14 hits stored target 14, should progress to 16
    check("Stored 14, 3×14: outcome progressed", decision2.outcome === "progressed", decision2.outcome);
    check("Stored 14, 3×14: target increases to 16", decision2.nextTargetReps === 16, `${decision2.nextTargetReps}`);
    check("Stored 14, 3×14: failures reset to 0", decision2.consecutiveFailures === 0, `${decision2.consecutiveFailures}`);
  }

  console.log("\n9. Chin-ups pull_up_bar: stored 11, plan 8-12");
  {
    // #120: Test chin-ups with pull_up_bar equipment and stored target 11
    const sessionExercise: SessionExerciseRow = {
      id: "se-9",
      session_id: "sess-9",
      exercise_id: "ex-chinup",
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "vertical_pull",
        equipment_ids: ["pull_up_bar"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 11, weight_kg: null, duration_seconds: null },
      { reps: 11, weight_kg: null, duration_seconds: null },
      { reps: 11, weight_kg: null, duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 11,
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 11,
      best_e1rm: null,
      total_sessions: 3, weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    // #120: 3×11 at stored target 11 should progress to 13
    check("Chin-ups stored 11: repsMin from stored (11)", input.repsMin === 11, `${input.repsMin}`);
    check("Chin-ups 3×11: outcome progressed", decision.outcome === "progressed", decision.outcome);
    check("Chin-ups 3×11: target increases to 13", decision.nextTargetReps === 13, `${decision.nextTargetReps}`);
    check("Chin-ups 3×11: failures reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  }

  console.log("\n10. C4: isBodyweight assertions");
  {
    // Bodyweight exercise (empty equipment_ids)
    const bwEx: SessionExerciseRow = {
      id: "se-pushup",
      session_id: "sess-1",
      exercise_id: "ex-pushup",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: [],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const bwProgress: ExerciseProgressRow = {
      current_working_weight_kg: null,
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: null,
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
      weight_at_failure_start_kg: null,
    };

    const bwInput = buildProgressionInput(bwEx, [], bwProgress, { is_deload: false, local_date: "2026-10-25", program_id: "prog-1" }, "right");
    check("C4: isBodyweight true for empty equipment_ids", bwInput.meta.isBodyweight === true);

    // Loaded exercise (pull_up_bar)
    const loadedEx: SessionExerciseRow = {
      id: "se-pullup",
      session_id: "sess-1",
      exercise_id: "ex-pullup",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "vertical_pull",
        equipment_ids: ["pull_up_bar"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const loadedInput = buildProgressionInput(loadedEx, [], bwProgress, { is_deload: false, local_date: "2026-10-25", program_id: "prog-1" }, "right");
    check("C4: isBodyweight false for pull_up_bar", loadedInput.meta.isBodyweight === false);
  }

  console.log("\n11. C4: Weighted-dip case (+10 kg, no equipment)");
  {
    // Dips with added weight, but no equipment listed
    const dipEx: SessionExerciseRow = {
      id: "se-dip-weighted",
      session_id: "sess-1",
      exercise_id: "ex-dip-weighted",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "horizontal_press",
        equipment_ids: [], // Bodyweight + added weight, but no equipment
        progression_chain: null,
        progression_rank: null,
      },
    };

    const dipSets: SessionSetRow[] = [
      { reps: 12, weight_kg: "10", duration_seconds: null },
      { reps: 12, weight_kg: "10", duration_seconds: null },
      { reps: 12, weight_kg: "10", duration_seconds: null },
      { reps: 12, weight_kg: "10", duration_seconds: null },
    ];

    const dipProgress: ExerciseProgressRow = {
      current_working_weight_kg: "10",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "10",
      best_reps: 12,
      best_e1rm: null,
      total_sessions: 3,
      weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(dipEx, dipSets, dipProgress, session, "easy");
    const decision = evaluateProgression(input);

    // Easy at top: should progress. With no equipment, bodyweight added-weight step is 1.25 kg
    // From 10 kg, one step = 11.25 kg (not 15 kg which would be 2×2.5 steps)
    check("Weighted dip +10 kg, 3×12 easy: progressed", decision.outcome === "progressed", decision.outcome);
    check("Weighted dip +10 kg easy: next weight 11.25 kg (C4: mutant gives 15)", decision.nextWorkingWeightKg === 11.25, `got ${decision.nextWorkingWeightKg}`);
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
