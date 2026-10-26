#!/usr/bin/env tsx
/**
 * M1 (MEDIUM): Runner validation enforces unit-specific maxima.
 * 
 * RENDERS the real SessionRunner/SetEntry component to test validation wiring.
 * Tests that typing display values correctly validates through the full UI→kg→validate path.
 * 
 * - Imperial: types 600 lb → no alert, Log enabled; 1000 lb → alert '999 lb or less', Log disabled
 * - Imperial: prefilled 600 lb set → no alert, Log enabled
 * - Metric: 500 kg ok; 501 kg → alert '500 kg or less', Log disabled
 */

import "./helpers/setup-jsdom";
import { render, waitFor, fireEvent, act } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

console.log("\n🧪 M1: Runner validation (render test)\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type LogSetCall = {
  sessionExerciseId: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
};

(async () => {
  // ============================================================
  // Test 1: Imperial - 600 lb (ok)
  // ============================================================
  console.log("Imperial: typing 600 lb");

  const logSetCallsImperial600: LogSetCall[] = [];

  const actions600: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsImperial600.push({
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

  const exercise600: RunnerExercise = {
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
    workingWeightKg: 250,
    suggestedWeightKg: 250,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const settings600 = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "imperial" as const,
  };

  const r600 = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise600]}
      settings={settings600}
      actions={actions600}
    />,
  );

  await waitFor(() => {
    if (!r600.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Find inputs
  const weightInput600 = [...r600.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const repsInput600 = [...r600.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInput600 && (i.closest("label")?.textContent ?? "").includes("Reps")
  );
  
  if (!weightInput600 || !repsInput600) throw new Error("Inputs not found");

  // Type 600 lb
  await act(async () => {
    fireEvent.change(repsInput600, { target: { value: "8" } });
    fireEvent.change(weightInput600, { target: { value: "600" } });
  });

  // Wait for synced state (4-second timeout in SessionRunner)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Check: no alert
  const text600 = r600.container.textContent || "";
  const hasAlert600 = text600.includes("Weight should be") || text600.includes("lb or less") || text600.includes("kg or less");
  check("Imperial 600 lb: no alert", !hasAlert600, hasAlert600 ? `found alert in: ${text600}` : "");

  // Check: Log button enabled
  const logButton600 = [...r600.container.querySelectorAll("button")].find(
    (b) => b.textContent?.includes("Log set")
  );
  check("Imperial 600 lb: Log button enabled", logButton600 !== undefined && !logButton600.disabled, logButton600 ? (logButton600.disabled ? "button disabled" : "") : "button not found");

  // ============================================================
  // Test 2: Imperial - 1000 lb (rejected)
  // ============================================================
  console.log("\nImperial: typing 1000 lb");

  const logSetCallsImperial1000: LogSetCall[] = [];

  const actions1000: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsImperial1000.push({
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

  const exercise1000: RunnerExercise = {
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
    workingWeightKg: 250,
    suggestedWeightKg: 250,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const settings1000 = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "imperial" as const,
  };

  const r1000 = render(
    <SessionRunner
      sessionId="s2"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise1000]}
      settings={settings1000}
      actions={actions1000}
    />,
  );

  await waitFor(() => {
    if (!r1000.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Find inputs
  const weightInput1000 = [...r1000.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const repsInput1000 = [...r1000.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInput1000 && (i.closest("label")?.textContent ?? "").includes("Reps")
  );
  
  if (!weightInput1000 || !repsInput1000) throw new Error("Inputs not found");

  // Type 1000 lb
  await act(async () => {
    fireEvent.change(repsInput1000, { target: { value: "8" } });
    fireEvent.change(weightInput1000, { target: { value: "1000" } });
  });

  // Wait for synced state
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Check: alert present with exact message
  const text1000 = r1000.container.textContent || "";
  const hasAlert1000 = text1000.includes("Weight should be 999 lb or less.");
  check("Imperial 1000 lb: alert 'Weight should be 999 lb or less.'", hasAlert1000, hasAlert1000 ? "" : `got: ${text1000}`);

  // Check: Log button disabled
  const logButton1000 = [...r1000.container.querySelectorAll("button")].find(
    (b) => b.textContent?.includes("Log set")
  );
  check("Imperial 1000 lb: Log button disabled", logButton1000 !== undefined && logButton1000.disabled, logButton1000 ? (logButton1000.disabled ? "" : "button enabled") : "button not found");

  // ============================================================
  // Test 3: Imperial - prefilled 600 lb (ok)
  // ============================================================
  console.log("\nImperial: prefilled 600 lb set");

  const logSetCallsPrefilled: LogSetCall[] = [];

  const actionsPrefilled: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsPrefilled.push({
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

  const exercisePrefilled: RunnerExercise = {
    id: "ex3",
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
    workingWeightKg: 272.16,
    suggestedWeightKg: 272.16,
    status: "pending",
    feel: null,
    sets: [
      {
        setNumber: 1,
        weightKg: 272.16,
        reps: 8,
        durationSeconds: null,
      },
    ],
    isBodyweight: false,
  };

  const settingsPrefilled = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "imperial" as const,
  };

  const rPrefilled = render(
    <SessionRunner
      sessionId="s3"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercisePrefilled]}
      settings={settingsPrefilled}
      actions={actionsPrefilled}
    />,
  );

  await waitFor(() => {
    if (!rPrefilled.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Find inputs (prefilled weight should be 600 lb from 272.16 kg)
  const weightInputPrefilled = [...rPrefilled.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const repsInputPrefilled = [...rPrefilled.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInputPrefilled && (i.closest("label")?.textContent ?? "").includes("Reps")
  );
  
  if (!weightInputPrefilled || !repsInputPrefilled) throw new Error("Inputs not found");

  // Check prefilled value is 600 lb
  const prefilledValue = parseFloat(weightInputPrefilled.value || "0");
  check("Imperial prefilled: value is 600 lb", prefilledValue === 600, `got ${prefilledValue}`);

  // Type reps to complete the set
  await act(async () => {
    fireEvent.change(repsInputPrefilled, { target: { value: "8" } });
  });

  // Wait for synced state
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Check: no alert
  const textPrefilled = rPrefilled.container.textContent || "";
  const hasAlertPrefilled = textPrefilled.includes("Weight should be") || textPrefilled.includes("lb or less") || textPrefilled.includes("kg or less");
  check("Imperial prefilled 600 lb: no alert", !hasAlertPrefilled, hasAlertPrefilled ? `found alert in: ${textPrefilled}` : "");

  // Check: Log button enabled
  const logButtonPrefilled = [...rPrefilled.container.querySelectorAll("button")].find(
    (b) => b.textContent?.includes("Log set")
  );
  check("Imperial prefilled 600 lb: Log button enabled", logButtonPrefilled !== undefined && !logButtonPrefilled.disabled, logButtonPrefilled ? (logButtonPrefilled.disabled ? "button disabled" : "") : "button not found");

  // ============================================================
  // Test 4: Metric - 500 kg (ok)
  // ============================================================
  console.log("\nMetric: typing 500 kg");

  const logSetCallsMetric500: LogSetCall[] = [];

  const actionsMetric500: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsMetric500.push({
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

  const exerciseMetric500: RunnerExercise = {
    id: "ex4",
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
    workingWeightKg: 250,
    suggestedWeightKg: 250,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const settingsMetric500 = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "metric" as const,
  };

  const rMetric500 = render(
    <SessionRunner
      sessionId="s4"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exerciseMetric500]}
      settings={settingsMetric500}
      actions={actionsMetric500}
    />,
  );

  await waitFor(() => {
    if (!rMetric500.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Find inputs
  const weightInputMetric500 = [...rMetric500.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const repsInputMetric500 = [...rMetric500.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInputMetric500 && (i.closest("label")?.textContent ?? "").includes("Reps")
  );
  
  if (!weightInputMetric500 || !repsInputMetric500) throw new Error("Inputs not found");

  // Type 500 kg
  await act(async () => {
    fireEvent.change(repsInputMetric500, { target: { value: "8" } });
    fireEvent.change(weightInputMetric500, { target: { value: "500" } });
  });

  // Wait for synced state
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Check: no alert
  const textMetric500 = rMetric500.container.textContent || "";
  const hasAlertMetric500 = textMetric500.includes("Weight should be") || textMetric500.includes("lb or less") || textMetric500.includes("kg or less");
  check("Metric 500 kg: no alert", !hasAlertMetric500, hasAlertMetric500 ? `found alert in: ${textMetric500}` : "");

  // Check: Log button enabled
  const logButtonMetric500 = [...rMetric500.container.querySelectorAll("button")].find(
    (b) => b.textContent?.includes("Log set")
  );
  check("Metric 500 kg: Log button enabled", logButtonMetric500 !== undefined && !logButtonMetric500.disabled, logButtonMetric500 ? (logButtonMetric500.disabled ? "button disabled" : "") : "button not found");

  // ============================================================
  // Test 5: Metric - 501 kg (rejected)
  // ============================================================
  console.log("\nMetric: typing 501 kg");

  const logSetCallsMetric501: LogSetCall[] = [];

  const actionsMetric501: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (args) => {
      logSetCallsMetric501.push({
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

  const exerciseMetric501: RunnerExercise = {
    id: "ex5",
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
    workingWeightKg: 250,
    suggestedWeightKg: 250,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const settingsMetric501 = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "metric" as const,
  };

  const rMetric501 = render(
    <SessionRunner
      sessionId="s5"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exerciseMetric501]}
      settings={settingsMetric501}
      actions={actionsMetric501}
    />,
  );

  await waitFor(() => {
    if (!rMetric501.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  // Find inputs
  const weightInputMetric501 = [...rMetric501.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const repsInputMetric501 = [...rMetric501.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => i !== weightInputMetric501 && (i.closest("label")?.textContent ?? "").includes("Reps")
  );
  
  if (!weightInputMetric501 || !repsInputMetric501) throw new Error("Inputs not found");

  // Type 501 kg
  await act(async () => {
    fireEvent.change(repsInputMetric501, { target: { value: "8" } });
    fireEvent.change(weightInputMetric501, { target: { value: "501" } });
  });

  // Wait for synced state
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  // Check: alert present with exact message
  const textMetric501 = rMetric501.container.textContent || "";
  const hasAlertMetric501 = textMetric501.includes("Weight should be 500 kg or less.");
  check("Metric 501 kg: alert 'Weight should be 500 kg or less.'", hasAlertMetric501, hasAlertMetric501 ? "" : `got: ${textMetric501}`);

  // Check: Log button disabled
  const logButtonMetric501 = [...rMetric501.container.querySelectorAll("button")].find(
    (b) => b.textContent?.includes("Log set")
  );
  check("Metric 501 kg: Log button disabled", logButtonMetric501 !== undefined && logButtonMetric501.disabled, logButtonMetric501 ? (logButtonMetric501.disabled ? "" : "button enabled") : "button not found");

  // ============================================================
  // Final report
  // ============================================================
  if (failures === 0) {
    console.log("\n✅ All checks passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} check(s) failed\n`);
    process.exit(1);
  }
})();
