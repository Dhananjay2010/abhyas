#!/usr/bin/env tsx
/**
 * Test: Session expired banner (E1/E2 mutants)
 * 
 * E1: L1 guard inverted - expired prompt shows when NOT expired
 * E2: L1 clear removed - expired prompt never hides after successful replay
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup, fireEvent } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type RunnerSettings, type SessionActions, type RunnerTimer } from "../src/app/session/[id]/session-runner";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";

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
  console.log("\n📋 Test: Session expired banner (E1/E2)\n");
  
  // Test 1: Exactly ONE expired prompt when session expires (E1)
  console.log("=== Test 1: ONE expired prompt when finishing with expired session (E1) ===\n");
  
  let logSetCount = 0;
  let finishCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCount++;
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishCount++;
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
    },
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
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 2,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: 50,
      suggestedWeightKg: null,
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
  await act(async () => {});
  await act(async () => {});
  
  // Fill inputs first
  const repsInput = screen.getByLabelText(/reps/i);
  if (repsInput instanceof window.HTMLInputElement) {
    fireEvent.change(repsInput, { target: { value: "10" } });
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
  }
  
  // Log set 1 - expires
  const logBtn1 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn1);
  await act(async () => {});
  
  assert(logSetCount === 1, "Log set 1 called");
  
  // Log set 2 - expires
  const logBtn2 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn2);
  await act(async () => {});
  
  assert(logSetCount === 2, "Log set 2 called");
  
  // Finish exercise - expires and shows allSetsDone
  const finishBtn = screen.getByText(/Finish/i);
  fireEvent.click(finishBtn);
  await act(async () => {});
  
  assert(finishCount === 1, "Finish called");
  
  // E1: At allSetsDone with expired finish, assert EXACTLY 1 expired prompt
  const expiredPrompts = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(expiredPrompts.length === 1, `E1: Exactly ONE expired prompt at allSetsDone (got ${expiredPrompts.length})`);
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // Test 2: Zero prompts after successful retry (E2)
  console.log("=== Test 2: Zero prompts after successful Retry (E2) ===\n");
  
  logSetCount = 0;
  let replaySucceeds = false;
  
  const actions2: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCount++;
      if (replaySucceeds) {
        return { ok: true };
      }
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
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
  
  render(
    <SessionRunner
      sessionId="s2"
      sessionStatus="in_progress"
      userId="u2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={settings}
      actions={actions2}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  
  // Log set - expires
  const logBtn3 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn3);
  await act(async () => {});
  
  assert(logSetCount === 1, "Log set called and expired");
  
  // Verify expired prompt shown
  let prompts = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(prompts.length === 1, "Expired prompt shown before retry");
  
  // Now allow replay to succeed
  replaySucceeds = true;
  
  // Click Retry
  const retryBtn = screen.getByText(/Retry/i);
  fireEvent.click(retryBtn);
  await act(async () => {});
  await act(async () => {});
  
  assert(logSetCount === 2, "Retry replayed the set");
  
  // E2: Assert ZERO expired prompts after successful replay
  prompts = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(prompts.length === 0, `E2: Zero expired prompts after retry (got ${prompts.length})`);
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Session expired banner tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
