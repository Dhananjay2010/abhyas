#!/usr/bin/env tsx
/**
 * Test: Session expired banner (E1/E2 mutants)
 * 
 * E1: L1 guard inverted - expired prompt shows when NOT expired
 * E2: L1 clear removed - expired prompt never hides after successful replay
 * 
 * Drives the runner to allSetsDone while session is expired, asserts exactly
 * ONE expired prompt there (kills E1), then Retry succeeds and asserts ZERO
 * prompts (kills E2).
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
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
  
  // ========================================================================
  // Test 1: Exactly ONE expired prompt at allSetsDone (E1)
  // ========================================================================
  console.log("=== Test 1: Exactly ONE expired prompt at allSetsDone ===\n");
  
  let logSetCallCount = 0;
  let logSetShouldExpire = true;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCallCount++;
      if (logSetShouldExpire) {
        return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
      }
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
  
  // Wait for Log button to be enabled (synced after fake timer runs)
  await waitFor(() => {
    const logBtn = screen.queryByText(/Log set/i);
    if (!logBtn) throw new Error("Log button not found");
    if (logBtn instanceof window.HTMLButtonElement && logBtn.disabled) {
      throw new Error("Log button still disabled");
    }
  });
  
  // Log set 1 (expires)
  const logBtn1 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn1);
  await act(async () => {});
  
  // Wait for expired state
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("expired") && !text.includes("Retry")) {
      throw new Error("Expired prompt not shown");
    }
  });
  
  // Log set 2 (also expires)
  await waitFor(() => {
    const logBtn2 = screen.queryByText(/Log set/i);
    if (!logBtn2 || (logBtn2 instanceof window.HTMLButtonElement && logBtn2.disabled)) {
      throw new Error("Log button 2 not ready");
    }
  });
  
  const logBtn2 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn2);
  await act(async () => {});
  
  // Finish exercise to reach allSetsDone
  await waitFor(() => {
    const finishBtn = screen.queryByText(/Finish/i);
    if (!finishBtn) throw new Error("Finish button not found");
  });
  
  const finishBtn = screen.getByText(/Finish/i);
  fireEvent.click(finishBtn);
  await act(async () => {});
  
  // Wait for allSetsDone to render
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("all") && !text.includes("complete") && !text.includes("done")) {
      throw new Error("allSetsDone not shown");
    }
  });
  
  // E1: Assert exactly ONE expired prompt at allSetsDone
  const expiredPrompts = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(expiredPrompts.length === 1, `E1: Exactly ONE expired prompt at allSetsDone (got ${expiredPrompts.length})`);
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Zero prompts after successful retry (E2)
  // ========================================================================
  console.log("=== Test 2: Zero prompts after successful retry ===\n");
  
  logSetCallCount = 0;
  logSetShouldExpire = true;
  
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
  
  // Wait for Log button
  await waitFor(() => {
    const logBtn = screen.queryByText(/Log set/i);
    if (!logBtn || (logBtn instanceof window.HTMLButtonElement && logBtn.disabled)) {
      throw new Error("Log button not ready");
    }
  });
  
  // Log set (expires)
  const logBtn3 = screen.getByText(/Log set/i);
  fireEvent.click(logBtn3);
  await act(async () => {});
  
  // Wait for Retry button
  await waitFor(() => {
    if (!screen.queryByText(/Retry/i)) {
      throw new Error("Retry button not shown");
    }
  });
  
  // Now allow logSet to succeed
  logSetShouldExpire = false;
  
  // Click Retry
  const retryBtn = screen.getByText(/Retry/i);
  fireEvent.click(retryBtn);
  await act(async () => {});
  
  // Wait for replay to complete
  await waitFor(() => {
    if (logSetCallCount < 2) {
      throw new Error("Retry not completed");
    }
  });
  
  await act(async () => {});
  
  // E2: Assert ZERO expired prompts after successful replay
  const expiredPromptsAfter = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(expiredPromptsAfter.length === 0, `E2: Zero expired prompts after retry (got ${expiredPromptsAfter.length})`);
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Session expired banner tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
