#!/usr/bin/env tsx
/**
 * Test: require-weight-loaded (weight required BEFORE set logging)
 * 
 * Ensures weight validation blocks submission BEFORE logSet is called.
 * W1 mutant: set submission succeeds even when weight is required but missing.
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
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

function makeTypedActions(logSetImpl: Parameters<SessionActions["logSet"]>[0] extends infer P ? (input: P) => ReturnType<SessionActions["logSet"]> : never): SessionActions {
  return {
    markWarmupDone: async () => ({ ok: true }),
    logSet: logSetImpl,
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
}

(async () => {
  console.log("\n📋 Test: Weight required before set logging (W1 mutant)\n");
  
  // Test 1: Weight required, validation blocks submission
  console.log("=== Test 1: Weight required, validation blocks submission ===\n");
  
  let logSetCalled = false;
  
  const actions = makeTypedActions(async () => {
    logSetCalled = true;
    return { ok: true };
  });
  
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
  
  // Wait for exercise to be loaded
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("Barbell Squat")) throw new Error("Exercise not loaded");
  });
  
  // Find reps input and enter reps
  const repsInput = screen.getByLabelText(/reps/i);
  if (!(repsInput instanceof window.HTMLInputElement)) {
    throw new Error("Reps input is not HTMLInputElement");
  }
  
  fireEvent.change(repsInput, { target: { value: "10" } });
  await act(async () => {});
  
  // Try to submit without entering weight - should show validation message
  const logButton = screen.getByText(/Log set/i);
  fireEvent.click(logButton);
  await act(async () => {});
  
  // Wait for validation message
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("Add the weight")) throw new Error("Validation message not shown");
  }, { timeout: 2000 });
  
  assert(!logSetCalled, "W1: logSet NOT called when weight is missing");
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // Test 2: After adding weight, submission succeeds
  console.log("=== Test 2: After adding weight, submission succeeds ===\n");
  
  logSetCalled = false;
  
  render(
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
  
  // Wait for load
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("Barbell Squat")) throw new Error("Exercise not loaded");
  });
  
  const repsInput2 = screen.getByLabelText(/reps/i);
  const weightInput = screen.getByLabelText(/weight/i);
  
  if (!(repsInput2 instanceof window.HTMLInputElement)) {
    throw new Error("Reps input is not HTMLInputElement");
  }
  if (!(weightInput instanceof window.HTMLInputElement)) {
    throw new Error("Weight input is not HTMLInputElement");
  }
  
  fireEvent.change(repsInput2, { target: { value: "10" } });
  fireEvent.change(weightInput, { target: { value: "50" } });
  await act(async () => {});
  
  const logButton2 = screen.getByText(/Log set/i);
  fireEvent.click(logButton2);
  await act(async () => {});
  
  // Wait for logSet to be called
  await waitFor(() => {
    if (!logSetCalled) throw new Error("logSet not called");
  }, { timeout: 2000 });
  
  assert(logSetCalled, "logSet called after weight is provided");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Weight required test passed (${passed} assertions)\n`);
  process.exit(0);
})();
