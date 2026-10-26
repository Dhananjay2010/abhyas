#!/usr/bin/env tsx
/**
 * Test: Skip cool-down with partial replay
 * 
 * Sets up a scenario where:
 * 1. Two sets are queued initially
 * 2. First set saves successfully during initial replay
 * 3. Second set continues to fail
 * 
 * Verifies that Skip:
 * - Does NOT finish when a set is still pending
 * - Shows "1 set waiting to save" after first set saves
 * - Still shows the pending notice with Retry button
 * 
 * Mutant: finish after partial replay (must fail)
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions, RunnerExercise, RunnerSettings } from "../src/app/session/[id]/session-runner";
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
      units: "metric",
};

(async () => {
  console.log("\n📋 Test: Skip with partial replay (1 of 2 sets saves)\n");
  
  let finishSessionCallCount = 0;
  let replayCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (params) => {
      replayCount++;
      // First 2 calls (initial mount replay): both sets fail
      // Calls 3-4 (Skip replay): set 4 succeeds, set 5 fails
      // Calls 5+ (Retry replay): set 5 succeeds
      if (replayCount <= 2) {
        // Initial mount replay: both fail
        throw new Error("Network error");
      }
      if (replayCount <= 4) {
        // Skip replay: set 4 succeeds, set 5 still fails
        if (params.setNumber === 4) {
          return { ok: true };
        }
        throw new Error("Network error");
      }
      // Retry replay: set 5 now succeeds
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => {
      finishSessionCallCount++;
      return { ok: true };
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const userId = "user-partial";
  const sessionId = "session-partial";
  
  fakeStorage.clear();
  
  // Seed 2 pending sets
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-4"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 5,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-5"
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
      now={() => FIXED_TIME}
    />
  );
  
  // Wait for cool-down phase and initial replay attempt
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // Verify we're in cool-down
  assert(screen.queryByText("Cool-down") !== null, "In cool-down phase");
  
  // Verify pending set message shows "2 sets waiting to save" after initial replay failure
  // (both sets failed during initial replay)
  const pendingText2Init = screen.queryAllByText(/2 sets waiting to save/i);
  assert(pendingText2Init.length > 0, "Shows '2 sets waiting to save' after initial replay failure");
  
  // Find Skip cool-down button
  const allButtons = screen.queryAllByRole("button");
  const skipButtons = allButtons.filter(b => b.textContent?.trim() === "Skip cool-down");
  assert(skipButtons.length > 0, "Skip cool-down button exists");
  const skipButton = skipButtons[0];
  if (!skipButton) throw new Error("Skip button not found");
  
  // Click Skip cool-down (set 4 will succeed, set 5 will fail = partial replay)
  await act(async () => {
    skipButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Verify finishSession was NOT called (1 set still unsaved after partial replay)
  assert(finishSessionCallCount === 0, "finishSession NOT called after partial replay");
  
  // Verify still on cool-down
  assert(screen.queryByText("Cool-down") !== null, "Still on cool-down after partial replay");
  
  // Verify notice now shows "1 set waiting to save" (set 4 saved, set 5 still pending)
  const pendingText1 = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingText1.length > 0, "Shows '1 set waiting to save' after partial replay");
  
  // Verify Retry button is still shown
  const retryButtons = screen.queryAllByRole("button", { name: /Retry/i });
  assert(retryButtons.length > 0, "Retry button still shown after partial replay");
  
  // Now test that a later Retry that saves the last set finishes the session
  // Click Retry button (this will be the 4th replay attempt, which saves set 5)
  await act(async () => {
    retryButtons[0].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // After the last set saves, Skip should finish the session
  // Manually click Skip again
  const skipButtons2 = screen.queryAllByRole("button").filter(b => b.textContent?.trim() === "Skip cool-down");
  assert(skipButtons2.length > 0, "Skip cool-down button still exists");
  
  await act(async () => {
    skipButtons2[0].click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Now finishSession should have been called (queue is empty)
  assert(finishSessionCallCount === 1, "finishSession called after all sets saved");
  
  console.log(`\n✅ Partial replay test passed (${passed} assertions)\n`);
  console.log("MUTANT: Finish after partial replay (remaining.length < pending.length) → finishSession called with unsaved sets\n");
  process.exit(0);
})();
