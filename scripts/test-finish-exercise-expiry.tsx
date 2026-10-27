#!/usr/bin/env tsx
/**
 * Test: F3 - finishExercise handles rejected promises (401 on expiry)
 * 
 * Tests both:
 * - Rejected promise (proxy 401)
 * - Result with SESSION_EXPIRED code
 * 
 * Mutant: Remove catch block → unhandled rejection
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions, RunnerTimer, RunnerExercise, RunnerSettings } from "../src/app/session/[id]/session-runner";

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
const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => { callback(); return setTimeout(() => {}, 999999); },
  clearTimeout: () => {},
};

(async () => {
  console.log("\n📋 Test F3: finishExercise handles rejected promises\n");
  
  // Test 1: Rejected promise (proxy 401)
  {
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true }),
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => {
        throw new Error("SESSION_EXPIRED: Not signed in");
      },
      finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
      abandonSession: async () => ({ ok: true }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
      refreshAfterSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
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
      status: "pending",
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
      cooldownEnabled: false,
      units: "metric",
    };
    
    render(
      <SessionRunner
        sessionId="session-f3"
        sessionStatus="in_progress"
        userId="user-f3"
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
      />
    );
    
    await act(async () => {});
    
    // Find and click a feel button
    const feelButtons = screen.queryAllByRole("button", { name: /Just right/i });
    assert(feelButtons.length > 0, "Feel button exists");
    const feelButton = feelButtons[0];
    if (!feelButton) throw new Error("Feel button not found");
    
    await act(async () => {
      feelButton.click();
    });
    
    await act(async () => {});
    
    // Should show SessionExpiredPrompt, not an unhandled error
    const signInLink = screen.queryByText(/Sign in again/i);
    assert(signInLink !== null, "Shows 'Sign in again' after rejected promise");
    
    console.log("✓ Test 1: Rejected promise handled correctly\n");
  }
  
  // Test 2: Result with SESSION_EXPIRED code
  {
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true }),
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => {
        return { ok: false, error: "Not signed in", code: "SESSION_EXPIRED" };
      },
      finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
      abandonSession: async () => ({ ok: true }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
      refreshAfterSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
    };
    
    const exercises: RunnerExercise[] = [{
      id: "ex2",
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
      cooldownEnabled: false,
      units: "metric",
    };
    
    render(
      <SessionRunner
        sessionId="session-f3-2"
        sessionStatus="in_progress"
        userId="user-f3-2"
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
      />
    );
    
    await act(async () => {});
    
    const feelButtons = screen.queryAllByRole("button", { name: /Just right/i });
    const feelButton = feelButtons.length > 0 ? feelButtons[0] : null;
    if (!feelButton) throw new Error("Feel button not found");
    
    await act(async () => {
      feelButton.click();
    });
    
    await act(async () => {});
    
    const signInLink = screen.queryByText(/Sign in again/i);
    assert(signInLink !== null, "Shows 'Sign in again' for SESSION_EXPIRED code");
    
    console.log("✓ Test 2: SESSION_EXPIRED code handled correctly\n");
  }
  
  console.log(`✅ F3 finishExercise tests passed (${passed} assertions)\n`);
  console.log("MUTANT: Remove catch block → unhandled rejection, test fails\n");
  process.exit(0);
})();
