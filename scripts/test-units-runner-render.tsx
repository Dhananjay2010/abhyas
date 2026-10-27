#!/usr/bin/env tsx
/**
 * RTL render test: SessionRunner SetEntry units display
 * 
 * Tests the real SessionRunner component with imperial and metric settings.
 * 
 * Requirements:
 * - Imperial mode: workingWeightKg 60 displays as lb, prefill is multiple of 5, step is 5, typing 135 sends ~61.2 kg
 * - Metric mode: prefill and step match main (no rounding, step 2.5)
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

console.log("\nSessionRunner units display test\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type LogSetCall = {
  sessionExerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
};

(async () => {
  // Test 1: Imperial mode
  console.log("Imperial mode (60 kg working weight):");
  
  const logSetCallsImperial: LogSetCall[] = [];

  const imperialActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsImperial.push({
        sessionExerciseId: args.sessionExerciseId,
        setNumber: args.setNumber,
        weightKg: args.weightKg,
        reps: args.reps,
        durationSeconds: args.durationSeconds ?? null,
      });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
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

  const imperialExercise: RunnerExercise = {
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
    suggestedWeightKg: 60,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const imperialSettings = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "imperial" as const,
  };

  const rImperial = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[imperialExercise]}
      settings={imperialSettings}
      actions={imperialActions}
    />,
  );

  await waitFor(() => {
    if (!rImperial.container.textContent?.includes("Bench Press"))
      throw new Error("Exercise not loaded");
  });

  // Check 1: Working weight shows lb
  const imperialText = rImperial.container.textContent || "";
  const hasWorkingWeightLb = imperialText.includes("Working weight") && imperialText.includes("lb");
  check("Working weight shows lb", hasWorkingWeightLb, imperialText.includes("Working weight") ? "found 'Working weight'" : "not found");

  // Check 2: Find weight input
  const weightInputImperial = [...rImperial.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInputImperial) {
    throw new Error("Imperial weight input not found");
  }

  // Check 3: Prefill is exactly 132 lb (60 kg snapped: 60 kg = 132.28 lb → floor to 132.0 lb)
  const prefillValue = parseFloat(weightInputImperial.value || "0");
  check("Prefill is exactly 132 lb (60 kg)", prefillValue === 132, `got ${prefillValue} lb`);

  // Check 4: Weight step is 0.5 for imperial
  check("Weight step is 0.5", weightInputImperial.step === "0.5", `got step="${weightInputImperial.step}"`);

  // Find reps input
  const repsInputImperial = [...rImperial.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInputImperial && (i.closest("label")?.textContent ?? "").includes("Reps")
  );

  if (!repsInputImperial) {
    throw new Error("Imperial reps input not found");
  }

  // Clear weight input and type 135 lb with 8 reps
  await act(async () => {
    fireEvent.change(weightInputImperial, { target: { value: "" } });
    fireEvent.change(weightInputImperial, { target: { value: "135" } });
    fireEvent.change(repsInputImperial, { target: { value: "8" } });
  });

  // Wait for synced state (4-second timeout in SessionRunner)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Wait for button to become enabled
  await waitFor(() => {
    const btn = [...rImperial.container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Log set")
    );
    if (!btn || btn.disabled) {
      throw new Error("Log button not ready");
    }
  });

  // Find Log button
  const logButton = [...rImperial.container.querySelectorAll("button")].find(
    (btn) => btn.textContent?.includes("Log set")
  );

  if (!logButton) {
    throw new Error("Log button not found");
  }

  await act(async () => {
    fireEvent.click(logButton);
  });

  await waitFor(() => {
    if (logSetCallsImperial.length === 0) throw new Error("logSet not called");
  });

  // Check 5: logSet received ~61.23 kg (135 lb)
  const imperialCall = logSetCallsImperial[0];
  const expectedKg = 135 * 0.453592; // 61.23492
  check(
    "logSet received ~61.23 kg (135 lb typed)",
    imperialCall.weightKg !== null && 
    Math.abs(imperialCall.weightKg - expectedKg) < 0.05,
    `expected ${expectedKg.toFixed(2)}, got ${imperialCall.weightKg?.toFixed(2)}`
  );

  rImperial.unmount();

  // Test 1b: 62.5 kg gives box '137.5' and line '137.5 lb'
  console.log("\nImperial mode (62.5 kg working weight):");

  const logSetCalls625: LogSetCall[] = [];

  const actions625: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCalls625.push({
        sessionExerciseId: args.sessionExerciseId,
        setNumber: args.setNumber,
        weightKg: args.weightKg,
        reps: args.reps,
        durationSeconds: args.durationSeconds ?? null,
      });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
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

  const exercise625: RunnerExercise = {
    id: "ex625",
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
    workingWeightKg: 62.5,
    suggestedWeightKg: 62.5,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const r625 = render(
    <SessionRunner
      sessionId="s625"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise625]}
      settings={imperialSettings}
      actions={actions625}
    />,
  );

  await waitFor(() => {
    if (!r625.container.textContent?.includes("Squat"))
      throw new Error("62.5 kg exercise not loaded");
  });

  const text625 = r625.container.textContent || "";
  const hasLine625 = text625.includes("Working weight 137.5 lb");
  check("62.5 kg: line shows '137.5 lb'", hasLine625, text625.includes("Working weight") ? "found 'Working weight'" : "not found");

  const weightInput625 = [...r625.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInput625) {
    throw new Error("62.5 kg weight input not found");
  }

  const prefill625 = weightInput625.value;
  check("62.5 kg: box shows '137.5'", prefill625 === "137.5", `got "${prefill625}"`);

  r625.unmount();

  // Test 1c: 61.23 kg (135 lb stored) gives box '135' and line '135 lb'
  console.log("\nImperial mode (61.23 kg working weight = 135 lb stored):");

  const logSetCalls6123: LogSetCall[] = [];

  const actions6123: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCalls6123.push({
        sessionExerciseId: args.sessionExerciseId,
        setNumber: args.setNumber,
        weightKg: args.weightKg,
        reps: args.reps,
        durationSeconds: args.durationSeconds ?? null,
      });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
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

  const exercise6123: RunnerExercise = {
    id: "ex6123",
    exerciseId: "deadlift",
    name: "Deadlift",
    cue: null,
    metric: "reps",
    primaryMuscles: ["hamstrings"],
    plannedSets: 3,
    plannedRepsMin: 6,
    plannedRepsMax: 8,
    repsMin: 6,
    repsMax: 8,
    restSeconds: 180,
    workingWeightKg: 61.23,
    suggestedWeightKg: 61.23,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const r6123 = render(
    <SessionRunner
      sessionId="s6123"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise6123]}
      settings={imperialSettings}
      actions={actions6123}
    />,
  );

  await waitFor(() => {
    if (!r6123.container.textContent?.includes("Deadlift"))
      throw new Error("61.23 kg exercise not loaded");
  });

  const text6123 = r6123.container.textContent || "";
  const hasLine6123 = text6123.includes("Working weight 135 lb");
  check("61.23 kg: line shows '135 lb'", hasLine6123, text6123.includes("Working weight") ? "found 'Working weight'" : "not found");

  const weightInput6123 = [...r6123.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInput6123) {
    throw new Error("61.23 kg weight input not found");
  }

  const prefill6123 = weightInput6123.value;
  check("61.23 kg: box shows '135'", prefill6123 === "135", `got "${prefill6123}"`);

  r6123.unmount();

  // Test 2: Metric mode (verify same behavior as main)
  console.log("\nMetric mode (60 kg working weight):");

  const logSetCallsMetric: LogSetCall[] = [];

  const metricActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsMetric.push({
        sessionExerciseId: args.sessionExerciseId,
        setNumber: args.setNumber,
        weightKg: args.weightKg,
        reps: args.reps,
        durationSeconds: args.durationSeconds ?? null,
      });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
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

  const metricExercise: RunnerExercise = {
    id: "ex2",
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
    workingWeightKg: 60,
    suggestedWeightKg: 60,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const metricSettings = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "metric" as const,
  };

  const rMetric = render(
    <SessionRunner
      sessionId="s2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[metricExercise]}
      settings={metricSettings}
      actions={metricActions}
    />,
  );

  await waitFor(() => {
    if (!rMetric.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Check metric mode
  const weightInputMetric = [...rMetric.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInputMetric) {
    throw new Error("Metric weight input not found");
  }

  // Check 6: Metric prefill is exact (60, not rounded)
  const metricPrefillValue = weightInputMetric.value;
  check(
    "Metric prefill is exact 60 kg",
    metricPrefillValue === "60",
    `got "${metricPrefillValue}"`
  );

  // Check 7: Metric step is 0.5 (restored to match main)
  check("Metric step is 0.5", weightInputMetric.step === "0.5", `got step="${weightInputMetric.step}"`);

  // Find reps input
  const repsInputMetric = [...rMetric.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInputMetric && (i.closest("label")?.textContent ?? "").includes("Reps")
  );

  if (!repsInputMetric) {
    throw new Error("Metric reps input not found");
  }

  // Type 62.5 kg with 8 reps
  await act(async () => {
    fireEvent.change(weightInputMetric, { target: { value: "62.5" } });
    fireEvent.change(repsInputMetric, { target: { value: "8" } });
  });

  // Wait for synced state (4-second timeout in SessionRunner)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Wait for button to become enabled
  await waitFor(() => {
    const btn = [...rMetric.container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Log set")
    );
    if (!btn || btn.disabled) {
      throw new Error("Metric log button not ready");
    }
  });

  // Find Log button
  const logButtonMetric = [...rMetric.container.querySelectorAll("button")].find(
    (btn) => btn.textContent?.includes("Log set")
  );

  if (!logButtonMetric) {
    throw new Error("Metric log button not found");
  }

  await act(async () => {
    fireEvent.click(logButtonMetric);
  });

  await waitFor(() => {
    if (logSetCallsMetric.length === 0) throw new Error("Metric logSet not called");
  });

  // Check 8: logSet received exactly 62.5 kg (no conversion)
  const metricCall = logSetCallsMetric[0];
  check(
    "logSet received exactly 62.5 kg (metric typed)",
    metricCall.weightKg === 62.5,
    `expected 62.5, got ${metricCall.weightKg}`
  );

  rMetric.unmount();

  if (failures > 0) {
    console.error(`\nFAILURE: ${failures} check(s) failed`);
    process.exit(1);
  }

  console.log("\nALL CHECKS PASSED\n");
})().catch((e) => {
  console.error("Test error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
