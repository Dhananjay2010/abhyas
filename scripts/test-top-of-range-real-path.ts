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
      upsert: async (data: ProgressWrite, _: { onConflict: string }) => {
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

console.log("\nReal-path: Top-of-range progression from heavier logged weight\n");

const sessionRow: SessionRow = {
  id: "session-1",
  user_id: "user-1",
  program_id: "program-1",
  local_date: "2025-01-15",
  status: "completed",
};

const exerciseRow: SessionExerciseRow = {
  id: "ex-1",
  session_id: "session-1",
  exercise_id: "bench-press-id",
  exercise_slug: "barbell-bench-press",
  session_order: 1,
  reps_min: 8,
  reps_max: 12,
  planned_sets: 4,
  exercise_name: "Barbell Bench Press",
  mechanic_type: "compound",
  movement_pattern: "horizontal_press",
  progression_chain_id: null,
  progression_rank: null,
  equipment_ids: ["barbell"],
  is_bodyweight: false,
  metric: "reps" as const,
};

const progressRow: ExerciseProgressRow = {
  current_working_weight_kg: 40,
  current_target_reps: 12,
  consecutive_failures: 0,
  best_weight_kg: 40,
  best_reps: 10,
  best_e1rm: 53.33,
  total_sessions: 3,
  weight_at_failure_start_kg: null,
};

// Logged 4×12 @ 45 kg (all sets at top of range, heavier than stored 40)
const setRows: SessionSetRow[] = [
  {
    id: "set-1",
    session_exercise_id: "ex-1",
    set_number: 1,
    reps: 12,
    weight_kg: 45,
    is_warmup_set: false,
    duration_seconds: null,
  },
  {
    id: "set-2",
    session_exercise_id: "ex-1",
    set_number: 2,
    reps: 12,
    weight_kg: 45,
    is_warmup_set: false,
    duration_seconds: null,
  },
  {
    id: "set-3",
    session_exercise_id: "ex-1",
    set_number: 3,
    reps: 12,
    weight_kg: 45,
    is_warmup_set: false,
    duration_seconds: null,
  },
  {
    id: "set-4",
    session_exercise_id: "ex-1",
    set_number: 4,
    reps: 12,
    weight_kg: 45,
    is_warmup_set: false,
    duration_seconds: null,
  },
};

console.log("1. Build progression input from session data");
{
  const input = buildProgressionInput({
    sessionRow,
    exerciseRow,
    setRows,
    progressRow,
    userInjuryRegions: [],
    userEquipmentIds: ["barbell"],
    userWeightUnit: "kg",
    feel: "right",
  });

  check("repsMin from planned", input.repsMin === 8, `${input.repsMin}`);
  check("repsMax from planned", input.repsMax === 12, `${input.repsMax}`);
  check("4 working sets", input.sets.length === 4, `${input.sets.length}`);
  check("State: stored weight 40 kg", input.state.currentWorkingWeightKg === 40, `${input.state.currentWorkingWeightKg}`);
  check("State: target reps 12", input.state.currentTargetReps === 12, `${input.state.currentTargetReps}`);
}

console.log("\n2. Evaluate progression: stored 40, logged 4×12@45 → progresses from 45 to 47.5");
{
  const input = buildProgressionInput({
    sessionRow,
    exerciseRow,
    setRows,
    progressRow,
    userInjuryRegions: [],
    userEquipmentIds: ["barbell"],
    userWeightUnit: "kg",
    feel: "right",
  });

  const decision = evaluateProgression(input);

  check("Decision: progressed", decision.outcome === "progressed", decision.outcome);
  check("Next weight: 47.5 kg (from 45, not from 40)", decision.nextWorkingWeightKg === 47.5, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  check("Target reps: stays 12", decision.nextTargetReps === 12, `${decision.nextTargetReps}`);
}

console.log("\n3. Write progress: persisted working weight is 47.5");
{
  const input = buildProgressionInput({
    sessionRow,
    exerciseRow,
    setRows,
    progressRow,
    userInjuryRegions: [],
    userEquipmentIds: ["barbell"],
    userWeightUnit: "kg",
    feel: "right",
  });

  const decision = evaluateProgression(input);
  const { client, getWritten } = createFakeClient();

  await writeExerciseProgressCore(client, {
    userId: "user-1",
    exerciseId: "bench-press-id",
    sessionId: "session-1",
    decision,
    working: input.sets,
  });

  const written = getWritten();
  check("Write succeeded", written !== null, written ? "written" : "null");

  if (written) {
    check("Persisted: current_working_weight_kg = 47.5", written.current_working_weight_kg === 47.5, `${written.current_working_weight_kg}`);
    check("Persisted: current_target_reps = 12", written.current_target_reps === 12, `${written.current_target_reps}`);
    check("Persisted: consecutive_failures = 0", written.consecutive_failures === 0, `${written.consecutive_failures}`);
  }
}

console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ ${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
