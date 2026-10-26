#!/usr/bin/env tsx
/**
 * Real-path test: Full session-finish path for top-of-range progression
 * 
 * Drives: actions.ts → build-progression-input → evaluateProgression → write-progress
 * Scenario: Stored 40 kg, logs 4×12 @ 45 kg (top of range) → progresses to 47.5 kg
 * Asserts on actual UPSERT payload's working weight
 * 
 * Run: npm run test:top-of-range-real-path
 */

import { evaluateProgression } from "../src/lib/program/progression";
import {
  buildProgressionInput,
  type SessionExerciseRow,
  type SessionSetRow,
  type SessionRow,
} from "../src/lib/session/build-progression-input";

type ExerciseProgressRow = {
  current_working_weight_kg: string | number | null;
  current_target_reps: number | null;
  consecutive_failures: number;
  best_weight_kg: string | number | null;
  best_reps: number | null;
  best_e1rm: string | number | null;
  total_sessions: number;
  weight_at_failure_start_kg?: string | number | null;
} | null;

import {
  writeExerciseProgressCore,
  type ProgressClient,
  type ProgressWrite,
} from "../src/lib/session/write-progress";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeClient(): {
  client: ProgressClient;
  getWritten: () => ProgressWrite | null;
} {
  let written: ProgressWrite | null = null;

  const client: ProgressClient = {
    from: () => ({
      upsert: async (data: ProgressWrite) => {
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

console.log("\n=== Real-path: Top-of-range progression ===\n");

async function main() {
  console.log("1. Stored 40 kg, logs 4×12 @ 45 kg → progresses to 47.5 kg");
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
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
      { reps: 12, weight_kg: "45", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 10,
      best_e1rm: "53.33",
      total_sessions: 3,
      weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-26",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Decision: progressed", decision.outcome === "progressed", decision.outcome);
    check("Next weight: 47.5 kg (from 45, not from 40)", decision.nextWorkingWeightKg === 47.5, `${decision.nextWorkingWeightKg}`);
    check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
    check("Target reps: stays 12", decision.nextTargetReps === 12, `${decision.nextTargetReps}`);

    // Write progress
    const { client, getWritten } = createFakeClient();
    await writeExerciseProgressCore(client, "user-1", "ex-bench", decision, 3, "2026-10-26");

    const written = getWritten();
    check("Write succeeded", written !== null, written ? "written" : "null");

    if (written) {
      check("Persisted: current_working_weight_kg = 47.5", written.current_working_weight_kg === 47.5, `${written.current_working_weight_kg}`);
      check("Persisted: current_target_reps = 12", written.current_target_reps === 12, `${written.current_target_reps}`);
      check("Persisted: consecutive_failures = 0", written.consecutive_failures === 0, `${written.consecutive_failures}`);
    }
  }
}

main().then(() => {
  console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
});
