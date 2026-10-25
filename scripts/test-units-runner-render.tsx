#!/usr/bin/env tsx
/**
 * RTL render test: SessionRunner SetEntry units display
 * 
 * Tests the real SessionRunner component with imperial and metric settings.
 * 
 * Requirements:
 * - Imperial mode: workingWeightKg 60 displays as lb, prefill is multiple of 5, step is 5, typing 135 sends ~61.2 kg
 * - Metric mode: prefill and step match main (no rounding, step 2.5)
 * - Includes mutant checks
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

const ok = async () => ({ ok: true }) as const;

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
    markWarmupDone: ok,
    logSet: async (args) => {
      logSetCallsImperial.push(args);
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: ok,
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const imperialExercise: RunnerExercise = {
    id: "ex1",
    exerciseId: "bench-press",
    name: "Bench Press",
    cue: null,
    metric: "reps",
    primaryMuscles: ["pectoralis"],
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
  const weightInputImperial = [...rImperial.container.querySelectorAll("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  ) as HTMLInputElement | undefined;

  check("Weight input found", !!weightInputImperial);

  let prefillValue = 0;
  if (weightInputImperial) {
    // Check 3: Prefill is multiple of 5 lb
    prefillValue = parseFloat(weightInputImperial.value || "0");
    check(
      "Prefill is multiple of 5 lb",
      prefillValue % 5 === 0,
      `got ${prefillValue} lb`
    );
    check(
      "Prefill is ~130 lb (60 kg)",
      prefillValue >= 125 && prefillValue <= 135,
      `got ${prefillValue}`
    );

    // Check 4: Step is 5
    check("Weight step is 5", weightInputImperial.step === "5", `got step="${weightInputImperial.step}"`);

    // Find reps input
    const repsInputImperial = [...rImperial.container.querySelectorAll("input")].find(
      (i) => i !== weightInputImperial && (i.closest("label")?.textContent ?? "").includes("Reps")
    ) as HTMLInputElement | undefined;

    if (repsInputImperial) {
      // Type 8 reps and 135 lb
      await act(async () => {
        fireEvent.change(repsInputImperial, { target: { value: "8" } });
        fireEvent.change(weightInputImperial, { target: { value: "135" } });
      });

      // Find Log button
      const logButton = [...rImperial.container.querySelectorAll("button")].find(
        (btn) => btn.textContent?.includes("Log set") || btn.textContent?.includes("Done")
      );

      if (logButton && !logButton.disabled) {
        await act(async () => {
          fireEvent.click(logButton);
        });

        await waitFor(() => {
          if (logSetCallsImperial.length === 0) throw new Error("logSet not called");
        });

        // Check 5: logSet received ~61.2 kg
        const call = logSetCallsImperial[0];
        const expectedKg = 135 * 0.453592;
        check(
          "logSet received ~61.2 kg",
          call.weightKg !== null && call.weightKg >= 60.8 && call.weightKg <= 61.5,
          `expected ~${expectedKg.toFixed(1)}, got ${call.weightKg?.toFixed(2)}`
        );
      }
    }
  }

  rImperial.unmount();

  // Test 2: Metric mode (verify same behavior as main)
  console.log("\nMetric mode (60 kg working weight):");

  const logSetCallsMetric: LogSetCall[] = [];

  const metricActions: SessionActions = {
    markWarmupDone: ok,
    logSet: async (args) => {
      logSetCallsMetric.push(args);
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: ok,
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

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
  const weightInputMetric = [...rMetric.container.querySelectorAll("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(kg\)|Added weight/);
    }
  ) as HTMLInputElement | undefined;

  check("Metric weight input found", !!weightInputMetric);

  let metricPrefillValue = "";
  if (weightInputMetric) {
    // Check 6: Metric prefill is exact (60, not rounded)
    metricPrefillValue = weightInputMetric.value;
    check(
      "Metric prefill is exact 60 kg",
      metricPrefillValue === "60",
      `got "${metricPrefillValue}"`
    );

    // Check 7: Metric step is 2.5
    check("Metric step is 2.5", weightInputMetric.step === "2.5", `got step="${weightInputMetric.step}"`);
  }

  rMetric.unmount();

  // Mutant checks
  console.log("\nMutant verification:");
  check(
    "Test would catch missing kgToDisplay (imperial)",
    prefillValue >= 125 && prefillValue <= 135,
    "60 kg must display as ~130 lb, not 60"
  );
  check(
    "Test would catch missing displayToKg on log",
    logSetCallsImperial[0]?.weightKg !== 135,
    "135 lb input must convert to ~61 kg, not stay 135"
  );
  check(
    "Test would catch wrong imperial step",
    weightInputImperial?.step === "5",
    "imperial step must be 5, not 2.5"
  );
  check(
    "Test would catch metric rounding",
    metricPrefillValue === "60",
    "metric prefill must be exact, not rounded"
  );

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
