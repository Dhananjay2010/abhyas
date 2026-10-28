#!/usr/bin/env tsx
/**
 * Test: Session expired banner (E1/E2 mutants)
 * 
 * E1: L1 guard inverted - expired prompt shows when NOT expired
 * E2: L1 clear removed - expired prompt never hides after successful replay
 * 
 * This test drives the runner to allSetsDone while session is expired,
 * verifies exactly ONE expired prompt there, then verifies ZERO prompts
 * after successful retry.
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup, waitFor } from "@testing-library/react";
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
  console.log("\n📋 Test: Session expired banner (E1/E2)\n");
  
  // Test 1: Drive to allSetsDone while expired, verify exactly ONE expired prompt
  console.log("=== Test 1: Exactly ONE expired prompt at allSetsDone ===\n");
  
  let logSetCallCount = 0;
  let logSetShouldExpire = true;
  
  const actions = makeTypedActions(async () => {
    logSetCallCount++;
    if (logSetShouldExpire) {
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
    }
    return { ok: true };
  });
  
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
  
  // Log all sets while expired to reach allSetsDone
  // Use screen.getByRole to find inputs without type casts
  const repsInputs = screen.getAllByLabelText(/reps/i);
  const logButtons = screen.queryAllByText(/Log set/i);
  
  // Log set 1
  const repsInput0 = repsInputs[0];
  if (repsInput0 instanceof window.HTMLInputElement) {
    await act(async () => {
      repsInput0.value = "10";
      repsInput0.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      logButtons[0].click();
    });
    await act(async () => {});
  }
  
  // Wait for expired state to settle
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("expired") && !text.includes("Retry")) {
      throw new Error("Expired prompt not shown");
    }
  });
  
  // Log set 2 (still expired)
  await act(async () => {
    if (repsInputs[1] instanceof window.HTMLInputElement) {
      repsInputs[1].value = "10";
      repsInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await act(async () => {
    const logButtons2 = screen.queryAllByText(/Log set/i);
    if (logButtons2[1]) logButtons2[1].click();
  });
  await act(async () => {});
  
  // Finish exercise to reach allSetsDone
  const finishButton = screen.queryByText(/Finish/i);
  if (finishButton) {
    await act(async () => {
      finishButton.click();
    });
    await act(async () => {});
  }
  
  // Wait for allSetsDone block to render
  await waitFor(() => {
    const text = container.textContent || "";
    if (!text.includes("all sets") && !text.includes("All done")) {
      throw new Error("allSetsDone not shown");
    }
  });
  
  // E1: Assert exactly ONE expired prompt at allSetsDone
  const expiredPrompts = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(expiredPrompts.length === 1, `E1: Exactly ONE expired prompt at allSetsDone (got ${expiredPrompts.length})`);
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // Test 2: After successful retry, zero expired prompts (E2)
  console.log("=== Test 2: Zero prompts after successful retry ===\n");
  
  logSetCallCount = 0;
  logSetShouldExpire = true;
  let retryCalled = false;
  
  const actions2 = makeTypedActions(async () => {
    logSetCallCount++;
    if (retryCalled) {
      return { ok: true };
    }
    if (logSetShouldExpire) {
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
    }
    return { ok: true };
  });
  
  const exercises2 = JSON.parse(JSON.stringify(exercises));
  
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
      exercises={exercises2}
      settings={settings}
      actions={actions2}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  
  // Log set while expired
  const repsInputs2 = screen.getAllByLabelText(/reps/i);
  const logButtons2 = screen.queryAllByText(/Log set/i);
  
  const repsInput2_0 = repsInputs2[0];
  if (repsInput2_0 instanceof window.HTMLInputElement) {
    await act(async () => {
      repsInput2_0.value = "10";
      repsInput2_0.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      logButtons2[0].click();
    });
    await act(async () => {});
  }
  
  // Wait for Retry button
  await waitFor(() => {
    if (!screen.queryByText(/Retry/i)) {
      throw new Error("Retry button not shown");
    }
  });
  
  // Click Retry (allow success)
  logSetShouldExpire = false;
  retryCalled = true;
  
  const retryButton = screen.getByText(/Retry/i);
  await act(async () => {
    retryButton.click();
  });
  
  // Wait for replay to complete
  await waitFor(() => {
    if (logSetCallCount < 2) {
      throw new Error("Retry not completed");
    }
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // E2: Assert ZERO expired prompts after successful replay
  const expiredPromptsAfter = screen.queryAllByText(/session.*expired|expired.*session/i);
  assert(expiredPromptsAfter.length === 0, `E2: Zero expired prompts after retry (got ${expiredPromptsAfter.length})`);
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Session expired banner tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
