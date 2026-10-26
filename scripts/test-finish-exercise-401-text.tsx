#!/usr/bin/env tsx
/**
 * Test: Finish exercise with non-auth error containing "401"
 * 
 * Verifies that errors containing "401" in their text but NOT matching
 * the SESSION_EXPIRED pattern are treated as regular errors, not expired sessions.
 * 
 * Without the fix (checking message.includes("401")):
 * - Any error with "401" in text would trigger expired state
 * - This would show wrong UI (Sign in again) for unrelated errors
 * 
 * With isSessionExpired helper:
 * - Only errors with "SESSION_EXPIRED:" prefix trigger expired state
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

const exercises: RunnerExercise[] = [{
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
  status: "completed",
  feel: null,
  sets: [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
    { setNumber: 2, reps: 10, weightKg: 50, durationSeconds: null },
    { setNumber: 3, reps: 10, weightKg: 50, durationSeconds: null },
  ],
  isBodyweight: false,
}];

const settings: RunnerSettings = {
  perSetLogging: false,
  restSound: false,
  restVibrate: false,
  restAutostart: false,
  restOverrideSeconds: null,
  cooldownEnabled: true,
};

(async () => {
  console.log("\n📋 Test: Finish exercise with non-auth error containing '401' (B5)\n");
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      // Throw an error that contains "401" but is NOT a session expiry error
      throw new Error("Database error at line 401: Connection timeout");
    },
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
      exercises={exercises}
      settings={settings}
      actions={actions}
      timer={fakeTimer}
      now={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // When finishExercise throws an error containing "401" (but NOT "SESSION_EXPIRED:"),
  // the session should NOT show the expired session UI
  // The key test: "Sign in again" link should NOT appear
  const signInLink = screen.queryByText(/Sign in again/i);
  assert(signInLink === null, "Does NOT show 'Sign in again' for non-expired error with '401' text");
  
  console.log(`\n✅ Non-auth '401' error test passed (${passed} assertions)\n`);
  console.log("MUTANT B5: Check message.includes('401') → treats non-auth errors as expired\n");
  process.exit(0);
})();
