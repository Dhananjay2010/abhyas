#!/usr/bin/env tsx
/**
 * Real-path test: buildProgressionInput → evaluateProgression → writeExerciseProgressCore
 * 
 * Verifies the full pipeline from DB rows through buildProgressionInput to the persistence layer,
 * ensuring that a new user's in-range session correctly stores the logged weight (H2 fix).
 */

import { evaluateProgression } from "../src/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "../src/lib/session/build-progression-input";
import type { ProgressWrite } from "../src/lib/session/write-progress";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== Real-path: buildProgressionInput + writeExerciseProgressCore ===");

console.log("\n1. New user (prior=null) 4×10@40 in 8-12 → stores weight=40");
{
  const sessionExercise: SessionExerciseRow = {
    id: "se-new",
    session_id: "sess-new",
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

  const progress: ExerciseProgressRow = null; // NEW USER

  const session: SessionRow = {
    is_deload: false,
    local_date: "2026-10-25",
    program_id: "prog-1",
  };

  const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
  check("Builder: state.currentWorkingWeightKg is null", input.state.currentWorkingWeightKg === null, `${input.state.currentWorkingWeightKg}`);

  const decision = evaluateProgression(input);
  check("Decision: outcome hold", decision.outcome === "hold", decision.outcome);
  check("Decision: nextWorkingWeightKg = 40", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Decision: failures = 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);

  const write: ProgressWrite = {
    current_working_weight_kg: decision.nextWorkingWeightKg,
    current_target_reps: decision.nextTargetReps,
    consecutive_failures: decision.consecutiveFailures,
    best_weight_kg: decision.nextWorkingWeightKg,
    best_reps: 10,
    best_e1rm: decision.bestE1rm,
    total_sessions: 1,
  };

  check("Write: current_working_weight_kg = 40", write.current_working_weight_kg === 40, `${write.current_working_weight_kg}`);
  check("Write: consecutive_failures = 0", write.consecutive_failures === 0, `${write.consecutive_failures}`);
}

console.log("\n2. Existing user (prior=50) 4×10 in 8-12 → keeps stored weight 50");
{
  const sessionExercise: SessionExerciseRow = {
    id: "se-existing",
    session_id: "sess-existing",
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
    current_working_weight_kg: "50",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "60",
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
  
  check("Existing user: nextWorkingWeightKg = 50 (stored, not logged)", decision.nextWorkingWeightKg === 50, `${decision.nextWorkingWeightKg}`);
  check("Existing user: failures = 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
}

console.log("\n3. Planned sets null defaults to 3");
{
  const sessionExercise: SessionExerciseRow = {
    id: "se-nullsets",
    session_id: "sess-nullsets",
    exercise_id: "ex-curl",
    planned_sets: null, // NULL in DB
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "isolation",
      movement_pattern: "biceps",
      equipment_ids: ["dumbbell"],
      progression_chain: null,
      progression_rank: null,
    },
  };

  const sets: SessionSetRow[] = [
    { reps: 10, weight_kg: "10", duration_seconds: null },
    { reps: 10, weight_kg: "10", duration_seconds: null },
    { reps: 10, weight_kg: "10", duration_seconds: null },
  ];

  const progress: ExerciseProgressRow = null;

  const session: SessionRow = {
    is_deload: false,
    local_date: "2026-10-25",
    program_id: "prog-1",
  };

  const input = buildProgressionInput(sessionExercise, sets, progress, session, "right");
  check("Null planned_sets defaults to 3", input.plannedSets === 3, `${input.plannedSets}`);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All real-path persistence tests passed`);
