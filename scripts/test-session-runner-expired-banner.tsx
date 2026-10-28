#!/usr/bin/env tsx
/**
 * Test: Session expired banner (E1/E2 mutants)
 * 
 * E1: L1 guard inverted - expired prompt shows when NOT expired
 * E2: L1 clear removed - expired prompt never hides after successful replay
 * 
 * Uses Done button to reach allSetsDone with expired finish.
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
  
  // Test 1: ONE expired prompt when finishing with expired session (E1)
  console.log("=== Test 1: ONE expired prompt at allSetsDone (E1) ===\n");
  
  let finishCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishCount++;
      // Finish expires
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
      exerciseId: "pushup",
      name: "Push-up",
      cue: null,
      metric: "reps",
      primaryMuscles: ["chest"],
      plannedSets: 2,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: null,
      suggestedWeightKg: null,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: true
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
  
  // Log set 1
  const repsInput1 = screen.getByLabelText(/reps/i);
  if (repsInput1 instanceof window.HTMLInputElement) {
    await act(async () => {
      fireEvent.change(repsInput1, { target: { value: "10" } });
    });
  }
  
  const logBtn1 = screen.getByText(/Log set 1/i);
  assert(logBtn1 instanceof window.HTMLButtonElement, "Log button 1 is a button");
  assert(!logBtn1.disabled, "Log button 1 is enabled");
  
  await act(async () => {
    fireEvent.click(logBtn1);
  });
  
  // Log set 2
  const repsInput2 = screen.getByLabelText(/reps/i);
  if (repsInput2 instanceof window.HTMLInputElement) {
    await act(async () => {
      fireEvent.change(repsInput2, { target: { value: "10" } });
    });
  }
  
  const logBtn2 = screen.getByText(/Log set 2/i);
  assert(logBtn2 instanceof window.HTMLButtonElement, "Log button 2 is a button");
  assert(!logBtn2.disabled, "Log button 2 is enabled");
  
  await act(async () => {
    fireEvent.click(logBtn2);
  });
  
  // Click feel rating
  const justRightBtn = screen.getByText(/Just right/i);
  await act(async () => {
    fireEvent.click(justRightBtn);
  });
  
  await act(async () => {});
  
  // After selecting feel, with cooldownEnabled: false and only 1 exercise, it should go to allSetsDone
  // The finishExercise action was set to expire
  
  assert(finishCount === 1, "Finish called automatically after feel");
  
  // E1: At allSetsDone with expired finish, assert EXACTLY 1 expired prompt
  // Handler: finishExercise in session-runner.tsx, returns SESSION_EXPIRED_CODE
  // This must be SessionExpiredPrompt (data-testid="session-expired-prompt"), not error text
  const expiredPrompt = screen.queryByTestId("session-expired-prompt");
  assert(expiredPrompt !== null, "E1: SessionExpiredPrompt component shown");
  
  const expiredPrompts = screen.queryAllByTestId("session-expired-prompt");
  assert(expiredPrompts.length === 1, `E1: Exactly ONE expired prompt at allSetsDone (got ${expiredPrompts.length})`);
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // Test 2: Expired flag clears after any successful action (E2)
  console.log("=== Test 2: Expired cleared by successful Skip (E2) ===\n");
  
  let finishCount2 = 0;
  let skipCount = 0;
  
  const actions2: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishCount2++;
      return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
    },
    finishSession: async () => {
      skipCount++;
      // Skip succeeds
      return { ok: true, data: { status: "completed" as const, durationSeconds: 600 } };
    },
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
  await act(async () => {});
  
  // Log both sets
  const repsInput3 = screen.getByLabelText(/reps/i);
  if (repsInput3 instanceof window.HTMLInputElement) {
    await act(async () => {
      fireEvent.change(repsInput3, { target: { value: "10" } });
    });
  }
  
  const logBtn3 = screen.getByText(/Log set 1/i);
  await act(async () => {
    fireEvent.click(logBtn3);
  });
  
  const repsInput4 = screen.getByLabelText(/reps/i);
  if (repsInput4 instanceof window.HTMLInputElement) {
    await act(async () => {
      fireEvent.change(repsInput4, { target: { value: "10" } });
    });
  }
  
  const logBtn4 = screen.getByText(/Log set 2/i);
  await act(async () => {
    fireEvent.click(logBtn4);
  });
  
  // Select feel - finishExercise expires
  const justRightBtn2 = screen.getByText(/Just right/i);
  await act(async () => {
    fireEvent.click(justRightBtn2);
  });
  
  await act(async () => {});
  
  assert(finishCount2 === 1, "finishExercise expired");
  
  // Verify expired prompt shown
  let prompt = screen.queryByTestId("session-expired-prompt");
  assert(prompt !== null, "Expired prompt shown after finish expired");
  
  // Click "End session early" (calls abandonSession or finishSession depending on state)
  // This action succeeds and should clear sessionExpired per line 1216
  const endBtn = screen.getByText(/End session early/i);
  await act(async () => {
    fireEvent.click(endBtn);
  });
  await act(async () => {});
  
  // E2: Assert expired prompt cleared after successful action
  // Handler: line 1216 setSessionExpired(false) after successful action result
  prompt = screen.queryByTestId("session-expired-prompt");
  assert(prompt === null, `E2: Expired prompt cleared after successful action`);
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Session expired banner tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
