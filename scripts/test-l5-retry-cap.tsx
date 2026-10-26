#!/usr/bin/env tsx
/**
 * Test L5: Replay retry cap at 5 attempts
 * 
 * After 5 failed replay attempts, auto-retry should stop.
 * The error should remain visible with a manual Retry button.
 * Uses injected clock for deterministic timing (no real timers).
 */

import "./helpers/setup-jsdom";

import { render, screen, cleanup, act } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type RunnerSettings, type SessionActions } from "@/app/session/[id]/session-runner";
import { savePendingSet } from "@/lib/session/pending-set-retry";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";

const fakeStorage = new Map<string, string>();
const storage = {
  getItem: (key: string) => fakeStorage.get(key) ?? null,
  setItem: (key: string, value: string) => fakeStorage.set(key, value),
  removeItem: (key: string) => fakeStorage.delete(key),
  clear: () => fakeStorage.clear(),
  get length() { return fakeStorage.size; },
  key: (index: number) => Array.from(fakeStorage.keys())[index] ?? null,
};

Object.defineProperty(window, 'localStorage', { value: storage, writable: true });

const fakeDeps = createPendingSetDeps(() => Date.now());
const FIXED_TIME = new Date("2026-01-15T10:00:00Z").getTime();

// Controllable fake timer - stores callbacks so we can trigger them manually
let scheduledCallback: (() => void) | null = null;
const controllableClock = {
  setTimeout: (callback: () => void) => {
    scheduledCallback = callback;
    return 0;
  },
  clearTimeout: () => {
    scheduledCallback = null;
  },
};

function triggerScheduledRetry() {
  if (scheduledCallback) {
    const cb = scheduledCallback;
    scheduledCallback = null;
    cb();
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testL5() {
  console.log("\n📋 Test L5: Replay retry cap at 5 attempts\n");
  
  let replayCallCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCallCount++;
      // Always fail to trigger retry cap
      throw new Error("Persistent server error");
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const exercises: RunnerExercise[] = [
    {
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
    },
  ];
  
  const settings: RunnerSettings = {
    perSetLogging: false,
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-l5";
  const sessionId = "session-l5";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-l5"
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
      timer={controllableClock}
      now={() => FIXED_TIME}
    />
  );
  
  // Wait for mount replay (attempt 1)
  await act(async () => {});
  console.log("  After mount: replayCallCount =", replayCallCount);
  assert(replayCallCount === 1, "L5: First replay attempt happened");
  assert(scheduledCallback !== null, "L5: Auto-retry was scheduled after first failure");
  
  // Trigger auto-retries 2-5
  for (let i = 2; i <= 5; i++) {
    await act(async () => {
      triggerScheduledRetry();
    });
    await act(async () => {});
    console.log(`  After auto-retry ${i}: replayCallCount =`, replayCallCount);
    if (i < 5) {
      assert(scheduledCallback !== null, `L5: Auto-retry scheduled after attempt ${i}`);
    }
  }
  
  assert(replayCallCount === 5, "L5: Exactly 5 replay attempts were made");
  assert(scheduledCallback === null, "L5: No auto-retry scheduled after 5th attempt (cap reached)");
  
  // Error should be visible
  const errorTexts = screen.queryAllByText(/failed to save|persistent server error/i);
  assert(errorTexts.length > 0, "L5: Error is visible after 5 failed attempts");
  
  // Retry button should be present
  const retryButtons = screen.queryAllByRole("button", { name: /retry/i });
  assert(retryButtons.length > 0, "L5: Manual Retry button is visible");
  
  // Click manual Retry button - should reset counter and allow replay again
  const retryButton = screen.getAllByRole("button", { name: /retry saving/i })[0];
  await act(async () => {
    retryButton.click();
  });
  await act(async () => {});
  
  assert(replayCallCount === 6, "L5: Manual Retry button triggers replay after cap");
  assert(scheduledCallback !== null, "L5: Auto-retry re-enabled after manual retry");
  
  console.log("✅ L5: Replay retry cap works correctly\n");
  
  cleanup();
}

testL5().catch((err) => {
  console.error("❌ L5 test failed:", err.message);
  process.exit(1);
});
