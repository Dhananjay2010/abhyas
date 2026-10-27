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
import { render, waitFor, fireEvent, act } from "@testing-library/react";
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
  { kg: 72.5, expectedPrefill: "160", expectedLine: "160 lb", desc: "72.5 kg" },
  // QA demo rehearsal: 40 kg → 88 lb, unedited submit must save exactly 40 kg (not 39.92)
  { kg: 40, expectedPrefill: "88", expectedLine: "88 lb", desc: "40 kg (QA: e1RM preservation)" },
];

(async () => {
  for (const { kg, expectedPrefill, expectedLine, desc } of testCases) {
    let capturedWeightKg: number | null = null;
    
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async (data) => {
        capturedWeightKg = data.weightKg;
        return { ok: true as const };
      },
      deleteSet: async () => ({ ok: true as const }),
      finishExercise: async () => ({
        ok: true as const,
        data: { outcome: "hold", message: "", personalBest: null },
      }),
      finishSession: async () => ({
        ok: true as const,
        data: { status: "completed" as const, durationSeconds: null },
      }),
      abandonSession: async () => ({ ok: true as const }),
      planDay: async () => ({ ok: true as const }),
      refreshAfterSession: async () => ({ ok: true as const }),
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

    // Wait for component to sync (markSynced is called after 4s timeout)
    await new Promise(resolve => setTimeout(resolve, 4500));

    // Check working weight line using data-testid for precision
    const workingWeightLine = r.container.querySelector<HTMLElement>("[data-testid='working-weight-line']");
    
    if (!workingWeightLine) {
      check(`${desc}: Working weight line found`, false, "element not found");
      r.unmount();
      continue;
    }
    
    const workingWeightText = workingWeightLine.textContent || "";
    const hasCorrectWeight = workingWeightText.includes(expectedLine);
    
    check(
      `${desc}: Working weight line shows "${expectedLine}"`, 
      hasCorrectWeight,
      hasCorrectWeight ? "" : `found: "${workingWeightText}"`
    );
    
    // Check weight input prefill
    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );

    if (!weightInput) {
      check(`${desc}: Weight input found`, false, "input not found");
      r.unmount();
      continue;
    }

    const prefillValue = weightInput.value;
    check(`${desc}: Weight input prefill is "${expectedPrefill}"`, prefillValue === expectedPrefill,
      `expected "${expectedPrefill}", got "${prefillValue}"`);
    
    // Test unedited submit: press Log Set button and verify what logSet receives
    // Fill in reps first (required for per-set logging)
    const repsInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.includes("Reps")
    );
    
    if (!repsInput) {
      check(`${desc}: Reps input found`, false, "input not found");
      r.unmount();
      continue;
    }
    
    // Change reps value and wait for state update
    await act(async () => {
      fireEvent.change(repsInput, { target: { value: "7" } });
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // Find Log Set button by data-testid
    const logSetButton = r.container.querySelector<HTMLButtonElement>("[data-testid='log-set-button']");
    
    if (!logSetButton) {
      check(`${desc}: Log Set button found`, false, "button not found");
      r.unmount();
      continue;
    }
    
    // Try to click the button
    capturedWeightKg = null;
    await act(async () => {
      fireEvent.click(logSetButton);
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    
    // Verify the button click worked and submitted the correct value
    check(
      `${desc}: Log Set button click submits original ${kg} kg exactly`,
      capturedWeightKg === kg,
      capturedWeightKg === null 
        ? "button click did not trigger logSet (test env limitation with async React state)"
        : `expected ${kg}, got ${capturedWeightKg}`
    );
    
    r.unmount();
  }

  if (failures === 0) {
    console.log(`\n✓ All ${testCases.length * 3} wiring tests passed\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
})();
