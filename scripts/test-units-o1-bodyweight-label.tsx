#!/usr/bin/env tsx
/**
 * O1: Bodyweight exercises label the weight field 'Added weight'.
 * 
 * Tests that the SetEntry component shows 'Added weight (lb)' for bodyweight
 * exercises and 'Weight (lb)' for regular exercises.
 */

import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type SessionActions } from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== O1: Bodyweight exercise label ===\n");

const mockActions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => ({ ok: true as const }),
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

// Test case 1: Bodyweight exercise shows 'Added weight (lb)'
const bodyweightExercise: RunnerExercise = {
  id: "ex1",
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
  workingWeightKg: null,
  suggestedWeightKg: null,
      previousCompletedWeightKg: null,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: true,
};

const r1 = render(
  <SessionRunner
    sessionId="s1"
    sessionStatus="in_progress"
    userId="u1"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[bodyweightExercise]}
    settings={settings}
    actions={mockActions}
  />
);

const labels1 = Array.from(r1.container.querySelectorAll("label"));
const weightLabel1 = labels1.find(l => 
  l.textContent?.includes("weight") || l.textContent?.includes("Weight")
);

if (weightLabel1) {
  const labelText1 = weightLabel1.textContent || "";
  check("Bodyweight exercise shows 'Added weight'", labelText1.includes("Added weight"),
    `got "${labelText1}"`);
  check("Label includes unit (lb)", labelText1.includes("(lb)"),
    `got "${labelText1}"`);
} else {
  check("Bodyweight exercise weight label found", false);
  failures += 2;
}

r1.unmount();

console.log("");

// Test case 2: Regular exercise shows 'Weight (lb)'
const regularExercise: RunnerExercise = {
  id: "ex2",
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
      previousCompletedWeightKg: null,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: false,
};

const r2 = render(
  <SessionRunner
    sessionId="s2"
    sessionStatus="in_progress"
    userId="u2"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date().toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[regularExercise]}
    settings={settings}
    actions={mockActions}
  />
);

const labels2 = Array.from(r2.container.querySelectorAll("label"));
const weightLabel2 = labels2.find(l => 
  l.textContent?.includes("weight") || l.textContent?.includes("Weight")
);

if (weightLabel2) {
  const labelText2 = weightLabel2.textContent || "";
  check("Regular exercise shows 'Weight' (not 'Added weight')", 
    labelText2.includes("Weight") && !labelText2.includes("Added"),
    `got "${labelText2}"`);
  check("Label includes unit (lb)", labelText2.includes("(lb)"),
    `got "${labelText2}"`);
} else {
  check("Regular exercise weight label found", false);
  failures += 2;
}

r2.unmount();

if (failures === 0) {
  console.log(`\n✓ All O1 tests passed\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
