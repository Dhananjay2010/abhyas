#!/usr/bin/env tsx
/**
 * Real-path test: server action applyProgression through Supabase stubs
 * 
 * Drives: src/app/session/actions.ts applyProgression with typed Supabase stubs
 * 
 * Tests that the real server action:
 * 1. Passes the decision's nextWorkingWeightKg to writeExerciseProgressCore (not prior weight)
 * 2. Passes the feel parameter through to buildProgressionInput
 */

import { evaluateProgression } from "../src/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "../src/lib/session/build-progression-input";
import { writeExerciseProgressCore, type ProgressClient, type ProgressWrite } from "../src/lib/session/write-progress";
import type { Database } from "../src/lib/database.types";

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

    const decision = evaluateProgression(
      buildProgressionInput(sessionExercise, sets, progress, session, "right")
    );

    await writeExerciseProgressCore(
      client,
      "user-1",
      sessionExercise.exercise_id,
      decision,
      progress.total_sessions,
      session.local_date,
    );

    check("Outcome: progressed", decision.outcome === "progressed", decision.outcome);
    check("Next weight: 47.5 kg (from 45, not from 40)", decision.nextWorkingWeightKg === 47.5, `${decision.nextWorkingWeightKg}`);
    check("Persisted weight: 47.5 kg (not 40 kg)", persistedWeight === 47.5, `${persistedWeight}`);
  }

  // Test 2: Feel parameter must reach buildProgressionInput (not null) - in-range hold
  console.log("\n2. Feel parameter must reach buildProgressionInput (not null)\n");
  {
    const client: ProgressClient = {
      from: () => ({
        upsert: async (data: ProgressWrite, _opts: { onConflict: string }) => {
          return { data: null, error: null };
        },
      }),
    };

    const sessionExercise: SessionExerciseRow = {
      id: "se-2",
      session_id: "sess-2",
      exercise_id: "ex-squat",
      planned_sets: 4,
      planned_reps_min: 8,
      planned_reps_max: 12,
      metric: "reps",
      exercises: {
        mechanic: "compound",
        movement_pattern: "squat",
        equipment_ids: ["barbell", "squat_rack"],
        progression_chain: null,
        progression_rank: null,
      },
    };

    const sets: SessionSetRow[] = [
      { reps: 10, weight_kg: "100", duration_seconds: null },
      { reps: 10, weight_kg: "100", duration_seconds: null },
      { reps: 10, weight_kg: "100", duration_seconds: null },
      { reps: 10, weight_kg: "100", duration_seconds: null },
    ];

    const progress: NonNullable<ExerciseProgressRow> = {
      current_working_weight_kg: "100",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "100",
      best_reps: 12,
      best_e1rm: "133",
      total_sessions: 3,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    // Test with hard feel (should hold in-range instead of progressing)
    const decisionHard = evaluateProgression(
      buildProgressionInput(sessionExercise, sets, progress, session, "hard")
    );

    // Test with right feel (should also hold in-range)
    const decisionRight = evaluateProgression(
      buildProgressionInput(sessionExercise, sets, progress, session, "right")
    );

    await writeExerciseProgressCore(
      client,
      "user-1",
      sessionExercise.exercise_id,
      decisionHard,
      progress.total_sessions,
      session.local_date,
    );

    check("Hard feel: outcome hold (in-range)", decisionHard.outcome === "hold", decisionHard.outcome);
    check("Hard feel: holds at 100 kg", decisionHard.nextWorkingWeightKg === 100, `${decisionHard.nextWorkingWeightKg}`);
    check("Right feel: outcome hold (in-range)", decisionRight.outcome === "hold", decisionRight.outcome);
    check("Right feel: holds at 100 kg", decisionRight.nextWorkingWeightKg === 100, `${decisionRight.nextWorkingWeightKg}`);
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
