#!/usr/bin/env tsx
/**
 * Real-path test: server action applyProgression through Supabase stubs
 * 
 * Drives: src/lib/session/apply-progression-core.ts applyProgressionCore
 * 
 * Tests that the core progression logic:
 * 1. Passes the decision's nextWorkingWeightKg to writeExerciseProgressCore (not prior weight)
 * 2. Passes the feel parameter through to buildProgressionInput
 */

import { applyProgressionCore } from "../src/lib/session/apply-progression-core.js";
import type { SessionExerciseRow, SessionSetRow, ExerciseProgressRow, SessionRow } from "../src/lib/session/build-progression-input.js";
import type { ProgressClient, ProgressWrite } from "../src/lib/session/write-progress.js";
import type { Database } from "../src/lib/database.types.js";

type SetFeel = Database["public"]["Enums"]["set_feel"];

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== Real-path: applyProgression server action ===\n");

async function main() {
  // Test 1: Persisted weight must be the decision's weight (47.5), not prior (40)
  console.log("1. Stored 40 kg, logs 4×12 @ 45 kg → persists 47.5 kg (not 40 kg)\n");
  {
    let persistedWeight: number | null = null;

    const client: ProgressClient = {
      from: () => ({
        upsert: async (data: ProgressWrite, _opts: { onConflict: string }) => {
          persistedWeight = data.current_working_weight_kg;
          return { data: null, error: null };
        },
      }),
    };

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
        equipment_ids: ["barbell", "flat_bench"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
    ];

    const progress: NonNullable<ExerciseProgressRow> = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 12,
      best_e1rm: "53.33",
      total_sessions: 5,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const decision = await applyProgressionCore(
      client,
      "user-1",
      sessionExercise.exercise_id,
      sessionExercise,
      sets,
      progress,
      session,
      "right"
    );

    check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
    check("Next weight: 47.5 kg (from 45, not from 40)", decision.nextWorkingWeightKg === 47.5, `${decision.nextWorkingWeightKg}`);
    check("Persisted weight: 47.5 kg (not 40 kg)", persistedWeight === 47.5, `${persistedWeight}`);
  }

  // Test 2: Feel parameter must reach buildProgressionInput (top-of-range)
  console.log("\n2. Top-of-range: stored 40 kg, logs 4×12 @ 45 kg\n");
  {
    let persistedWeightRight: number | null = null;
    let persistedWeightHard: number | null = null;

    const clientRight: ProgressClient = {
      from: () => ({
        upsert: async (data: ProgressWrite, _opts: { onConflict: string }) => {
          persistedWeightRight = data.current_working_weight_kg;
          return { data: null, error: null };
        },
      }),
    };

    const clientHard: ProgressClient = {
      from: () => ({
        upsert: async (data: ProgressWrite, _opts: { onConflict: string }) => {
          persistedWeightHard = data.current_working_weight_kg;
          return { data: null, error: null };
        },
      }),
    };

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
        equipment_ids: ["barbell", "flat_bench"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
    ];

    const progress: NonNullable<ExerciseProgressRow> = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 12,
      best_e1rm: "53.33",
      total_sessions: 3,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    // Test with right feel (should progress to 47.5)
    const decisionRight = await applyProgressionCore(
      clientRight,
      "user-1",
      sessionExercise.exercise_id,
      sessionExercise,
      sets,
      progress,
      session,
      "right"
    );

    // Test with hard feel (should hold at 45)
    const decisionHard = await applyProgressionCore(
      clientHard,
      "user-1",
      sessionExercise.exercise_id,
      sessionExercise,
      sets,
      progress,
      session,
      "hard"
    );

    check("Right feel: outcome progressed", decisionRight.outcome === "progressed", decisionRight.outcome);
    check("Right feel: progresses to 47.5 kg (45 + 2.5)", decisionRight.nextWorkingWeightKg === 47.5, `${decisionRight.nextWorkingWeightKg}`);
    check("Right feel: persisted 47.5 kg", persistedWeightRight === 47.5, `${persistedWeightRight}`);
    check("Hard feel: outcome hold", decisionHard.outcome === "hold", decisionHard.outcome);
    check("Hard feel: holds at 45 kg", decisionHard.nextWorkingWeightKg === 45, `${decisionHard.nextWorkingWeightKg}`);
    check("Hard feel: persisted 45 kg", persistedWeightHard === 45, `${persistedWeightHard}`);
  }
}

main()
  .then(() => {
    console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
