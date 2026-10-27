#!/usr/bin/env tsx
/**
 * M1: Test page.tsx mapping helper that attaches previousCompletedWeightKg.
 * 
 * Verifies that buildRunnerExercisesWithPreviousWeights correctly flows loader results
 * to buildRunnerExercise and the runner displays floored values for prescribed increases.
 * 
 * Mutants killed:
 * - Mutant I: page.tsx mapping drops previous_completed_weight_kg (passes null)
 * - Mutant K: runner drops `!hasLoggedWeightThisExercise &&` check (floor applies after logging)
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type SessionActions } from "../src/app/session/[id]/session-runner";
import { buildRunnerExercisesWithPreviousWeights } from "../src/lib/session/build-runner-exercises-with-previous-weights";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? `  -- ${detail}` : ""}`);
    failed++;
  }
}

console.log("\n=== M1 Page Mapping: buildRunnerExercisesWithPreviousWeights ===\n");

(async () => {
  // Test Mutant I: page.tsx mapping must pass previousCompletedWeightKg from loader
  console.log("Test Mutant I: page.tsx mapping attaches previousCompletedWeightKg\n");
  {
    const rows = [{
      id: "se-1",
      planned_sets: 3,
      planned_reps_min: 6,
      planned_reps_max: 8,
      rest_seconds: 180,
      status: "pending" as const,
      feel: null,
      metric: "reps" as const,
      exercises: {
        id: "ex-1",
        name: "Bench Press",
        cue: null,
        movement_pattern: "horizontal_press" as const,
        primary_muscles: ["chest"] as const,
        equipment_ids: ["barbell"],
      },
      session_sets: [],
    }];

    const progressByExercise = new Map([
      ["ex-1", {
        current_working_weight_kg: 60,
        current_target_reps: 6,
      }]
    ]);

    const previousWeightByExercise = new Map([
      ["ex-1", 60] // From loader
    ]);

    const exercises = buildRunnerExercisesWithPreviousWeights({
      rows,
      progressByExercise,
      previousWeightByExercise,
      remembersWeights: true,
      isDeload: false,
    });

    check(
      "Mutant I: mapping attaches previousCompletedWeightKg from loader",
      exercises[0].previousCompletedWeightKg === 60,
      `got ${exercises[0].previousCompletedWeightKg}`
    );

    check(
      "Mutant I: prescribed increase 60→62.5 kg exists",
      exercises[0].suggestedWeightKg === 62.5,
      `got ${exercises[0].suggestedWeightKg}`
    );
  }

  // Test runner displays floored 137.5 lb for prescribed increase
  console.log("\nTest Mutant I: Runner floors prescribed increase to 137.5 lb\n");
  {
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true }),
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => ({ ok: true, data: { outcome: "hold", message: "", personalBest: null } }),
      finishSession: async () => ({ ok: true, data: { status: "completed", durationSeconds: null } }),
      abandonSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      swapExercise: async () => ({ 
        ok: true, 
        data: { 
          workoutSessionExerciseId: "", 
          exerciseId: "", 
          metric: "reps",
          repsMin: null,
          repsMax: null,
          equipmentIds: [],
          weightPrefill: null,
          workingWeightKg: null,
          currentTargetReps: null,
          isBodyweight: false,
        } 
      }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      getSessionSummary: async () => ({ ok: true, data: [] }),
    };

    const settings = {
      perSetLogging: true,
      restAutostart: false,
      restSound: false,
      restVibrate: false,
      restOverrideSeconds: null,
      cooldownEnabled: false,
      units: "imperial" as const,
    };

    const exercise: RunnerExercise = {
      id: "ex1",
      exerciseId: "bench-press",
      name: "Bench Press",
      cue: null,
      metric: "reps",
      primaryMuscles: ["chest"],
      plannedSets: 3,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 180,
      workingWeightKg: 60,
      suggestedWeightKg: 62.5,
      previousCompletedWeightKg: 60, // From loader - triggers floor
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false,
    };

    const r = render(
      <SessionRunner
        sessionId="s1"
        userId="test-user"
        sessionStatus="in_progress"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[exercise]}
        settings={settings}
        actions={actions}
      />
    );

    await waitFor(() => {
      const prefill = r.container.querySelector<HTMLInputElement>('input[type="number"]');
      if (!prefill) throw new Error("Weight input not found");
    }, { timeout: 5000 });

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)/)
    );
    
    if (!weightInput) {
      check("Mutant I: Runner floors 62.5 kg to 137.5 lb", false, "weight input not found");
    } else {
      check(
        "Mutant I: Runner floors 62.5 kg to 137.5 lb",
        weightInput.value === "137.5",
        `got "${weightInput.value}"`
      );
    }
  }

  // Test Mutant K: after logging a set, next set still rounds (not floors)
  console.log("\nTest Mutant K: After logging set, next prefill rounds to nearest\n");
  {
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true }),
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => ({ ok: true, data: { outcome: "hold", message: "", personalBest: null } }),
      finishSession: async () => ({ ok: true, data: { status: "completed", durationSeconds: null } }),
      abandonSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true }),
      refreshAfterSession: async () => ({ ok: true }),
      swapExercise: async () => ({ 
        ok: true, 
        data: { 
          workoutSessionExerciseId: "", 
          exerciseId: "", 
          metric: "reps",
          repsMin: null,
          repsMax: null,
          equipmentIds: [],
          weightPrefill: null,
          workingWeightKg: null,
          currentTargetReps: null,
          isBodyweight: false,
        } 
      }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      getSessionSummary: async () => ({ ok: true, data: [] }),
    };

    const settings = {
      perSetLogging: true,
      restAutostart: false,
      restSound: false,
      restVibrate: false,
      restOverrideSeconds: null,
      cooldownEnabled: false,
      units: "imperial" as const,
    };

    // Set 1 already logged at 62.75 kg
    const exercise: RunnerExercise = {
      id: "ex1",
      exerciseId: "bench-press",
      name: "Bench Press",
      cue: null,
      metric: "reps",
      primaryMuscles: ["chest"],
      plannedSets: 3,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 180,
      workingWeightKg: 60,
      suggestedWeightKg: 62.5,
      previousCompletedWeightKg: 60,
      status: "in_progress",
      feel: null,
      sets: [
        { setNumber: 1, reps: 7, weightKg: 62.75, durationSeconds: null }, // Already logged
      ],
      isBodyweight: false,
    };

    const r = render(
      <SessionRunner
        sessionId="s1"
        userId="test-user"
        sessionStatus="in_progress"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[exercise]}
        settings={settings}
        actions={actions}
      />
    );

    await waitFor(() => {
      const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
        (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)/)
      );
      if (!weightInput) throw new Error("Weight input not found");
    }, { timeout: 5000 });

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)/)
    );
    
    if (!weightInput) {
      check("Mutant K: Set 2 prefill rounds 62.75 kg to 138.5 lb (not floors)", false, "weight input not found");
    } else {
      check(
        "Mutant K: Set 2 prefill rounds 62.75 kg to 138.5 lb (not floors)",
        weightInput.value === "138.5",
        `got "${weightInput.value}"`
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
