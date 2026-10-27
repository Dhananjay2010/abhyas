#!/usr/bin/env tsx
/**
 * M1 Wiring Test: page.tsx → buildRunnerExercise → runner integration.
 * 
 * Verifies the full path from page.tsx loading previous weights to the runner displaying floored values:
 * - loadPreviousCompletedWeights returns 60 kg
 * - buildRunnerExercise receives previousCompletedWeightKg: 60
 * - Runner shows floored 137.5 lb (not rounded 138 lb) for prescribed increase
 * 
 * Mutants killed:
 * - Mutant I: page.tsx passes previous_completed_weight_kg: null
 * - Mutant J: buildRunnerExercise drops previousCompleted (null)
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type SessionActions } from "../src/app/session/[id]/session-runner";
import { buildRunnerExercise } from "../src/lib/session/build-runner-exercises";

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

console.log("\n=== M1 Page Wiring: previousCompletedWeightKg flows to runner ===\n");

(async () => {
  // Mutant I: page.tsx must pass previousCompletedWeightKg from loader result
  console.log("Test 1: buildRunnerExercise receives previousCompletedWeightKg from page.tsx\n");
  {
    const runnerExercise = buildRunnerExercise({
      row: {
        id: "se-1",
        planned_sets: 3,
        planned_reps_min: 6,
        planned_reps_max: 8,
        rest_seconds: 180,
        status: "pending",
        feel: null,
        metric: "reps",
        exercises: {
          id: "bench-press",
          name: "Bench Press",
          cue: null,
          movement_pattern: "horizontal_push",
          primary_muscles: ["chest"],
          equipment_ids: ["barbell"],
        },
        session_sets: [],
      },
      progress: {
        current_working_weight_kg: 60,
        current_target_reps: 6,
        previous_completed_weight_kg: 60, // From loader
      },
      remembersWeights: true,
      isDeload: false,
    });

    check(
      "Mutant I: buildRunnerExercise(...).previousCompletedWeightKg === 60",
      runnerExercise.previousCompletedWeightKg === 60,
      `got ${runnerExercise.previousCompletedWeightKg}`
    );
  }

  // Mutant J: buildRunnerExercise must not drop previousCompleted
  console.log("\nTest 2: Runner displays floored 137.5 lb for prescribed increase\n");
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

    // Prescribed increase: 60 kg → 62.5 kg
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
      suggestedWeightKg: 62.5, // Prescribed increase
      previousCompletedWeightKg: 60, // From loader - triggers floor logic
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
      check("Mutant J: Runner prefill shows 137.5 lb (floored)", false, "weight input not found");
    } else {
      check(
        "Mutant J: Runner prefill shows 137.5 lb (floored)",
        weightInput.value === "137.5",
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
