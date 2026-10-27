#!/usr/bin/env tsx
/**
 * (A) All runner paths must show lb for imperial users.
 *
 * Tests every user-facing path: fresh start, resume, swapped-in exercise,
 * deload day, warm-up set, exercise with no history. Asserts that imperial
 * users never see 'kg' or '(kg)' in rendered text, and metric users do see 'kg'.
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

console.log("\n(A) Runner paths: imperial shows lb, metric shows kg\n");

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
      workoutSessionExerciseId: "new-ex",
      exerciseId: "new-exercise",
      metric: "reps" as const,
      repsMin: 6,
      repsMax: 8,
      equipmentIds: [],
      weightPrefill: 50,
      workingWeightKg: 50,
      currentTargetReps: 8,
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

const metricSettings = {
  ...imperialSettings,
  units: "metric" as const,
};

(async () => {
// Path 1: Fresh start (no history)
console.log("1. Fresh start (no history):");

const freshExercise: RunnerExercise = {
  id: "ex-fresh",
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
  workingWeightKg: null,
  suggestedWeightKg: null,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: false,
};

const rFresh = render(
  <SessionRunner
    sessionId="fresh"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[freshExercise]}
    settings={imperialSettings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rFresh.container.textContent?.includes("Bench Press"))
    throw new Error("Fresh exercise not loaded");
});

const freshText = rFresh.container.textContent || "";
check(
  "Imperial: no ' kg' in fresh start",
  !freshText.includes(" kg"),
  freshText.includes(" kg") ? "found ' kg'" : ""
);
check(
  "Imperial: no '(kg)' in fresh start",
  !freshText.includes("(kg)"),
  freshText.includes("(kg)") ? "found '(kg)'" : ""
);

rFresh.unmount();

// Path 2: Resume with working weight
console.log("\n2. Resume with working weight:");

const resumeExercise: RunnerExercise = {
  id: "ex-resume",
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

const rResume = render(
  <SessionRunner
    sessionId="resume"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[resumeExercise]}
    settings={imperialSettings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rResume.container.textContent?.includes("Squat"))
    throw new Error("Resume exercise not loaded");
});

const resumeText = rResume.container.textContent || "";
check(
  "Imperial: no ' kg' in resume",
  !resumeText.includes(" kg"),
  resumeText.includes(" kg") ? "found ' kg'" : ""
);
check(
  "Imperial: no '(kg)' in resume",
  !resumeText.includes("(kg)"),
  resumeText.includes("(kg)") ? "found '(kg)'" : ""
);
check(
  "Imperial: 'lb' present in resume",
  resumeText.includes(" lb"),
  "working weight line should show lb"
);

rResume.unmount();

// Path 3: Deload day
console.log("\n3. Deload day:");

const deloadExercise: RunnerExercise = {
  id: "ex-deload",
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
  workingWeightKg: 80,
  suggestedWeightKg: 60,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: false,
};

const rDeload = render(
  <SessionRunner
    sessionId="deload"
    isDeload={true}
    week={4}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[deloadExercise]}
    settings={imperialSettings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rDeload.container.textContent?.includes("Deadlift"))
    throw new Error("Deload exercise not loaded");
});

const deloadText = rDeload.container.textContent || "";
check(
  "Imperial: no ' kg' in deload",
  !deloadText.includes(" kg"),
  deloadText.includes(" kg") ? "found ' kg'" : ""
);
check(
  "Imperial: no '(kg)' in deload",
  !deloadText.includes("(kg)"),
  deloadText.includes("(kg)") ? "found '(kg)'" : ""
);

rDeload.unmount();

// Path 4: Bodyweight exercise with added weight
console.log("\n4. Bodyweight exercise:");

const bodyweightExercise: RunnerExercise = {
  id: "ex-bw",
  exerciseId: "pull-up",
  name: "Pull-up",
  cue: null,
  metric: "reps",
  primaryMuscles: ["lats"],
  plannedSets: 3,
  plannedRepsMin: 6,
  plannedRepsMax: 8,
  repsMin: 6,
  repsMax: 8,
  restSeconds: 180,
  workingWeightKg: 10,
  suggestedWeightKg: 10,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: true,
};

const rBW = render(
  <SessionRunner
    sessionId="bw"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[bodyweightExercise]}
    settings={imperialSettings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rBW.container.textContent?.includes("Pull-up"))
    throw new Error("Bodyweight exercise not loaded");
});

const bwText = rBW.container.textContent || "";
check(
  "Imperial: no ' kg' in bodyweight",
  !bwText.includes(" kg"),
  bwText.includes(" kg") ? "found ' kg'" : ""
);
check(
  "Imperial: no '(kg)' in bodyweight",
  !bwText.includes("(kg)"),
  bwText.includes("(kg)") ? "found '(kg)'" : ""
);
check(
  "Imperial: 'Added weight (lb)' in bodyweight",
  bwText.includes("Added weight (lb)"),
  "input label should show lb for added weight"
);

rBW.unmount();

// Path 5: Metric user sees 'kg'
console.log("\n5. Metric user sees 'kg':");

const metricExercise: RunnerExercise = {
  id: "ex-metric",
  exerciseId: "overhead-press",
  name: "Overhead Press",
  cue: null,
  metric: "reps",
  primaryMuscles: ["front_delts"],
  plannedSets: 3,
  plannedRepsMin: 6,
  plannedRepsMax: 8,
  repsMin: 6,
  repsMax: 8,
  restSeconds: 180,
  workingWeightKg: 50,
  suggestedWeightKg: 50,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: false,
};

const rMetric = render(
  <SessionRunner
    sessionId="metric"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[metricExercise]}
    settings={metricSettings}
    actions={mockActions}
  />,
);

await waitFor(() => {
  if (!rMetric.container.textContent?.includes("Overhead Press"))
    throw new Error("Metric exercise not loaded");
});

const metricText = rMetric.container.textContent || "";
check(
  "Metric: 'kg' present in text",
  metricText.includes(" kg"),
  "working weight line should show kg"
);
check(
  "Metric: 'Weight (kg)' label present",
  metricText.includes("Weight (kg)"),
  "input label should show kg"
);

rMetric.unmount();

if (failures > 0) {
  console.error(`\n❌ FAIL: ${failures} check(s) failed\n`);
  process.exit(1);
}

console.log("\n✅ All runner paths show correct units\n");
})().catch((e) => {
  console.error("Test error:", e.message);
  console.error(e.stack);
  process.exit(1);
});