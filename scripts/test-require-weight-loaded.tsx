#!/usr/bin/env tsx
/**
 * Test: require-weight-loaded (W1 mutant)
 * 
 * W1 mutant: removes the weight-required validation block
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type RunnerSettings, type SessionActions, type RunnerTimer } from "../src/app/session/[id]/session-runner";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

const FIXED_TIME = new Date('2026-10-27T12:00:00Z').getTime();

const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => {
    callback();
    return setTimeout(() => {}, 999999);
  },
  clearTimeout: () => {},
};

(async () => {
  console.log("\n📋 Test: Weight validation blocks submission (W1)\n");
  
  const logSetCalls: Array<{ reps: number | null; weightKg: number | null }> = [];
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push({ reps: input.reps, weightKg: input.weightKg });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Barbell Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 1,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 180,
      workingWeightKg: null,
      suggestedWeightKg: 50,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false
    }
  ];
  
  const settings: RunnerSettings = {
    perSetLogging: true,
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
    units: "metric"
  };
  
  const { container } = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="u1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={settings}
      actions={actions}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  
  // Clear weight input and set reps
  const weightInput = screen.getByLabelText(/weight/i);
  const repsInput = screen.getByLabelText(/reps/i);
  
  if (!(weightInput instanceof window.HTMLInputElement)) {
    throw new Error("Weight input not HTMLInputElement");
  }
  if (!(repsInput instanceof window.HTMLInputElement)) {
    throw new Error("Reps input not HTMLInputElement");
  }
  
  fireEvent.change(weightInput, { target: { value: "" } });
  fireEvent.change(repsInput, { target: { value: "10" } });
  await act(async () => {});
  
  // Try to submit without weight
  const logBtn = screen.getByText(/Log set/i);
  fireEvent.click(logBtn);
  await act(async () => {});
  
  // W1: Assert logSet NOT called when weight is empty
  assert(logSetCalls.length === 0, `W1: logSet NOT called without weight (got ${logSetCalls.length} calls)`);
  
  // Assert validation message shown
  const text = container.textContent || "";
  const hasValidation = text.includes("Add the weight") || text.includes("enter") || text.toLowerCase().includes("weight you used");
  assert(hasValidation, "Validation message shown for empty weight");
  
  // Now enter weight
  fireEvent.change(weightInput, { target: { value: "50" } });
  await act(async () => {});
  
  // Submit with weight
  const logBtn2 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn2);
  await act(async () => {});
  
  // Assert logSet WAS called with weight
  assert(logSetCalls.length === 1, `logSet called after weight provided (got ${logSetCalls.length})`);
  assert(logSetCalls[0].weightKg === 50, `Weight is 50 kg (got ${logSetCalls[0].weightKg})`);
  
  cleanup();
  
  console.log(`\n✅ Weight validation test passed (${passed} assertions)\n`);
  process.exit(0);
})();
