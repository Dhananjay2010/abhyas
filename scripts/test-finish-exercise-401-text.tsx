#!/usr/bin/env tsx
/**
 * Test: Finish exercise with error detection (B5)
 * 
 * Verifies that:
 * 1. Errors that isSessionExpired recognizes show expired UI
 * 2. Errors containing '401' text but NOT recognized by isSessionExpired show plain error
 * 
 * Without the fix (checking message.includes("401")):
 * - Any error with '401' in text would trigger expired state
 * 
 * With isSessionExpired helper:
 * - Only SESSION_EXPIRED errors trigger expired state
 * - Other errors show normal error message
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions, RunnerExercise, RunnerSettings } from "../src/app/session/[id]/session-runner";

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

const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();

const fakeTimer = {
  setTimeout: (callback: () => void) => { callback(); return 0; },
  clearTimeout: () => {},
};

const settings: RunnerSettings = {
  perSetLogging: false,
  restSound: false,
  restVibrate: false,
  restAutostart: false,
  restOverrideSeconds: null,
  cooldownEnabled: true,
};

(async () => {
  console.log("\n📋 Test: Finish exercise error detection (B5)\n");
  
  // ========================================================================
  // Test 1: Expired error (SESSION_EXPIRED) → shows expired UI
  // ========================================================================
  console.log("=== Test 1: SESSION_EXPIRED error shows expired UI ===\n");
  
  const exercises1: RunnerExercise[] = [{
    id: "ex1",
    exerciseId: "squat",
    name: "Squat",
    cue: null,
    metric: "reps",
    primaryMuscles: ["quads"],
    plannedSets: 3,
    plannedRepsMin: 8,
    repsMin: 8,
    plannedRepsMax: 12,
    repsMax: 12,
    restSeconds: 90,
    workingWeightKg: null,
    suggestedWeightKg: null,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  }];
  
  const actions1: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      // Throw an error that isSessionExpired recognizes
      throw new Error("SESSION_EXPIRED: Your session has expired");
    },
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const { unmount: unmount1 } = render(
    <SessionRunner
      sessionId="session-expired"
      sessionStatus="in_progress"
      userId="user-expired"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises1}
      settings={settings}
      actions={actions1}
      timer={fakeTimer}
      now={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  
  // Log all 3 sets
  for (let i = 1; i <= 3; i++) {
    const setButtons = screen.queryAllByRole("button", { name: new RegExp(`Set ${i} done`, 'i') });
    assert(setButtons.length > 0, `Set ${i} done button exists`);
    
    await act(async () => {
      setButtons[0].click();
    });
    
    await act(async () => {});
  }
  
  // Now tap a feel button to trigger finishExercise
  const allButtons = screen.queryAllByRole("button");
  const feelButtons = allButtons.filter(b => b.textContent?.toLowerCase().includes("just") || b.textContent?.toLowerCase().includes("felt") || b.textContent?.toLowerCase().includes("right"));
  assert(feelButtons.length > 0, "Feel button exists");
  
  await act(async () => {
    feelButtons[0].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Should show expired UI
  const signInLink1 = screen.queryByText(/Sign in again/i);
  assert(signInLink1 !== null, "Shows 'Sign in again' for SESSION_EXPIRED error");
  
  unmount1();
  
  // ========================================================================
  // Test 2: Non-expired error with '401' in text → shows plain error
  // ========================================================================
  console.log("\n=== Test 2: Non-expired error with '401' text shows plain error ===\n");
  
  const exercises2: RunnerExercise[] = [{
    id: "ex2",
    exerciseId: "deadlift",
    name: "Deadlift",
    cue: null,
    metric: "reps",
    primaryMuscles: ["quads"],
    plannedSets: 3,
    plannedRepsMin: 8,
    repsMin: 8,
    plannedRepsMax: 12,
    repsMax: 12,
    restSeconds: 90,
    workingWeightKg: null,
    suggestedWeightKg: null,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  }];
  
  const actions2: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      // Throw an error that contains "401" but is NOT a session expiry
      throw new Error("Database error at line 401: Connection timeout");
    },
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  render(
    <SessionRunner
      sessionId="session-401"
      sessionStatus="in_progress"
      userId="user-401"
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
      now={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  
  // Log all 3 sets
  for (let i = 1; i <= 3; i++) {
    const setButtons = screen.queryAllByRole("button", { name: new RegExp(`Set ${i} done`, 'i') });
    assert(setButtons.length > 0, `Set ${i} done button exists`);
    
    await act(async () => {
      setButtons[0].click();
    });
    
    await act(async () => {});
  }
  
  // Now tap a feel button to trigger finishExercise
  const allButtons2 = screen.queryAllByRole("button");
  const feelButtons2 = allButtons2.filter(b => b.textContent?.toLowerCase().includes("just") || b.textContent?.toLowerCase().includes("felt") || b.textContent?.toLowerCase().includes("right"));
  assert(feelButtons2.length > 0, "Feel button exists");
  
  await act(async () => {
    feelButtons2[0].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Should NOT show expired UI (no "Sign in again" link)
  const signInLink2 = screen.queryByText(/Sign in again/i);
  assert(signInLink2 === null, "Does NOT show 'Sign in again' for non-expired '401' error");
  
  // Should show the error message somewhere
  const errorText = screen.queryByText(/error/i);
  assert(errorText !== null, "Shows error message");
  
  console.log(`\n✅ Error detection test passed (${passed} assertions)\n`);
  console.log("MUTANT B5: Use message.includes('401') → treats non-auth errors as expired\n");
  process.exit(0);
})();
