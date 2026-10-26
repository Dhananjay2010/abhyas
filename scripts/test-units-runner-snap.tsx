#!/usr/bin/env tsx
/**
 * S6/S7: Runner working weight line and prefill must use snapped values.
 * 
 * RENDERS the real SessionRunner to test that:
 * - S6: Visible "Working weight" line shows "137.5 lb" (not 138 or 137.8)
 * - S7: Weight input prefill value is 137.5 (not 138 or 137.8)
 * 
 * For a 62.5 kg prescription with imperial units:
 * Raw: 62.5 kg → 137.7890... lb
 * Snapped: 137.5 lb
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

console.log("\n🧪 S6/S7: Runner snap test (render)\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {
  // ============================================================
  // Test: 62.5 kg prescription for imperial user
  // ============================================================
  console.log("Imperial: 62.5 kg prescription");

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

  const settings = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "imperial" as const,
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

  // S6: Check visible "Working weight" line
  const text = r.container.textContent || "";
  const hasWorkingWeight = text.includes("Working weight");
  check("S6: 'Working weight' text present", hasWorkingWeight);
  
  if (hasWorkingWeight) {
    // Extract the line containing "Working weight" and check for "137.5 lb"
    const lines = text.split(/\n|(?=Working weight)/);
    const workingWeightLine = lines.find(l => l.includes("Working weight"));
    const hasSnappedValue = workingWeightLine?.includes("137.5") && workingWeightLine?.includes("lb");
    check("S6: Working weight line shows '137.5 lb'", hasSnappedValue ?? false, workingWeightLine ? `got: "${workingWeightLine}"` : "line not found");
  }

  // S7: Check weight input prefill value
  const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInput) {
    throw new Error("Weight input not found");
  }

  const prefillValue = parseFloat(weightInput.value || "0");
  check("S7: Weight input value is exactly 137.5", prefillValue === 137.5, `got ${prefillValue}`);

  // ============================================================
  // Additional test: 100 kg → 220 lb
  // ============================================================
  console.log("\nImperial: 100 kg prescription");

  const exercise100: RunnerExercise = {
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
    workingWeightKg: 100,
    suggestedWeightKg: 100,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const r100 = render(
    <SessionRunner
      sessionId="s2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise100]}
      settings={settings}
      actions={actions}
    />,
  );

  await waitFor(() => {
    if (!r100.container.textContent?.includes("Squat"))
      throw new Error("Exercise not loaded");
  });

  const text100 = r100.container.textContent || "";
  const workingWeightLine100 = text100.split(/\n|(?=Working weight)/).find(l => l.includes("Working weight"));
  const hasSnappedValue100 = workingWeightLine100?.includes("220") && workingWeightLine100?.includes("lb");
  check("100 kg: Working weight line shows '220 lb'", hasSnappedValue100 ?? false, workingWeightLine100 ? `got: "${workingWeightLine100}"` : "");

  const weightInput100 = [...r100.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );
  const prefillValue100 = parseFloat(weightInput100?.value || "0");
  check("100 kg: Weight input value is 220", prefillValue100 === 220, `got ${prefillValue100}`);

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
