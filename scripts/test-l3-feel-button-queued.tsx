#!/usr/bin/env tsx
/**
 * Test L3: Feel button with queued sets
 * 
 * When tapping a feel button while sets are queued:
 * - Trigger replay to save pending sets
 * - Show message about saving/blocking
 */

import "./helpers/setup-jsdom";

import { render, screen, act } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type RunnerSettings, type SessionActions } from "@/app/session/[id]/session-runner";
import { savePendingSet } from "@/lib/session/pending-set-retry";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";

const FIXED_TIME = new Date("2026-01-15T10:00:00Z").getTime();

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
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCallCount++;
      // Always fail to keep sets queued
      throw new Error("Still offline");
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
  const deps = createPendingSetDeps(() => FIXED_TIME);
  savePendingSet(storage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-l3"
  }, deps);
  
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
  const replayCountBefore = replayCallCount;
  
  // Click feel button - this will trigger async onClick but we don't await it
  // The onClick is async and updates state, which causes act warnings, but
  // for this test we just verify the button is wired to trigger replay
  justRightButton.click();
  
  // Wait for any immediate state updates
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  
  // Verify replay was triggered by the feel button click
  assert(replayCallCount > replayCountBefore, "L3: Replay triggered when feel button clicked with queued sets");
  
  // Verify finishExercise was NOT called (sets still queued)
  assert(finishExerciseCallCount === 0, "L3: finishExercise NOT called while sets queued");
  
  console.log("  ✓ Feel button triggers replay when sets queued");
  console.log("  ✓ finishExercise blocked while sets queued");
  console.log("✅ L3: Feel button queued behavior works correctly\n");
}

testL3FeelButtonQueued().then(() => {
  console.log("Test completed successfully");
  process.exit(0);
}).catch((err) => {
  console.error("❌ L3 test failed:", err.message);
  process.exit(1);
});
