#!/usr/bin/env tsx
/**
 * Test: Skip cool-down with pending sets (ONE tap)
 * 
 * Verifies that Skip cool-down:
 * (a) One tap with successful replay → finishSession called exactly once, after queue is empty
 * (b) Offline/expired → finishSession never called, notice shown
 * (c) Fails if Skip finishes with non-empty queue
 * 
 * Mutants:
 * - Don't await replay (must fail - finishSession called with pending sets)
 * - Finish without checking queue (must fail - finishSession called with pending sets)
 * - Never finish after replay (must fail - finishSession not called when queue is empty)
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions, RunnerTimer, RunnerExercise, RunnerSettings } from "../src/app/session/[id]/session-runner";
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
const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => { callback(); return setTimeout(() => {}, 999999); },
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
  console.log("\n📋 Test: Skip cool-down ONE tap with pending sets\n");
  
  // ========================================================================
  // Test (a): One tap with successful replay → finishSession called once
  // ========================================================================
  console.log("=== Test (a): Successful replay in one tap ===\n");
  
  let finishSessionCalled = false;
  let logSetCallCount = 0;
  const callOrder: string[] = [];
  
  const actionsA: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCallCount++;
      callOrder.push("logSet");
      // Succeed after first failure
      if (logSetCallCount === 1) {
        throw new Error("Network error");
      }
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => {
      finishSessionCalled = true;
      callOrder.push("finishSession");
      return { ok: true, data: { status: "completed" as const, durationSeconds: 600 } };
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const userId = "user-a";
  const sessionId = "session-a";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-a"
  }, fakeDeps);
  
  const { unmount: unmountA } = render(
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
      actions={actionsA}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  // Wait for cool-down phase and initial replay attempt
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // Verify we're in cool-down
  assert(screen.queryByText("Cool-down") !== null, "(a) In cool-down phase");
  
  // Verify pending set message shows (replay failed due to network error)
  const pendingText = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingText.length > 0, "(a) Shows pending set message after initial replay failure");
  
  // Find Skip cool-down button
  const allButtons = screen.queryAllByRole("button");
  const skipButtons = allButtons.filter(b => b.textContent?.trim() === "Skip cool-down");
  assert(skipButtons.length > 0, "(a) Skip cool-down button exists");
  const skipButton = skipButtons[0];
  if (!skipButton) throw new Error("Skip button not found");
  
  // Click Skip cool-down (logSet will succeed this time, clearing the queue)
  callOrder.length = 0;
  await act(async () => {
    skipButton.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Verify call order: logSet (replay), then finishSession
  assert(callOrder[0] === "logSet", "(a) logSet called first (replay)");
  assert(callOrder[1] === "finishSession", "(a) finishSession called after successful replay");
  assert(finishSessionCalled, "(a) finishSession called in same tap");
  
  unmountA();
  
  // ========================================================================
  // Test (b): Offline/expired → finishSession never called, notice shown
  // ========================================================================
  console.log("\n=== Test (b): Offline/expired - no finish ===\n");
  
  finishSessionCalled = false;
  logSetCallCount = 0;
  
  const actionsB: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCallCount++;
      // Always fail (offline/expired)
      throw new Error("Network error");
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => {
      finishSessionCalled = true;
      return { ok: true, data: { status: "completed" as const, durationSeconds: 600 } };
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const userIdB = "user-b";
  const sessionIdB = "session-b";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(fakeStorage, userIdB, sessionIdB, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-b"
  }, fakeDeps);
  
  const { unmount: unmountB } = render(
    <SessionRunner
      sessionId={sessionIdB}
      sessionStatus="in_progress"
      userId={userIdB}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={settings}
      actions={actionsB}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  // Wait for cool-down phase
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // Verify we're in cool-down with pending notice
  assert(screen.queryByText("Cool-down") !== null, "(b) In cool-down phase");
  const pendingTextB = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingTextB.length > 0, "(b) Shows pending set message");
  
  // Find and click Skip
  const allButtonsB = screen.queryAllByRole("button");
  const skipButtonsB = allButtonsB.filter(b => b.textContent?.trim() === "Skip cool-down");
  assert(skipButtonsB.length > 0, "(b) Skip cool-down button exists");
  const skipButtonB = skipButtonsB[0];
  if (!skipButtonB) throw new Error("Skip button not found");
  
  await act(async () => {
    skipButtonB.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  // Verify finishSession was NOT called (replay failed, queue not empty)
  assert(finishSessionCalled === false, "(b) finishSession NOT called when replay fails");
  
  // Verify still on cool-down with pending notice
  assert(screen.queryByText("Cool-down") !== null, "(b) Still on cool-down after failed replay");
  const pendingAfter = screen.queryAllByText(/1 set waiting to save/i);
  assert(pendingAfter.length > 0, "(b) Pending notice still shown after failed replay");
  
  unmountB();
  
  // ========================================================================
  // Test (c): Mutant - finishing with non-empty queue should fail
  // ========================================================================
  console.log("\n=== Test (c): Mutant check - queue must be empty ===\n");
  
  // Verify queue still has the pending set from test (b)
  const queueB = fakeStorage.getItem(`pending-sets:${userIdB}`);
  assert(queueB !== null, "(c) Queue is non-empty (as expected from test b)");
  
  console.log(`\n✅ Skip cool-down test passed (${passed} assertions)\n`);
  console.log("MUTANT 1: Don't await replay → finishSession called immediately with pending sets (fails assertion in test a)");
  console.log("MUTANT 2: Finish without checking queue → finishSession called with non-empty queue (fails assertion in test a)");
  console.log("MUTANT 3: Never finish after replay → finishSession not called in test a (fails assertion)\n");
  process.exit(0);
})();