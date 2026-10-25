#!/usr/bin/env tsx
/**
 * QA Bot 1 Must-Covers: Full Write Path
 * 
 * Tests through progressionInputsFromExercise → evaluateProgression → writeExerciseProgressCore
 * with an in-memory ProgressClient that persists state across sessions.
 * 
 * This test KILLS M12 (.max→.min) by itself with plan-range cases.
 */

import { evaluateProgression, type ProgressState, type ExerciseMeta } from "../src/lib/program/progression.js";
import { progressionInputsFromExercise } from "../src/lib/session/progression-inputs.js";
import { writeExerciseProgressCore, type ProgressClient, type ProgressWrite } from "../src/lib/session/write-progress.js";

let failures = 0;

function check(desc: string, passed: boolean, detail?: string): void {
  if (!passed) {
    console.error(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ok   ${desc}${detail ? ` -- ${detail}` : ""}`);
  }
}

// In-memory ProgressClient
class InMemoryProgressClient implements ProgressClient {
  private store = new Map<string, ProgressWrite>();

  from(table: string) {
    if (table !== "exercise_progress") throw new Error(`Unexpected table: ${table}`);
    return {
      upsert: async (data: Record<string, unknown>) => {
        const row: ProgressWrite = {
          user_id: String(data.user_id),
          exercise_id: String(data.exercise_id),
          current_working_weight_kg: data.current_working_weight_kg as number | null,
          current_target_reps: data.current_target_reps as number | null,
          consecutive_failures: Number(data.consecutive_failures),
          last_performed_on: data.last_performed_on as string | null,
          best_weight_kg: data.best_weight_kg as number | null,
          best_reps: data.best_reps as number | null,
          best_e1rm: data.best_e1rm as number | null,
          total_sessions: Number(data.total_sessions),
          updated_at: String(data.updated_at),
        };
        const key = `${row.user_id}:${row.exercise_id}`;
        this.store.set(key, row);
        return { data: row, error: null };
      },
    };
  }

  getProgress(userId: string, exerciseId: string): ProgressWrite | undefined {
    return this.store.get(`${userId}:${exerciseId}`);
  }
}

const client = new InMemoryProgressClient();
const USER_ID = "test-user";

async function runTests() {
console.log("\n=== QA Bot 1: (7) Timed Holds - Target Not Reached vs Holding at Cap ===\n");

// M13 killer: plank 119s with stored 500 (cap 120) → not-reached, not hold
// M12 killer: plank 30s with no stored target on 20-40 plan → plan max not reached
{
  const plankId = "plank-ex";
  
  // Session 1: stored 500s (cap 120), perform 119s
  {
    const stored = client.getProgress(USER_ID, plankId);
    const progress = {
      current_working_weight_kg: stored?.current_working_weight_kg ?? null,
      current_target_reps: 500,
    };
    
    const progInputs = progressionInputsFromExercise({ equipment_ids: [] }, null);
    const state: ProgressState = {
      currentTargetReps: progress.current_target_reps,
      currentWorkingWeightKg: progress.current_working_weight_kg,
      consecutiveFailures: stored?.consecutive_failures ?? 0,
      bestWeightKg: stored?.best_weight_kg ?? null,
      bestReps: stored?.best_reps ?? null,
      bestE1rm: stored?.best_e1rm ?? null,
      totalSessions: stored?.total_sessions ?? 0,
    };
    
    const decision = evaluateProgression({
      sets: [
        { reps: null, durationSeconds: 119, weightKg: 0 },
        { reps: null, durationSeconds: 119, weightKg: 0 },
        { reps: null, durationSeconds: 119, weightKg: 0 },
      ],
      plannedSets: 3,
      repsMin: 20,
      repsMax: 40,
      feel: "right",
      meta: {
        mechanic: "isolation",
        metric: "seconds",
        movementPattern: "core",
        isBodyweight: true,
        progressionChain: null,
        progressionRank: null,
      },
      state,
      isDeload: false,
      ...progInputs,
    });
    
    await writeExerciseProgressCore(client, USER_ID, plankId, decision, state.totalSessions, "2026-10-25");
    
    check("Plank 119s (cap-1): does NOT progress (kills M13 off-by-one)", decision.outcome !== "progressed");
    check("Plank 119s: message says 'Staying' (below cap, target not reached)", decision.message.includes("Staying"));
  }
  
  // Session 2: stored 500s (cap 120), perform 120s
  {
    const stored = client.getProgress(USER_ID, plankId);
    const progress = {
      current_working_weight_kg: stored?.current_working_weight_kg ?? null,
      current_target_reps: stored?.current_target_reps ?? null,
    };
    
    const progInputs = progressionInputsFromExercise({ equipment_ids: [] }, null);
    const state: ProgressState = {
      currentTargetReps: progress.current_target_reps,
      currentWorkingWeightKg: progress.current_working_weight_kg,
      consecutiveFailures: stored?.consecutive_failures ?? 0,
      bestWeightKg: stored?.best_weight_kg ?? null,
      bestReps: stored?.best_reps ?? null,
      bestE1rm: stored?.best_e1rm ?? null,
      totalSessions: stored?.total_sessions ?? 0,
    };
    
    const decision = evaluateProgression({
      sets: [
        { reps: null, durationSeconds: 120, weightKg: 0 },
        { reps: null, durationSeconds: 120, weightKg: 0 },
        { reps: null, durationSeconds: 120, weightKg: 0 },
      ],
      plannedSets: 3,
      repsMin: 20,
      repsMax: 40,
      feel: "right",
      meta: {
        mechanic: "isolation",
        metric: "seconds",
        movementPattern: "core",
        isBodyweight: true,
        progressionChain: null,
        progressionRank: null,
      },
      state,
      isDeload: false,
      ...progInputs,
    });
    
    await writeExerciseProgressCore(client, USER_ID, plankId, decision, state.totalSessions, "2026-10-26");
    
    check("Plank 120s (at cap): outcome is hold (holding at ceiling)", decision.outcome === "hold");
    check("Plank 120s: next target writes as 120 (cap applied)", decision.nextTargetReps === 120);
  }
}

// M12 killer: plan-range cases (no stored target, must reach plan max to progress)
{
  const plank2Id = "plank-no-stored";
  
  // Session: no stored target, 3x30s on 20-40 plan
  {
    const stored = client.getProgress(USER_ID, plank2Id);
    const progress = {
      current_working_weight_kg: stored?.current_working_weight_kg ?? null,
      current_target_reps: stored?.current_target_reps ?? null,
    };
    
    const progInputs = progressionInputsFromExercise({ equipment_ids: [] }, null);
    const state: ProgressState = {
      currentTargetReps: progress.current_target_reps,
      currentWorkingWeightKg: progress.current_working_weight_kg,
      consecutiveFailures: stored?.consecutive_failures ?? 0,
      bestWeightKg: stored?.best_weight_kg ?? null,
      bestReps: stored?.best_reps ?? null,
      bestE1rm: stored?.best_e1rm ?? null,
      totalSessions: stored?.total_sessions ?? 0,
    };
    
    const decision = evaluateProgression({
      sets: [
        { reps: null, durationSeconds: 30, weightKg: 0 },
        { reps: null, durationSeconds: 30, weightKg: 0 },
        { reps: null, durationSeconds: 30, weightKg: 0 },
      ],
      plannedSets: 3,
      repsMin: 20,
      repsMax: 40,
      feel: "right",
      meta: {
        mechanic: "isolation",
        metric: "seconds",
        movementPattern: "core",
        isBodyweight: true,
        progressionChain: null,
        progressionRank: null,
      },
      state,
      isDeload: false,
      ...progInputs,
    });
    
    await writeExerciseProgressCore(client, USER_ID, plank2Id, decision, state.totalSessions, "2026-10-25");
    
    check("Plank no stored: 3x30s < plan max 40 → does NOT progress", decision.outcome !== "progressed");
  }
  
  // Session: 3x40s (plan max)
  {
    const stored = client.getProgress(USER_ID, plank2Id);
    const progress = {
      current_working_weight_kg: stored?.current_working_weight_kg ?? null,
      current_target_reps: stored?.current_target_reps ?? null,
    };
    
    const progInputs = progressionInputsFromExercise({ equipment_ids: [] }, null);
    const state: ProgressState = {
      currentTargetReps: progress.current_target_reps,
      currentWorkingWeightKg: progress.current_working_weight_kg,
      consecutiveFailures: stored?.consecutive_failures ?? 0,
      bestWeightKg: stored?.best_weight_kg ?? null,
      bestReps: stored?.best_reps ?? null,
      bestE1rm: stored?.best_e1rm ?? null,
      totalSessions: stored?.total_sessions ?? 0,
    };
    
    const decision = evaluateProgression({
      sets: [
        { reps: null, durationSeconds: 40, weightKg: 0 },
        { reps: null, durationSeconds: 40, weightKg: 0 },
        { reps: null, durationSeconds: 40, weightKg: 0 },
      ],
      plannedSets: 3,
      repsMin: 20,
      repsMax: 40,
      feel: "right",
      meta: {
        mechanic: "isolation",
        metric: "seconds",
        movementPattern: "core",
        isBodyweight: true,
        progressionChain: null,
        progressionRank: null,
      },
      state,
      isDeload: false,
      ...progInputs,
    });
    
    await writeExerciseProgressCore(client, USER_ID, plank2Id, decision, state.totalSessions, "2026-10-26");
    
    check("Plank no stored: 3x40s = plan max → DOES progress", decision.outcome === "progressed");
    check("Plank no stored: next target 45s", decision.nextTargetReps === 45);
  }
}

// M12 killer: loaded deadlift 3x10 on 8-12 plan must not progress
{
  const deadliftId = "deadlift-plan-range";
  
  const stored = client.getProgress(USER_ID, deadliftId);
  const progress = {
    current_working_weight_kg: 90,
    current_target_reps: stored?.current_target_reps ?? null,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 90 },
      { reps: 10, weightKg: 90 },
      { reps: 10, weightKg: 90 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "hinge",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, deadliftId, decision, state.totalSessions, "2026-10-25");
  
  check("Deadlift no stored: 3x10 < plan max 12 → does NOT progress", decision.outcome !== "progressed");
}

console.log("\n=== QA Bot 1: (2) Equipment Grid - Standing Calf Raises ===\n");

const STANDING_CALF_RAISE: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "calf",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

// Calf machine_generic (pin-stack, 5 kg steps): 40 → 45
{
  const calfId = "calf-machine";
  
  const stored = client.getProgress(USER_ID, calfId);
  const progress = {
    current_working_weight_kg: 40,
    current_target_reps: 12,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["machine_generic"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
      { reps: 12, weightKg: 40 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: STANDING_CALF_RAISE,
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, calfId, decision, state.totalSessions, "2026-10-25");
  
  check("Calf machine_generic 40 kg → 45 kg (5 kg step, NOT 41.25)", decision.nextWorkingWeightKg === 45, `${decision.nextWorkingWeightKg}`);
}

// Calf performed 45 kg → 50 (NOT 43.75)
{
  const calf2Id = "calf-performed-45";
  
  const stored = client.getProgress(USER_ID, calf2Id);
  const progress = {
    current_working_weight_kg: 40,
    current_target_reps: 12,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["machine_generic"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
      { reps: 12, weightKg: 45 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: STANDING_CALF_RAISE,
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, calf2Id, decision, state.totalSessions, "2026-10-25");
  
  check("Calf performed 45 kg → 50 kg (NOT 43.75)", decision.nextWorkingWeightKg === 50, `${decision.nextWorkingWeightKg}`);
}

console.log("\n=== QA Bot 1: (3) Heavier Actual Weight ===\n");

// Deadlift: stored 90, lifted 95 → 97.5
{
  const deadliftId = "deadlift-ex";
  
  const stored = client.getProgress(USER_ID, deadliftId);
  const progress = {
    current_working_weight_kg: 90,
    current_target_reps: 12,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 95 },
      { reps: 12, weightKg: 95 },
      { reps: 12, weightKg: 95 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "hinge",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, deadliftId, decision, state.totalSessions, "2026-10-25");
  
  check("Deadlift stored 90, lifted 95 → 97.5 (based on 95)", decision.nextWorkingWeightKg === 97.5, `${decision.nextWorkingWeightKg}`);
}

console.log("\n=== Missing Cases: Dips, Push-ups, Stored Below Min, Stored 0, Weighted Pull-ups ===\n");

// Dips (unloaded, dip bars)
{
  const dipsId = "dips-ex";
  
  const stored = client.getProgress(USER_ID, dipsId);
  const progress = {
    current_working_weight_kg: null,
    current_target_reps: 14,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["dip_bars"] }, null);
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 14, weightKg: 0 },
      { reps: 14, weightKg: 0 },
      { reps: 14, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "vertical_press",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, dipsId, decision, state.totalSessions, "2026-10-25");
  
  check("Dips (unloaded): 3x14 with stored 14 → progresses", decision.outcome === "progressed");
  check("Dips: next target 16", decision.nextTargetReps === 16);
}

// Push-ups: stored 26, cap at 2×repsMax = 24
{
  const pushupId = "pushup-cap";
  
  const stored = client.getProgress(USER_ID, pushupId);
  const progress = {
    current_working_weight_kg: null,
    current_target_reps: 26,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: [] }, null);
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 24, weightKg: 0 },
      { reps: 24, weightKg: 0 },
      { reps: 24, weightKg: 0 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, pushupId, decision, state.totalSessions, "2026-10-25");
  
  check("Push-ups stored 26 (cap 24): 3x24 → progresses to cap", decision.outcome === "progressed");
  check("Push-ups: next target writes as 24 (capped at 2×repsMax)", decision.nextTargetReps === 24);
}

// Stored below min
{
  const squatId = "squat-below-min";
  
  const stored = client.getProgress(USER_ID, squatId);
  const progress = {
    current_working_weight_kg: 80,
    current_target_reps: 6,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 80 },
      { reps: 12, weightKg: 80 },
      { reps: 12, weightKg: 80 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "squat",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, squatId, decision, state.totalSessions, "2026-10-25");
  
  check("Squat stored 6 < min 8: uses plan max 12, 3x12 → progresses", decision.outcome === "progressed");
  check("Squat: next weight 82.5", decision.nextWorkingWeightKg === 82.5);
}

// Stored 0
{
  const benchId = "bench-stored-0";
  
  const stored = client.getProgress(USER_ID, benchId);
  const progress = {
    current_working_weight_kg: 60,
    current_target_reps: 0,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["barbell"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, benchId, decision, state.totalSessions, "2026-10-25");
  
  check("Bench stored 0: uses plan max 12, 3x12 → progresses", decision.outcome === "progressed");
  check("Bench: next weight 62.5", decision.nextWorkingWeightKg === 62.5);
}

// Weighted pull-ups (dip_belt with added load)
{
  const pullupId = "pullup-weighted";
  
  const stored = client.getProgress(USER_ID, pullupId);
  const progress = {
    current_working_weight_kg: 10,
    current_target_reps: 14,
  };
  
  const progInputs = progressionInputsFromExercise({ equipment_ids: ["pull_up_bar", "dip_belt"] }, "kg");
  const state: ProgressState = {
    currentTargetReps: progress.current_target_reps,
    currentWorkingWeightKg: progress.current_working_weight_kg,
    consecutiveFailures: stored?.consecutive_failures ?? 0,
    bestWeightKg: stored?.best_weight_kg ?? null,
    bestReps: stored?.best_reps ?? null,
    bestE1rm: stored?.best_e1rm ?? null,
    totalSessions: stored?.total_sessions ?? 0,
  };
  
  const decision = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 10 },
      { reps: 12, weightKg: 10 },
      { reps: 12, weightKg: 10 },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "vertical_pull",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state,
    isDeload: false,
    ...progInputs,
  });
  
  await writeExerciseProgressCore(client, USER_ID, pullupId, decision, state.totalSessions, "2026-10-25");
  
  check("Weighted pull-ups (loaded, dip_belt): uses plan max 12, 3x12 → progresses", decision.outcome === "progressed");
  check("Weighted pull-ups: next weight 12.5", decision.nextWorkingWeightKg === 12.5);
}

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
console.log("✅ ALL QA BOT 1 FULL PATH TESTS PASSED\n");
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
