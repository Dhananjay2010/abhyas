#!/usr/bin/env tsx
/**
 * Test: Skip cool-down with injected clock vs real clock
 * 
 * Verifies that Skip uses the injected `now` prop, not Date.now, when:
 * 1. SessionRunner has an injected clock (now prop)
 * 2. The real clock (Date.now) is different
 * 3. A pending set exists
 * 
 * Without the fix (createPendingSetDeps() instead of createPendingSetDeps(now)):
 * - Skip would use Date.now when checking if the queue is empty
 * - Pruning would use the wrong timestamp
 * - The test would fail
 * 
 * Mutant: Drop `now` argument from createPendingSetDeps in Skip handler
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

// Fixed time well in the past (2020) so dropping `now` fails TODAY
const FIXED_TIME = new Date('2020-01-01T10:00:00Z').getTime();

const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };
const fakeTimer = {
  setTimeout: (callback: () => void) => { callback(); return 0 as unknown as ReturnType<typeof globalThis.setTimeout>; },
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
  console.log("\n📋 Test: Skip with injected clock (B2)\n");
  
  console.log(`Fixed time: ${new Date(FIXED_TIME).toISOString()}\n`);
  
  let finishSessionCalled = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      // Always fail to keep the set pending
      throw new Error("Network error");
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
  getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const userId = "user-clock";
  const sessionId = "session-clock";
  
  fakeStorage.clear();
  
  // Seed a pending set using the FIXED_TIME
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-clock"
  }, fakeDeps);
  
  // Render with injected clock
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
  
  // Verify pending set message is shown
  const pendingText = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingText.length > 0, "Shows '1 set waiting to save'");
  
  // Find Skip cool-down button
  const allButtons = screen.queryAllByRole("button");
  const skipButtons = allButtons.filter(b => b.textContent?.trim() === "Skip cool-down");
  assert(skipButtons.length > 0, "Skip cool-down button exists");
  const skipButton = skipButtons[0];
  if (!skipButton) throw new Error("Skip button not found");
  
  // Click Skip cool-down
  // With the fix (createPendingSetDeps(now)), Skip uses FIXED_TIME
  // Without the fix, it would use Date.now and potentially prune the set incorrectly
  await act(async () => {
    skipButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Verify finishSession was NOT called (set is still pending)
  assert(finishSessionCalled === false, "finishSession NOT called (pending set exists)");
  
  // Verify still on cool-down
  assert(screen.queryByText("Cool-down") !== null, "Still on cool-down with pending set");
  
  // Verify pending set message still shows
  const pendingText2 = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingText2.length > 0, "Still shows '1 set waiting to save'");
  
  console.log(`\n✅ Injected clock test passed (${passed} assertions)\n`);
  console.log("MUTANT B2: Drop `now` argument in Skip → uses Date.now instead of injected clock → pruning/check may fail\n");
  process.exit(0);
})();
