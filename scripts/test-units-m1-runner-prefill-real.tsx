#!/usr/bin/env tsx
/**
 * M1 (BLOCKING): Runner weight input must prefill 137.5 lb for 62.5 kg in imperial mode.
 *
 * This test verifies the prefill calculation function and proves it's wired
 * into the session runner.
 *
 * Mutant: Use roundToPlate instead of roundLbToHalf must FAIL this test.
 */

import { computeRunnerWeightPrefill, snapPrescribedWeight, roundLbToHalf, kgToDisplay } from "../src/lib/units";

console.log("\nM1: Runner weight input prefills 137.5 lb for 62.5 kg\n");

// Part 1: Test the prefill calculation function
// Note: The runner snaps prescriptions before prefill (line 666-667 in session-runner.tsx)
const prescribedKg = 62.5;
const units = "imperial" as const;
const isBodyweight = false;

// The runner applies snapPrescribedWeight before passing to the prefill function
const snappedKg = snapPrescribedWeight(prescribedKg, units);

console.log("1. Testing computeRunnerWeightPrefill function:");
console.log(`   Prescribed weight: ${prescribedKg} kg`);
console.log(`   Snapped for imperial grid: ${snappedKg} kg`);

const prefillValue = computeRunnerWeightPrefill(snappedKg, units, isBodyweight);

console.log(`   Prefill result: "${prefillValue}"`);

if (prefillValue !== "137.5") {
  console.error(`   ❌ FAIL: Expected "137.5", got "${prefillValue}"`);
  process.exit(1);
}
console.log("   ✓ PASS: Prefill is 137.5 lb");

// Part 2: Test metric mode (identity)
console.log("\n2. Testing metric mode (identity):");
const metricKg = 60;
const metricPrefill = computeRunnerWeightPrefill(metricKg, "metric", false);

console.log(`   Input: ${metricKg} kg`);
console.log(`   Prefill: "${metricPrefill}"`);

if (metricPrefill !== "60") {
  console.error(`   ❌ FAIL: Expected "60", got "${metricPrefill}"`);
  process.exit(1);
}
console.log("   ✓ PASS: Metric is identity");

// Part 3: Test bodyweight exercise (no prefill unless added weight)
console.log("\n3. Testing bodyweight exercise behavior:");
const bwNoPrefill = computeRunnerWeightPrefill(0, "imperial", true);
const bwWithWeight = computeRunnerWeightPrefill(10, "imperial", true);

console.log(`   Bodyweight with 0 kg: "${bwNoPrefill}"`);
console.log(`   Bodyweight with 10 kg: "${bwWithWeight}"`);

if (bwNoPrefill !== "") {
  console.error(`   ❌ FAIL: Bodyweight 0 kg should be empty, got "${bwNoPrefill}"`);
  process.exit(1);
}

if (bwWithWeight === "") {
  console.error(`   ❌ FAIL: Bodyweight 10 kg should prefill, got empty string`);
  process.exit(1);
}

console.log("   ✓ PASS: Bodyweight only prefills with added weight");

// Part 4: Assert line equals box by rendering SessionRunner
console.log("\n4. Verifying working weight line equals box value:");

// Import the real SessionRunner to test the wiring
import { render, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";
import "./helpers/setup-jsdom";

const mockActions: SessionActions = {
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
};

const testExercise: RunnerExercise = {
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
  workingWeightKg: prescribedKg,
  suggestedWeightKg: prescribedKg,
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

const rendered = render(
  <SessionRunner
    sessionId="test"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[testExercise]}
    settings={settings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rendered.container.textContent?.includes("Bench Press"))
    throw new Error("Exercise not loaded");
});

const containerText = rendered.container.textContent || "";

// Find the working weight line
const lineMatch = containerText.match(/Working weight ([\d.]+) lb/);
if (!lineMatch) {
  console.error("   ❌ FAIL: Working weight line not found");
  process.exit(1);
}
const lineValue = lineMatch[1];

// Find the weight input box value
const weightInput = [...rendered.container.querySelectorAll<HTMLInputElement>("input")].find(
  (i) => {
    const label = i.closest("label")?.textContent ?? "";
    return label.match(/Weight \(lb\)|Weight \(kg\)|Added weight/);
  }
);

if (!weightInput) {
  console.error("   ❌ FAIL: Weight input not found");
  process.exit(1);
}

const boxValue = weightInput.value;

console.log(`   Working weight line: ${lineValue} lb`);
console.log(`   Input box value: ${boxValue} lb`);

if (lineValue !== boxValue) {
  console.error(`   ❌ FAIL: Line doesn't match box!`);
  process.exit(1);
}

console.log("   ✓ PASS: Line equals box value");

rendered.unmount();

// Part 5: Render real SessionRunner and check box value
console.log("\n5. Real SessionRunner renders correct box value:");
console.log(`   Box value is "${boxValue}" lb`);

if (boxValue !== "137.5") {
  console.error(`   ❌ FAIL: Expected box to show "137.5", got "${boxValue}"`);
  process.exit(1);
}

console.log("   ✓ PASS: Box shows 137.5 lb");

console.log("\n✅ M1 PASS: Runner prefills 137.5 lb for 62.5 kg in imperial\n");
console.log("Note: This test verifies:");
console.log("  1. computeRunnerWeightPrefill uses roundLbToHalf (0.5 lb steps)");
console.log("  2. 62.5 kg snaps to 62.37 kg, prefills as 137.5 lb");
console.log("  3. session-runner.tsx imports and calls this function");
console.log("  4. A mutant using roundToPlate would give 140 lb instead\n");
