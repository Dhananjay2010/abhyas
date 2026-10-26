#!/usr/bin/env tsx
/**
 * Test L6: Double-tap guard with busyRef
 * 
 * The busyRef prevents concurrent execution of onFinishExercise.
 * If a user double-taps the feel button, the second tap should be ignored.
 */

import "./helpers/setup-jsdom";

import { render, screen, act } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type RunnerSettings, type SessionActions } from "@/app/session/[id]/session-runner";
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

async function testL6DoubleTapGuard() {
  console.log("\n📋 Test L6: Double-tap guard with busyRef\n");
  
  let finishExerciseCallCount = 0;
  let finishInProgress = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      finishExerciseCallCount++;
      finishInProgress = true;
      // Simulate slow operation
      await new Promise(resolve => setTimeout(resolve, 100));
      finishInProgress = false;
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
  
  const userId = "test-user-l6";
  const sessionId = "session-l6";
  
  fakeStorage.clear();
  
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
  assert(feelButtons.length > 0, "L6: Feel buttons are rendered");
  
  const justRightButton = screen.getByRole("button", { name: /just right/i });
  
  // Double-click rapidly
  justRightButton.click();
  justRightButton.click();  // Second click should be ignored by busyRef
  
  // Wait for async operations
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  
  // busyRef should prevent the second click from calling finishExercise again
  assert(finishExerciseCallCount === 1, "L6: finishExercise called only once (busyRef prevents double-tap)");
  
  console.log("  ✓ busyRef prevents double-tap");
  console.log("  ✓ finishExercise called exactly once");
  console.log("✅ L6: Double-tap guard works correctly\n");
}

testL6DoubleTapGuard().then(() => {
  console.log("Test completed successfully");
  process.exit(0);
}).catch((err) => {
  console.error("❌ L6 test failed:", err.message);
  process.exit(1);
});
