#!/usr/bin/env tsx
/**
 * Test: Skip cool-down with pending sets
 * 
 * Verifies that Skip cool-down:
 * - Does NOT call finishSession when sets are queued
 * - Triggers replay instead
 * - Only calls finishSession once queue is empty
 * 
 * Mutants:
 * - Call finishSession immediately (must fail)
 * - Skip the replay (must fail)
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions } from "../src/app/session/[id]/session-runner";
import type { RunnerExercise, RunnerSettings } from "../src/app/session/[id]/session-runner";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";
import type { Storage } from "../src/lib/session/pending-set-retry";

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

class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  
  get length() { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) || null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] || null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const fakeStorage = new FakeStorage();
Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };
const fakeTimer = {
  setTimeout: (callback: () => void) => { callback(); return 0; },
  clearTimeout: () => {},
};

(async () => {
  console.log("\n📋 Test: Skip cool-down with pending sets\n");
  
  let finishSessionCalled = false;
  let replayCalled = false;
  let logSetCallCount = 0;
  let shouldLogSetFail = true;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCallCount++;
      if (shouldLogSetFail) {
        throw new Error("Network error");
      }
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => {
      finishSessionCalled = true;
      return { ok: true };
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
    feel: "right",
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
  
  const userId = "test-user-skip";
  const sessionId = "session-skip";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-skip"
  }, fakeDeps);
  
  render(
    <SessionRunner
      sessionId={sessionId}
      sessionStatus="in_progress"
      userId={userId}
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
  
  // Wait for cool-down phase and initial replay attempt
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // Verify we're in cool-down
  assert(screen.queryByText("Cool-down") !== null, "In cool-down phase");
  
  // Verify pending set message shows (replay failed due to network error)
  assert(screen.queryByText(/1 set waiting to save/i) !== null, "Shows pending set message after replay failure");
  
  // Find Skip cool-down button
  const skipButton = screen.queryByRole("button", { name: /Skip cool-down/i });
  assert(skipButton !== null, "Skip cool-down button exists");
  
  // Click Skip cool-down with pending sets (logSet will still fail)
  const initialLogSetCount = logSetCallCount;
  await act(async () => {
    skipButton!.click();
  });
  
  await act(async () => {});
  
  // Verify finishSession was NOT called (because pending sets exist)
  assert(finishSessionCalled === false, "finishSession NOT called when pending sets exist");
  
  // Verify replay was triggered (logSet called again)
  assert(logSetCallCount > initialLogSetCount, "Replay triggered when Skip clicked with pending sets");
  
  // Now allow logSet to succeed
  shouldLogSetFail = false;
  
  // Click Retry button to clear the queue
  const retryButton = screen.queryByRole("button", { name: /Retry/i });
  if (retryButton) {
    await act(async () => {
      retryButton.click();
    });
    
    await act(async () => {});
    await act(async () => {});
  }
  
  // Verify queue is now empty
  const queueAfterReplay = fakeStorage.getItem(`pending-sets:${userId}`);
  assert(queueAfterReplay === null, "Queue emptied after successful replay");
  
  // Now click Skip cool-down again (queue is empty, so finishSession should be called)
  // Track the state before clicking
  const callsBeforeSecondSkip = finishSessionCalled ? 1 : 0;
  const skipButton2 = screen.queryByRole("button", { name: /Skip cool-down/i });
  
  await act(async () => {
    skipButton2!.click();
  });
  
  await act(async () => {});
  
  // Verify finishSession WAS called this time (the action callback modifies the outer variable)
  const callsAfterSecondSkip = finishSessionCalled ? 1 : 0;
  assert(callsAfterSecondSkip > callsBeforeSecondSkip, "finishSession called once queue is empty");
  
  console.log(`\n✅ Skip cool-down test passed (${passed} assertions)\n`);
  console.log("MUTANT 1: Calling finishSession immediately → would call it with pending sets (fails assertion)");
  console.log("MUTANT 2: Not calling replay → queue never empties, finishSession never called\n");
  process.exit(0);
})();
