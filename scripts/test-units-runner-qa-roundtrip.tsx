#!/usr/bin/env tsx
/**
 * (B) QA round-trip test: store displayToKg(X) as working weight,
 * render SessionRunner (imperial), assert box === String(X) and line shows `${X} lb`.
 *
 * Tests X in [20, 135, 137.5, 225.5, 315].
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";
import { displayToKg } from "../src/lib/units";

console.log("\n(B) QA round-trip test: store displayToKg(X), render shows X\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const mockActions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => ({ ok: true }),
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

const imperialSettings = {
  perSetLogging: true,
  restAutostart: false,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: false,
  units: "imperial" as const,
};

const testValues = [20, 135, 137.5, 225.5, 315];

(async () => {
for (const lbValue of testValues) {
  console.log(`\nTesting ${lbValue} lb:`);

  // Store as kg (simulate what happens when user logs this weight)
  const storedKg = displayToKg(lbValue, "imperial");
  console.log(`  Stored: ${storedKg.toFixed(2)} kg`);

  const testExercise: RunnerExercise = {
    id: `ex-${lbValue}`,
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
    workingWeightKg: storedKg,
    suggestedWeightKg: storedKg,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const r = render(
    <SessionRunner
      sessionId={`test-${lbValue}`}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[testExercise]}
      settings={imperialSettings}
      actions={mockActions}
    />,
  );

  await waitFor(() => {
    if (!r.container.textContent?.includes("Bench Press"))
      throw new Error("Exercise not loaded");
  });

  const containerText = r.container.textContent || "";

  // Find the input box
  const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
    (i) => {
      const label = i.closest("label")?.textContent ?? "";
      return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
    }
  );

  if (!weightInput) {
    console.error(`  ❌ FAIL: Weight input not found for ${lbValue} lb`);
    failures++;
    r.unmount();
    continue;
  }

  const boxValue = weightInput.value;
  const expectedBox = String(lbValue);

  check(
    `Box value === "${expectedBox}"`,
    boxValue === expectedBox,
    `got "${boxValue}"`
  );

  // Find the working weight line
  const expectedLine = `${lbValue} lb`;
  const linePresent = containerText.includes(`Working weight ${expectedLine}`);

  check(
    `Line shows "Working weight ${expectedLine}"`,
    linePresent,
    linePresent ? "found" : "not found"
  );

  r.unmount();
}

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed\n`);
  process.exit(1);
}

console.log("\n✅ All round-trip values pass\n");
})().catch((e) => {
  console.error("Test error:", e.message);
  console.error(e.stack);
  process.exit(1);
});
