#!/usr/bin/env tsx
/**
 * M1 Wiring test: Runner prescription flooring and logged-weight rounding.
 * 
 * Tests that session-runner.tsx handles prescriptions and logged weights correctly:
 * - Prescriptions (no logged sets): FLOOR to 0.5 lb (62.5 kg → 137.5 lb, not 138 lb)
 * - Logged weights: round to NEAREST 0.5 lb (62.75 kg → 138.5 lb)
 * - Unedited submit: preserves exact original kg
 * - Edited submit: converts typed display value
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

console.log("\n=== M1 Runner Wiring: prescription floor vs logged-weight rounding ===\n");

(async () => {
  // Test 1: Prescription 62.5 kg → floored 137.5 lb, submits exact 62.5 kg
  console.log("\nTest 1: Prescription 62.5 kg (floored to 137.5 lb)");
  {
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
      workingWeightKg: 62.5,
      suggestedWeightKg: 62.5,
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
      const workingWeightLine = r.container.querySelector("[data-testid='working-weight-line']");
      if (!workingWeightLine) throw new Error("Working weight line not found");
    }, { timeout: 5000 });

    const workingWeightLine = r.container.querySelector<HTMLElement>("[data-testid='working-weight-line']");
    const workingWeightText = workingWeightLine?.textContent || "";
    check("Working weight line shows 137.5 lb (floored)", workingWeightText.includes("137.5 lb"),
      `found: "${workingWeightText}"`);

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    if (!weightInput) throw new Error("Weight input not found");

    check("Prefill shows 137.5 (floored)", weightInput.value === "137.5",
      `got "${weightInput.value}"`);

    const repsInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.includes("Reps")
    );
    if (!repsInput) throw new Error("Reps input not found");

    await act(async () => {
      fireEvent.change(repsInput, { target: { value: "7" } });
    });

    const logSetButton = r.container.querySelector<HTMLButtonElement>("[data-testid='log-set-button']");
    if (!logSetButton) throw new Error("Log Set button not found");

    capturedWeightKg = null;
    await act(async () => {
      fireEvent.click(logSetButton);
    });

    // Give React time to process the click
    await waitFor(() => {
      if (capturedWeightKg === null) throw new Error("logSet not called yet");
    }, { timeout: 1000 });

    check("Unedited prescription submits exact 62.5 kg", capturedWeightKg === 62.5,
      capturedWeightKg === null ? "logSet not called" : `got ${capturedWeightKg}`);

    r.unmount();
  }

  // Test 2: Prescription 72.5 kg → floored 159.5 lb, submits exact 72.5 kg
  console.log("\nTest 2: Prescription 72.5 kg (floored to 159.5 lb)");
  {
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
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 3,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 180,
      workingWeightKg: 72.5,
      suggestedWeightKg: 72.5,
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
      const workingWeightLine = r.container.querySelector("[data-testid='working-weight-line']");
      if (!workingWeightLine) throw new Error("Working weight line not found");
    }, { timeout: 5000 });

    const workingWeightLine = r.container.querySelector<HTMLElement>("[data-testid='working-weight-line']");
    const workingWeightText = workingWeightLine?.textContent || "";
    check("Working weight line shows 159.5 lb (floored)", workingWeightText.includes("159.5 lb"),
      `found: "${workingWeightText}"`);

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    if (!weightInput) throw new Error("Weight input not found");

    check("Prefill shows 159.5 (floored)", weightInput.value === "159.5",
      `got "${weightInput.value}"`);

    const repsInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.includes("Reps")
    );
    if (!repsInput) throw new Error("Reps input not found");

    await act(async () => {
      fireEvent.change(repsInput, { target: { value: "7" } });
    });

    const logSetButton = r.container.querySelector<HTMLButtonElement>("[data-testid='log-set-button']");
    if (!logSetButton) throw new Error("Log Set button not found");

    capturedWeightKg = null;
    await act(async () => {
      fireEvent.click(logSetButton);
    });

    await waitFor(() => {
      if (capturedWeightKg === null) throw new Error("logSet not called yet");
    }, { timeout: 1000 });

    check("Unedited prescription submits exact 72.5 kg", capturedWeightKg === 72.5,
      capturedWeightKg === null ? "logSet not called" : `got ${capturedWeightKg}`);

    r.unmount();
  }

  // Test 3: Prescription 40 kg → floored 88 lb, submits exact 40 kg
  console.log("\nTest 3: Prescription 40 kg (floored to 88 lb)");
  {
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
      exerciseId: "row",
      name: "Row",
      cue: null,
      metric: "reps",
      primaryMuscles: ["lats"],
      plannedSets: 3,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 180,
      workingWeightKg: 40,
      suggestedWeightKg: 40,
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
      const workingWeightLine = r.container.querySelector("[data-testid='working-weight-line']");
      if (!workingWeightLine) throw new Error("Working weight line not found");
    }, { timeout: 5000 });

    const workingWeightLine = r.container.querySelector<HTMLElement>("[data-testid='working-weight-line']");
    const workingWeightText = workingWeightLine?.textContent || "";
    check("Working weight line shows 88 lb (floored)", workingWeightText.includes("88 lb"),
      `found: "${workingWeightText}"`);

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    if (!weightInput) throw new Error("Weight input not found");

    check("Prefill shows 88 (floored)", weightInput.value === "88",
      `got "${weightInput.value}"`);

    const repsInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.includes("Reps")
    );
    if (!repsInput) throw new Error("Reps input not found");

    await act(async () => {
      fireEvent.change(repsInput, { target: { value: "7" } });
    });

    const logSetButton = r.container.querySelector<HTMLButtonElement>("[data-testid='log-set-button']");
    if (!logSetButton) throw new Error("Log Set button not found");

    capturedWeightKg = null;
    await act(async () => {
      fireEvent.click(logSetButton);
    });

    await waitFor(() => {
      if (capturedWeightKg === null) throw new Error("logSet not called yet");
    }, { timeout: 1000 });

    check("Unedited prescription submits exact 40 kg", capturedWeightKg === 40,
      capturedWeightKg === null ? "logSet not called" : `got ${capturedWeightKg}`);

    r.unmount();
  }

  // Test 4: Logged weight 62.75 kg → rounded to nearest 138.5 lb
  console.log("\nTest 4: Logged weight 62.75 kg (rounded to 138.5 lb, not floored)");
  {
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
      workingWeightKg: 62.5,
      suggestedWeightKg: 62.5,
      status: "pending",
      feel: null,
      sets: [{ setNumber: 1, weightKg: 62.75, reps: 7, durationSeconds: null }], // Logged set!
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
      const setNumber = r.container.textContent?.includes("Set 2");
      if (!setNumber) throw new Error("Set 2 not rendered");
    }, { timeout: 5000 });

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    if (!weightInput) throw new Error("Weight input not found");

    check("Logged weight prefill shows 138.5 (rounded to nearest, not floored)", weightInput.value === "138.5",
      `got "${weightInput.value}"`);

    r.unmount();
  }

  // Test 5: Edited weight converts typed value
  console.log("\nTest 5: Edited weight converts typed display value");
  {
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
      workingWeightKg: 62.5,
      suggestedWeightKg: 62.5,
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
      const workingWeightLine = r.container.querySelector("[data-testid='working-weight-line']");
      if (!workingWeightLine) throw new Error("Working weight line not found");
    }, { timeout: 5000 });

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    if (!weightInput) throw new Error("Weight input not found");

    // Edit the weight to 140 lb
    await act(async () => {
      fireEvent.change(weightInput, { target: { value: "140" } });
    });

    const repsInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.includes("Reps")
    );
    if (!repsInput) throw new Error("Reps input not found");

    await act(async () => {
      fireEvent.change(repsInput, { target: { value: "7" } });
    });

    const logSetButton = r.container.querySelector<HTMLButtonElement>("[data-testid='log-set-button']");
    if (!logSetButton) throw new Error("Log Set button not found");

    capturedWeightKg = null;
    await act(async () => {
      fireEvent.click(logSetButton);
    });

    await waitFor(() => {
      if (capturedWeightKg === null) throw new Error("logSet not called yet");
    }, { timeout: 1000 });

    // 140 lb → 63.5029 kg, rounded to 0.5 lb grid = 140 lb → 63.5 kg
    const expected = 63.5;
    const tolerance = 0.1;
    const withinTolerance = capturedWeightKg !== null && Math.abs(capturedWeightKg - expected) < tolerance;
    check(`Edited 140 lb converts to ~${expected} kg`, withinTolerance,
      capturedWeightKg === null ? "logSet not called" : `got ${capturedWeightKg}, expected ${expected}`);

    r.unmount();
  }

  if (failures === 0) {
    console.log(`\n✓ All wiring tests passed\n`);
    process.exit(0);
  } else {
    console.log(`\n✗ ${failures} test(s) failed\n`);
    process.exit(1);
  }
})().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
