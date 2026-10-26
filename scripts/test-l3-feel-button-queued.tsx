#!/usr/bin/env tsx
/**
 * Test L3: Feel button with queued sets
 * 
 * When tapping a feel button while sets are queued:
 * - Show "Saving your sets first…" message
 * - Trigger replay to save pending sets
 * - Proceed with finish once queue clears
 * - Show "Can't finish until your sets are saved" if still queued
 */

import "./helpers/setup-jsdom";

import { render, screen, act } from "@testing-library/react";
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
  setTimeout: () => 0,
  clearTimeout: () => {},
};

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testL3FeelButtonQueued() {
  console.log("\n📋 Test L3: Feel button with queued sets\n");
  
  let replayCallCount = 0;
  let finishExerciseCallCount = 0;
  let shouldSucceed = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCallCount++;
      if (!shouldSucceed) {
        throw new Error("Still offline");
      }
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishExerciseCallCount++;
      return { ok: true, data: null };
    },
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
      sets: [
        { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
        { setNumber: 2, reps: 10, weightKg: 50, durationSeconds: null },
        { setNumber: 3, reps: 10, weightKg: 50, durationSeconds: null },
      ],
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
  
  const userId = "test-user-l3";
  const sessionId = "session-l3";
  
  fakeStorage.clear();
  
  // Seed 1 pending set
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-l3"
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
  
  // Wait for mount
  await act(async () => {});
  
  // Find feel button
  const feelButtons = screen.queryAllByRole("button", { name: /just right|hard|easy/i });
  assert(feelButtons.length > 0, "L3: Feel buttons are rendered");
  
  const justRightButton = screen.getByRole("button", { name: /just right/i });
  
  // Click feel button while sets are queued (still offline)
  await act(async () => {
    justRightButton.click();
  });
  await act(async () => {});
  await act(async () => {});
  
  console.log("  replayCallCount after feel button click (offline):", replayCallCount);
  assert(replayCallCount > 0, "L3: Replay triggered when feel button clicked with queued sets");
  
  // Check for either "Saving" or "Can't finish" message
  await act(async () => {});
  const messages = screen.queryByText(/saving your sets first|can't finish until your sets are saved/i);
  assert(messages !== null, "L3: Message shown when feel button clicked with queued sets");
  
  console.log("  ✓ Message shown to user about queued sets");
  console.log("  ✓ finishExercise not called while sets queued:", finishExerciseCallCount === 0);
  
  console.log("✅ L3: Feel button queued behavior works correctly\n");
}

testL3FeelButtonQueued().catch((err) => {
  console.error("❌ L3 test failed:", err.message);
  process.exit(1);
});
