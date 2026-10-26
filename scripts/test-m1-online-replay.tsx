#!/usr/bin/env tsx
/**
 * Test M1: 'online' event triggers replay with real window listeners
 * 
 * The controller should use window.addEventListener by default when no
 * addEventListener prop is injected. This test verifies that dispatching
 * a real 'online' event in jsdom triggers replay.
 */

import "./helpers/setup-jsdom";

import { render, cleanup, act } from "@testing-library/react";
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

const fakeTimer = {
  setTimeout: (callback: () => void) => {
    callback();
    return 0;
  },
  clearTimeout: () => {},
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testM1() {
  console.log("\n📋 Test M1: 'online' event triggers replay with default window listeners\n");
  
  let replayCallCount = 0;
  let shouldFailFirst = true;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCallCount++;
      // Fail the first replay to keep the pending set around
      if (shouldFailFirst && replayCallCount === 1) {
        throw new Error("Network error");
      }
      return { ok: true };
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
  
  const userId = "test-user-m1";
  const sessionId = "session-m1";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m1"
  }, fakeDeps);
  
  // Render SessionRunner WITHOUT injecting addEventListener prop
  // This forces it to use default window listeners
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
  
  // Wait for mount replays
  await act(async () => {});
  await act(async () => {});
  
  const countBeforeOnline = replayCallCount;
  console.log("  replayCallCount before online:", countBeforeOnline);
  assert(countBeforeOnline > 0, "Mount replay happened");
  
  // Allow the next replay to succeed
  shouldFailFirst = false;
  
  // Dispatch a real 'online' event on window
  await act(async () => {
    console.log("  Dispatching 'online' event...");
    window.dispatchEvent(new Event('online'));
  });
  
  await act(async () => {});
  
  console.log("  replayCallCount after online:", replayCallCount);
  assert(replayCallCount > countBeforeOnline, "M1: 'online' event triggered replay");
  
  console.log("✅ M1: 'online' event triggers replay with default window listeners\n");
  
  cleanup();
}

testM1().catch((err) => {
  console.error("❌ M1 test failed:", err.message);
  process.exit(1);
});
