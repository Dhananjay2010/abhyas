#!/usr/bin/env tsx
/**
 * M1 Wiring test: Runner prefill and working weight must use stored kg directly (not floored).
 * 
 * Tests that session-runner.tsx's lastWeight calculation flows through correctly:
 * - lastWeight = suggestedWeightKg (NOT snapPrescribedWeight(suggestedWeightKg))
 * - This lastWeight is passed to computeRunnerWeightPrefill
 * - Result: stored weights display at nearest 0.5 lb, not floored
 * 
 * Critical test case: 62.75 kg
 * - Correct (nearest): 62.75 kg = 138.35 lb → 138.5 lb
 * - Mutant (floored):  62.75 kg = 138.35 lb → 138.0 lb
 * 
 * Kills mutant: session-runner.tsx line ~733 reverts lastWeight to snapPrescribedWeight
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== M1 Runner Wiring: stored kg → nearest 0.5 lb (not floored) ===\n");

const testCases = [
  // Critical case: tests rounding vs flooring
  { kg: 62.75, expectedPrefill: "138.5", expectedLine: "138.5 lb", desc: "62.75 kg (critical: rounds up, not down)" },
  // Additional cases for coverage
  { kg: 72.5, expectedPrefill: "160", expectedWorking: "160 lb", desc: "72.5 kg" },
  { kg: 85, expectedPrefill: "187.5", expectedWorking: "187.5 lb", desc: "85 kg" },
  { kg: 62.5, expectedPrefill: "138", expectedWorking: "138 lb", desc: "62.5 kg" },
];

(async () => {
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true }),
    refreshAfterSession: async () => ({ ok: true }),
    swapExercise: async () => ({ 
      ok: true, 
      data: { 
        workoutSessionExerciseId: "", 
        exerciseId: "",
        metric: "reps" as const,
        repsMin: null,
        repsMax: null,
        equipmentIds: [],
        weightPrefill: null,
        workingWeightKg: null,
        currentTargetReps: null,
        isBodyweight: false,
      } 
    }),
    findAlternatives: async () => ({ ok: true as const, data: [] }),
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
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

  for (const { kg, expectedPrefill, expectedLine, expectedWorking, desc } of testCases) {
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
      workingWeightKg: kg,
      suggestedWeightKg: kg,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false,
    };

    const r = render(
      <SessionRunner
        sessionId="s1"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[exercise]}
        settings={settings}
        actions={actions}
      />,
    );

    await waitFor(() => {
      if (!r.container.textContent?.includes("Bench Press"))
        throw new Error("Exercise not loaded");
    });

    const text = r.container.textContent || "";
    
    // Check working weight line
    const workingLine = expectedLine || expectedWorking || "";
    const hasWorkingWeight = text.includes("Working weight") && text.includes(workingLine);
    check(`${desc}: Working weight line shows "${workingLine}"`, hasWorkingWeight, 
      hasWorkingWeight ? "" : `text includes: ${text.slice(0, 200)}`);
    
    // Check weight input prefill
    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );

    if (!weightInput) {
      check(`${desc}: Weight input found`, false, "input not found");
      continue;
    }

    const prefillValue = weightInput.value;
    check(`${desc}: Weight input prefill is "${expectedPrefill}"`, prefillValue === expectedPrefill,
      `expected "${expectedPrefill}", got "${prefillValue}"`);
    
    r.unmount();
  }

  // Test unedited submit (using weightKgToSubmit directly)
  const { weightKgToSubmit } = await import("../src/lib/units");
  
  for (const { kg, expectedPrefill, desc } of testCases) {
    const submitted = weightKgToSubmit(expectedPrefill, expectedPrefill, kg, "imperial");
    check(
      `${desc}: unedited prefill submits original ${kg} kg exactly`,
      submitted === kg,
      `expected ${kg}, got ${submitted}`
    );
  }

  if (failures === 0) {
    console.log(`\n✓ All ${testCases.length * 3} wiring tests passed\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
})();
