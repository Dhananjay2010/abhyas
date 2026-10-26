#!/usr/bin/env tsx
/**
 * Real-path test: Full session-finish path for in-range heavier weight
 * 
 * Drives: actions.ts → build-progression-input → evaluateProgression → write-progress
 * Scenario: Stored 40 kg, logs 4×10 @ 42.5 kg in-range → stored 42.5 kg
 * Asserts on actual UPSERT payload's working weight
 * 
 * Run: npm run test:inrange-heavier-real-path
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

console.log("\n=== Real-path: In-range heavier weight ===\n");

async function main() {
  console.log("1. Stored 40 kg, logs 4×10 @ 42.5 kg → stores 42.5 kg");
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
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 10,
      best_e1rm: "53.33",
      total_sessions: 1,
      weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Decision: outcome hold", decision.outcome === "hold", decision.outcome);
    check("Decision: next weight 42.5 kg", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);
    check("Decision: failures reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);

    const fake = createFakeClient();
    await writeExerciseProgressCore(
      fake.client,
      "user-1",
      "ex-bench",
      decision,
      2,
      "2026-10-25"
    );

    const written = fake.getWritten();
    check("UPSERT: current_working_weight_kg = 42.5", written?.current_working_weight_kg === 42.5, `${written?.current_working_weight_kg}`);
    check("UPSERT: consecutive_failures = 0", written?.consecutive_failures === 0, `${written?.consecutive_failures}`);
    check("UPSERT: current_target_reps = 12", written?.current_target_reps === 12, `${written?.current_target_reps}`);
  }

  console.log("\n2. Stored 40 kg, mixed [42.5, 45, 42.5, 42.5] → stores 42.5 kg (lowest)");
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
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "45", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 10,
      best_e1rm: "53.33",
      total_sessions: 1,
      weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Decision: next weight 42.5 kg (lowest)", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);

    const fake = createFakeClient();
    await writeExerciseProgressCore(
      fake.client,
      "user-1",
      "ex-bench",
      decision,
      2,
      "2026-10-25"
    );

    const written = fake.getWritten();
    check("UPSERT: current_working_weight_kg = 42.5", written?.current_working_weight_kg === 42.5, `${written?.current_working_weight_kg}`);
  }

  console.log("\n3. Stored 40 kg, one set @ 37.5 kg → stores 40 kg (unchanged)");
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
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "37.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
      { reps: 10, weight_kg: "42.5", duration_seconds: null },
    ];

    const progress: ExerciseProgressRow = {
      current_working_weight_kg: "40",
      current_target_reps: 12,
      consecutive_failures: 0,
      best_weight_kg: "40",
      best_reps: 10,
      best_e1rm: "53.33",
      total_sessions: 1,
      weight_at_failure_start_kg: null,
    };

    const session: SessionRow = {
      is_deload: false,
      local_date: "2026-10-25",
      program_id: "prog-1",
    };

    const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
    const decision = evaluateProgression(input);

    check("Decision: next weight 40 kg (unchanged)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);

    const fake = createFakeClient();
    await writeExerciseProgressCore(
      fake.client,
      "user-1",
      "ex-bench",
      decision,
      2,
      "2026-10-25"
    );

    const written = fake.getWritten();
    check("UPSERT: current_working_weight_kg = 40", written?.current_working_weight_kg === 40, `${written?.current_working_weight_kg}`);
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
