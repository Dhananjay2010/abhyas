#!/usr/bin/env tsx
/**
 * Test: Session expired banner (E1/E2 mutants)
 * 
 * E1: Line 1207 guard inverted - expired prompt shows when NOT expired  
 * E2: Line 1216 clear removed - expired prompt never hides after successful action
 * 
 * Handler: onFinishExercise (lines 1176-1230), called by feel button clicks (line 1461)
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
    },
    {
      id: "ex2",
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
  
  // Log set 1
  const repsInput1 = screen.getByLabelText(/reps/i);
  if (repsInput1 instanceof window.HTMLInputElement) {
    await act(async () => {
      fireEvent.change(repsInput1, { target: { value: "10" } });
    });
  }
  
  const logBtn1 = screen.getByText(/Log set 1/i);
  assert(logBtn1 instanceof window.HTMLButtonElement && !logBtn1.disabled, "Log button 1 enabled");
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
  assert(logBtn2 instanceof window.HTMLButtonElement && !logBtn2.disabled, "Log button 2 enabled");
  await act(async () => {
    fireEvent.click(logBtn2);
  });
  
  // Click feel - finishExercise expires
  const justRightBtn = screen.getByText(/Just right/i);
  await act(async () => {
    fireEvent.click(justRightBtn);
  });
  await act(async () => {});
  
  assert(finishCount === 1, "finishExercise called");
  
  // E1: At allSetsDone with expired finish, assert SessionExpiredPrompt
  // Handler: onFinishExercise (session-runner.tsx:1176-1230)
  // Line 1207-1209 sets sessionExpired=true when code === SESSION_EXPIRED
  const expiredPrompt = screen.queryByTestId("session-expired-prompt");
  assert(expiredPrompt !== null, "E1: SessionExpiredPrompt shown");
  
  const expiredPrompts = screen.queryAllByTestId("session-expired-prompt");
  assert(expiredPrompts.length === 1, `E1: Exactly ONE expired prompt (got ${expiredPrompts.length})`);
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // Test 2: Expired cleared by successful second call to same handler (E2)
  console.log("=== Test 2: Expired cleared by successful onFinishExercise (E2) ===\n");
  
  let finishCount2 = 0;
  let firstCallExpires = true;
  
  const actions2: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishCount2++;
      if (firstCallExpires) {
        firstCallExpires = false;
        return { ok: false, error: "Session expired", code: SESSION_EXPIRED_CODE };
      }
      return { ok: true, data: null };
    },
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
  
  // First call: click feel - finishExercise expires
  const justRightBtn2 = screen.getByText(/Just right/i);
  await act(async () => {
    fireEvent.click(justRightBtn2);
  });
  await act(async () => {});
  
  assert(finishCount2 === 1, "finishExercise called and expired");
  
  // Verify expired prompt shown
  let prompt = screen.queryByTestId("session-expired-prompt");
  assert(prompt !== null, "Expired prompt shown after first call");
  
  // Second call: click feel again - finishExercise succeeds
  // Call site: session-runner.tsx:1461 onClick={() => onFinishExercise(f.value)}
  const justRightBtn3 = screen.getByText(/Just right/i);
  await act(async () => {
    fireEvent.click(justRightBtn3);
  });
  await act(async () => {});
  
  assert(finishCount2 === 2, "finishExercise called again");
  
  // Wait for state to settle
  await act(async () => {});
  await act(async () => {});
  
  // E2: Assert expired prompt cleared by line 1216 setSessionExpired(false)
  // Handler: onFinishExercise (session-runner.tsx:1176-1230)
  // Call site: session-runner.tsx:1461
  prompt = screen.queryByTestId("session-expired-prompt");
  
  // Debug if still there
  if (prompt !== null) {
    const text = container.textContent || "";
    console.log("ERROR: Prompt still visible");
    console.log("Container text sample:", text.substring(0, 300));
  }
  
  assert(prompt === null, "E2: Expired prompt cleared after successful action");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  console.log(`\n✅ Session expired banner tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
