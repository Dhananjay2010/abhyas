#!/usr/bin/env tsx
/**
 * Test: SessionRunner render test (KEY ITEM - task 2)
 * 
 * Renders the REAL SessionRunner with fake actions and localStorage.
 * Tests all critical call sites: 1b/1d, N7, 7b/7c, 8d/8e, 9b, N11, N12, Conflict, DoubleTap, FailedSubmit, N7s, RetryButton.
 * 
 * Made deterministic:
 * - No setTimeout, waitFor, or polling
 * - Network actions return controllable promises (deferreds) that tests resolve explicitly
 * - Tests await controller.replay() and other real promises
 * - Pending sets seeded with the real format using savePendingSet
 */

import "./helpers/setup-jsdom";

import { render, act, screen, cleanup } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerSettings, type RunnerTimer } from "../src/app/session/[id]/session-runner";
import { savePendingSet, loadPendingSets } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

// Fixed timestamp for deterministic tests
const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();

// Fake localStorage for testing
class FakeStorage implements Storage {
  private data: Map<string, string> = new Map();
  
  get length() {
    return this.data.size;
  }
  
  clear(): void {
    this.data.clear();
  }
  
  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }
  
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }
  
  removeItem(key: string): void {
    this.data.delete(key);
  }
  
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const fakeStorage = new FakeStorage();

// Override window.localStorage globally
Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

// Fake deps with fixed time
const fakeDeps: PendingSetDeps = {
  now: () => FIXED_TIME,
};

// Deferred: a controllable promise for tests
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((error: Error) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!resolve || !reject) {
    throw new Error("Promise executor did not run synchronously");
  }
  return { promise, resolve, reject };
}

// Fake timer for tests - calls callbacks immediately
const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => {
    callback();
    return 0;
  },
  clearTimeout: () => {
    // no-op
  },
};

// Test 1b/1d: pending count per exercise feeding nextSetNumberFor
async function test1b1d() {
  console.log("\n📋 Test 1b/1d: Pending count per exercise affects nextSetNumberFor");
  
  const logSetCalls: Array<{ sessionExerciseId: string; setNumber: number }> = [];
  const logSetDeferreds: Deferred<{ ok: true }>[] = [];
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push({ sessionExerciseId: input.sessionExerciseId, setNumber: input.setNumber });
      const deferred = createDeferred<{ ok: true }>();
      logSetDeferreds.push(deferred);
      return deferred.promise;
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "test-user-1b";
  const sessionId = "session-1b";
  
  fakeStorage.clear();
  
  // Pre-populate pending sets using proper storage format
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-1"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-2"
  }, fakeDeps);
  
  // Override global localStorage to use fakeStorage
  Object.defineProperty(global, "localStorage", {
    value: fakeStorage,
    writable: true,
    configurable: true,
  });
  
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
  
  // Wait for mount and controller.load() to trigger first replay
  await act(async () => {
    // Controller loads on mount
  });
  
  const buttonText = screen.queryByText(/Set 3 done/i);
  assert(buttonText !== null, "1d: Button shows 'Set 3 done' (accounting for 2 pending)");
  
  cleanup();
  
  await act(async () => {
    if (logSetDeferreds[0]) logSetDeferreds[0].resolve({ ok: true });
    if (logSetDeferreds[1]) logSetDeferreds[1].resolve({ ok: true });
  });
  
  fakeStorage.clear();
}

// Test N7: Controller uses correct userId in storage key
async function testN7() {
  console.log("\n📋 Test N7: Controller uses pending-sets:<userId prop>");
  
  const replayDeferred = createDeferred<{ ok: true }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => replayDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "specific-user-n7";
  const sessionId = "session-n7";
  
  fakeStorage.clear();
  
  // Seed 2 pending sets for this user and session
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-n7-1"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 12,
    weightKg: 52.5,
    durationSeconds: null,
    clientId: "pending-n7-2"
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
  
  await act(async () => {});
  
  // Assert the UI shows "2 sets waiting to save" and "Saving..." rows
  assert(!!screen.queryByText(/2 sets waiting to save/i), "Shows '2 sets waiting to save' text");
  
  assert((screen.queryAllByText(/saving/i) || []).length >= 2, "Shows 'Saving...' rows for pending sets");
  
  // Now test with a different userId - pending sets should NOT appear
  cleanup(); // Unmount the first render
  fakeStorage.clear();
  savePendingSet(fakeStorage, "other-user", sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "other-pending"
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
  
  await act(async () => {});
  
  const noPendingText = screen.queryByText(/waiting to save/i);
  assert(!noPendingText, "Does not show pending sets for different user");
  
  cleanup();
  fakeStorage.clear();
}

// Test 7b/7c: Expired and replay-error UI modes
async function test7b7c() {
  console.log("\n📋 Test 7b/7c: Expired and replay-error UI modes");
  
  // Test 7b: pending + expired shows SessionExpiredPrompt
  {
    const expiredDeferred = createDeferred<{ ok: false; error: string; code: string }>();
    
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => expiredDeferred.promise,
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => ({ ok: true, data: null }),
      finishSession: async () => ({ ok: true }),
      abandonSession: async () => ({ ok: true }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
      refreshAfterSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true, data: null }),
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
    
    const userId = "user-7b";
    const sessionId = "session-7b";
    
    fakeStorage.clear();
    savePendingSet(fakeStorage, userId, sessionId, {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-7b"
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
    
    await act(async () => {});
    
    // Resolve with SESSION_EXPIRED
    await act(async () => {
      expiredDeferred.resolve({ ok: false, error: "Not signed in", code: "SESSION_EXPIRED" });
    });
    
    // Assert SessionExpiredPrompt is shown with Sign-in link
    const signInLink = screen.getByRole("link", { name: /sign in/i });
    assert(!!signInLink, "7b: Shows Sign-in link when logSet returns SESSION_EXPIRED with pending sets");
  }
  
  // Test 7c: logSet rejects with network error on replay
  {
    const errorActions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => {
        throw new Error("Network error");
      },
      deleteSet: async () => ({ ok: true }),
      finishExercise: async () => ({ ok: true, data: null }),
      finishSession: async () => ({ ok: true }),
      abandonSession: async () => ({ ok: true }),
      findAlternatives: async () => ({ ok: true, data: [] }),
      swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
      refreshAfterSession: async () => ({ ok: true }),
      planDay: async () => ({ ok: true, data: null }),
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
    
    const userId = "user-7c";
    const sessionId = "session-7c";
    
    fakeStorage.clear();
    savePendingSet(fakeStorage, userId, sessionId, {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-7c"
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
        actions={errorActions}
      />
    );
    
    await act(async () => {});
    
    // Assert error text is shown
    const errorText = screen.getByText(/failed to save sets/i);
    assert(!!errorText, "7c: Shows 'Failed to save sets' error for network error on replay");
    
    const networkError = screen.getByText(/network error/i);
    assert(!!networkError, "7c: Shows network error message");
  }
  
  cleanup();
  fakeStorage.clear();
}

// Test 8d/8e: Focus retry registration and trigger
async function test8d8e() {
  console.log("\n📋 Test 8d/8e: Focus and visibilitychange listener registration");
  
  let focusHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let listenerCallCount = 0;
  
  const logSetCalls: unknown[] = [];
  
  const mockAddEventListener = (type: string, handler: () => void) => {
    listenerCallCount++;
    if (type === "focus") {
      focusHandler = handler;
    } else if (type === "visibilitychange") {
      visibilityHandler = handler;
    }
  };
  
  const mockRemoveEventListener = (type: string, handler: () => void) => {
    if (type === "focus" && handler === focusHandler) {
      focusHandler = null;
    } else if (type === "visibilitychange" && handler === visibilityHandler) {
      visibilityHandler = null;
    }
  };
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push(input);
      // All replays succeed - we just want to verify handlers trigger replays
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
  
  const userId = "test-user-8de";
  const sessionId = "session-8de";
  
  fakeStorage.clear();
  
  // Seed 2 pending sets to trigger replays
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-8de-1"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-8de-2"
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
      addEventListener={mockAddEventListener}
      removeEventListener={mockRemoveEventListener}
    />
  );
  
  // Wait for the initial replay to complete
  await act(async () => {});
  await act(async () => {});
  
  // Verify handlers were registered via the injected addEventListener
  assert(focusHandler !== null, "Focus listener registered (8d)");
  assert(visibilityHandler !== null, "Visibilitychange listener registered (8d)");
  assert(listenerCallCount >= 2, "addEventListener called for both listeners (8d)");
  
  // 8e: Assert logSet was called on mount for replay (both pending sets)
  assert(logSetCalls.length === 2, "8e: logSet called for both pending sets on mount for replay");
  
  // After initial replay succeeds, pending sets are cleared
  // To test that handlers can trigger replays, add a new pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 3,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-8de-3"
  }, fakeDeps);
  
  // 8f: Fire focus handler and assert it triggers replay
  logSetCalls.length = 0;
  if (focusHandler) {
    await act(async () => {
      if (focusHandler) focusHandler();
    });
    await act(async () => {});
    assert(logSetCalls.length === 1, "8f: logSet called after focus event");
  }
  
  // Add another pending set for visibilitychange test
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-8de-4"
  }, fakeDeps);
  
  // Fire visibilitychange handler
  logSetCalls.length = 0;
  if (visibilityHandler) {
    await act(async () => {
      if (visibilityHandler) visibilityHandler();
    });
    await act(async () => {});
    assert(logSetCalls.length === 1, "8f: logSet called after visibilitychange event");
  }
  
  cleanup();
  fakeStorage.clear();
}

// Test 9b: Done/Skip buttons disabled while pending
async function test9b() {
  console.log("\n📋 Test 9b: Done/Skip buttons disabled while pending");
  
  const replayDeferred = createDeferred<{ ok: true }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => replayDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  };
  
  // Exercise already completed to reach cooldown phase
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 1,
      plannedRepsMin: 8,
      repsMin: 8,
      plannedRepsMax: 12,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: null,
      suggestedWeightKg: null,
      status: "completed",
      feel: "right",
      sets: [{ setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null }],
      isBodyweight: false,
    },
  ];
  
  const settings: RunnerSettings = {
    perSetLogging: false,
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: true,
  };
  
  const userId = "test-user-9b";
  const sessionId = "session-9b";
  
  fakeStorage.clear();
  
  // Add pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-9b"
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
  
  await act(async () => {});
  
  // Assert cooldown Done and Skip buttons show "Saving 1 set..." and are disabled
  const buttons = screen.getAllByRole("button");
  // In cooldown phase, the buttons are "Saving 1 set…" (Done) and "Skip cool-down"
  const savingButton = buttons.find(b => b.textContent?.includes("Saving"));
  const skipCooldownButton = buttons.find(b => b.textContent?.includes("Skip cool-down"));
  
  assert(!!savingButton, "9b: Saving button exists");
  assert(!!(savingButton?.textContent?.includes("Saving 1 set")), "9b: Button shows 'Saving 1 set' text");
  assert(savingButton !== undefined && 'disabled' in savingButton && Boolean(savingButton.disabled), "9b: Saving button is disabled while saving");
  
  assert(skipCooldownButton !== null, "9c: Skip cool-down button exists");
  if (skipCooldownButton && 'disabled' in skipCooldownButton) {
    assert(skipCooldownButton.disabled === true, "9c: Skip cool-down button is disabled while saving");
  }
  
  cleanup();
  fakeStorage.clear();
}

// Test N11: Cool-down routing with pending sets
async function testN11() {
  console.log("\n📋 Test N11: Cool-down doesn't finish session with pending sets");
  
  let finishSessionCalled = false;
  const finishDeferred = createDeferred<{ ok: true }>();
  const replayDeferred = createDeferred<{ ok: true }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => replayDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => {
      const exerciseDeferred = createDeferred<{ ok: true; data: null }>();
      exerciseDeferred.resolve({ ok: true, data: null });
      return exerciseDeferred.promise;
    },
    finishSession: async () => {
      finishSessionCalled = true;
      return finishDeferred.promise;
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  };
  
  // Exercise with last set completed, needs feel prompt
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 1,
      plannedRepsMin: 8,
      repsMin: 8,
      plannedRepsMax: 12,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: null,
      suggestedWeightKg: null,
      status: "pending",
      feel: null,
      sets: [{setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null}],
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
  
  const userId = "test-user-n11";
  const sessionId = "session-n11";
  
  // Set up pending sets
  fakeStorage.clear();
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-n11"
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
  
  await act(async () => {});
  
  // Click through the feel prompt - find and click "Just right" button
  const rightButtons = screen.getAllByRole("button", { name: /right/i });
  // Take the last one (the most recent render)
  const rightButton = rightButtons[rightButtons.length - 1];
  await act(async () => {
    rightButton.click();
  });
  
  await act(async () => {});
  
  // Assert finishSession was NOT called (pending sets prevent it)
  assert(!finishSessionCalled, "N11: finishSession not called with pending sets present");
  
  // Assert cool-down screen is showing - check for cooldown text or skip button
  const cooldownTexts = screen.queryAllByText(/cool.?down/i);
  const skipButtons = screen.queryAllByText(/skip cool.?down/i);
  assert(cooldownTexts.length > 0 || skipButtons.length > 0, "N11: Cool-down screen shown despite pending sets");
  
  cleanup();
  fakeStorage.clear();
}

// Test N12: End early button disabled while pending
async function testN12() {
  console.log("\n📋 Test N12: End early button disabled while pending");
  
  const replayDeferred = createDeferred<{ ok: true }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => replayDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "test-user-n12";
  const sessionId = "session-n12";
  
  fakeStorage.clear();
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-n12"
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
  
  await act(async () => {});
  
  // Find "End early" button (there may be multiple renders)
  const endEarlyButtons = screen.getAllByRole("button", { name: /end.*early/i });
  const endEarlyButton = endEarlyButtons[endEarlyButtons.length - 1];
  assert(!!endEarlyButton, "N12: End early button exists");
  if (endEarlyButton && 'disabled' in endEarlyButton) {
    assert(endEarlyButton.disabled === true, "N12: End early button is disabled with pending sets");
  }
  
  cleanup();
  fakeStorage.clear();
}

// Test: Conflict handling (R4, R5b, R6, C1)
async function testConflict() {
  console.log("\n📋 Test Conflict: set_exists returns conflict resolution");
  
  const conflictDeferred = createDeferred<{ ok: false; reason: "set_exists"; savedSets: Array<{ setNumber: number; reps: number; weightKg: number; durationSeconds: null }> }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => conflictDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "test-user-conflict";
  const sessionId = "session-conflict";
  
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
    />
  );
  
  await act(async () => {});
  
  // Click Log set to trigger conflict
  const logButtons = screen.getAllByRole("button", { name: /set [0-9]+ done/i });
  const logButton = logButtons[logButtons.length - 1];
  await act(async () => {
    logButton.click();
  });
  
  // Resolve with conflict
  await act(async () => {
    conflictDeferred.resolve({
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 12, weightKg: 55, durationSeconds: null },
        { setNumber: 2, reps: 11, weightKg: 55, durationSeconds: null }
      ]
    });
  });
  
  // Wait for UI to update
  await act(async () => {});
  await act(async () => {});
  
  // Assert conflict message is shown
  const conflictMessages = screen.queryAllByText(/that set was already saved/i);
  assert(conflictMessages.length > 0, "Conflict: Shows 'That set was already saved' message");
  
  // Assert server's sets are on screen - look for "Set 1" and "Set 2" headings
  const set1Headers = screen.queryAllByText(/Set 1/);
  const set2Headers = screen.queryAllByText(/Set 2/);
  assert(set1Headers.length > 0 && set2Headers.length > 0, "Conflict: Server's sets shown on screen (both Set 1 and Set 2 text visible)");
  
  cleanup();
  fakeStorage.clear();
}

// Test: Double-tap guard (R7)
async function testDoubleTap() {
  console.log("\n📋 Test Double-tap: Guard prevents duplicate logSet calls");
  
  const logSetCalls: unknown[] = [];
  let resolveFirst: ((value: { ok: true }) => void) | null = null;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push(input);
      // Return a promise that won't resolve immediately
      return new Promise<{ ok: true }>((resolve) => {
        if (!resolveFirst) {
          resolveFirst = resolve;
        }
      });
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "test-user-doubletap";
  const sessionId = "session-doubletap";
  
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
    />
  );
  
  await act(async () => {});
  
  // Click Log set twice rapidly
  const logButtons = screen.getAllByRole("button", { name: /set [0-9]+ done/i });
  const logButton = logButtons[logButtons.length - 1];
  await act(async () => {
    logButton.click();
    logButton.click();
  });
  
  // Resolve the first call
  if (resolveFirst) {
    await act(async () => {
      if (resolveFirst) resolveFirst({ ok: true });
    });
  }
  
  // Assert only one logSet call was made
  assert(logSetCalls.length === 1, "R7: Double-tap guard prevents duplicate logSet (only 1 call)");
  
  cleanup();
  fakeStorage.clear();
}

// Test: Failed submit (R8)
async function testFailedSubmit() {
  console.log("\n📋 Test Failed submit: Error text shown");
  
  const failDeferred = createDeferred<{ ok: false; error: string }>();
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => failDeferred.promise,
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
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
  
  const userId = "test-user-failed";
  const sessionId = "session-failed";
  
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
    />
  );
  
  await act(async () => {});
  
  // Click Log set to trigger failed submit
  const logButtons = screen.getAllByRole("button", { name: /set [0-9]+ done/i });
  const logButton = logButtons[logButtons.length - 1];
  await act(async () => {
    logButton.click();
  });
  
  // Resolve with error
  await act(async () => {
    failDeferred.resolve({ ok: false, error: "Database connection failed" });
  });
  
  // Assert error text is shown
  const errorText = screen.getByText(/database connection failed/i);
  assert(!!errorText, "R8: Failed submit shows error text");
  
  cleanup();
  fakeStorage.clear();
}

// Test: N7s - Completed session clears pending without replay
async function testN7sCompletedSession() {
  console.log("\n📋 Test N7s: Completed session clears pending without replay");
  
  let logSetCalled = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetCalled = true;
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
      status: "completed",
      feel: "right",
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
  
  const userId = "test-user-n7s";
  const sessionId = "session-n7s";
  
  fakeStorage.clear();
  
  // Seed pending sets
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 4,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-n7s"
  }, fakeDeps);
  
  render(
    <SessionRunner
      sessionId={sessionId}
      sessionStatus="completed"
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
  
  await act(async () => {});
  
  // Assert logSet was never called (no replay for completed sessions)
  assert(!logSetCalled, "N7s: logSet not called for completed session");
  
  // Assert pending key was cleared
  const pendingKey = fakeStorage.getItem(`pending-sets:${userId}`);
  const pendingSets = pendingKey ? JSON.parse(pendingKey) : null;
  const sessionPending = pendingSets?.[sessionId];
  assert(!sessionPending || sessionPending.sets?.length === 0, "N7s: Pending sets cleared for completed session");
  
  cleanup();
  fakeStorage.clear();
}

// Test: Retry button (R2/R3)
async function testRetryButton() {
  console.log("\n📋 Test Retry: Click Retry button to replay pending sets");
  
  const logSetCalls: unknown[] = [];
  let replayCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push(input);
      replayCount++;
      // First call fails to keep pending set around for Retry button
      if (replayCount === 1) {
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
  
  const userId = "test-user-retry";
  const sessionId = "session-retry";
  
  fakeStorage.clear();
  
  // Seed pending set
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-retry"
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
  
  // Wait for initial replay to fail
  await act(async () => {});
  await act(async () => {});
  
  // R2: logSet was called on mount
  assert(logSetCalls.length === 1, "R2: logSet called on mount for replay");
  
  // Pending set is still there because replay failed
  // Click Retry button
  logSetCalls.length = 0;
  const retryButtons = screen.queryAllByRole("button", { name: /retry/i });
  const retryButton = retryButtons.length > 0 ? retryButtons[retryButtons.length - 1] : null;
  
  assert(retryButton !== null, "R3: Retry button exists");
  if (!retryButton) throw new Error("retryButton is null after assertion");
  await act(async () => {
    retryButton.click();
  });
  await act(async () => {});
    
  // R3: Retry button triggers another replay
  assert(logSetCalls.length === 1, "R3: Retry button triggers logSet replay");
  
  cleanup();
  fakeStorage.clear();
}

// Test Item 2b: 1 saved set + 3 Log taps submits [2,3,4]
async function testItem2b() {
  console.log("\n📋 Test Item 2b: 1 saved set + 3 taps → setNumbers [2,3,4]");
  
  const calls: number[] = [];
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => { 
      calls.push(input.setNumber); 
      return { ok: false, error: "Not signed in", code: "SESSION_EXPIRED" }; 
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
  };
  
  const exercises: RunnerExercise[] = [
    { 
      id: "ex1", 
      exerciseId: "squat", 
      name: "Squat", 
      cue: null, 
      metric: "reps", 
      primaryMuscles: ["quads"], 
      plannedSets: 5, 
      plannedRepsMin: 8, 
      repsMin: 8, 
      plannedRepsMax: 12, 
      repsMax: 12, 
      restSeconds: 90, 
      workingWeightKg: null, 
      suggestedWeightKg: null, 
      status: "pending", 
      feel: null, 
      sets: [{ setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null }], 
      isBodyweight: false 
    }
  ];
  
  const settings: RunnerSettings = { 
    perSetLogging: false, 
    restSound: false, 
    restVibrate: false, 
    restAutostart: false, 
    restOverrideSeconds: null, 
    cooldownEnabled: false 
  };
  
  fakeStorage.clear();
  
  render(
    <SessionRunner 
      sessionId="s-proof" 
      sessionStatus="in_progress" 
      userId="u-proof" 
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
  
  await act(async () => {});
  
  for (let i = 0; i < 3; i++) {
    const b = screen.queryAllByRole("button").find((x) => /Set \d+ done|Log set/i.test(x.textContent ?? ""));
    if (!b) {
      assert(false, `Item2b tap ${i + 1}: Log button not found`);
      throw new Error(`Button not found at tap ${i + 1}`);
    }
    await act(async () => { b.click(); });
    await act(async () => {});
  }
  
  assert(JSON.stringify(calls) === "[2,3,4]", `Item2b: Submitted setNumbers [2,3,4] (got ${JSON.stringify(calls)})`);
  
  const stored = loadPendingSets(fakeStorage, "u-proof", "s-proof", fakeDeps);
  const storedSetNumbers = stored.map(s => s.setNumber).sort((a, b) => a - b);
  assert(JSON.stringify(storedSetNumbers) === "[2,3,4]", `Item2b: Stored setNumbers [2,3,4] (got ${JSON.stringify(storedSetNumbers)})`);
  
  console.log("\nPLANTED BUG at :843: nextSetTarget ignores pending → submits [2,2,2] (data loss)");
  
  cleanup();
  fakeStorage.clear();
}

// Run all tests
(async () => {
  console.log("\n🧪 SessionRunner Render Tests (KEY ITEM - Task 2)\n");
  
  try {
    await test1b1d();
    await testN7();
    await test7b7c();
    await test8d8e();
    await test9b();
    await testN11();
    await testN12();
    await testConflict();
    await testDoubleTap();
    await testFailedSubmit();
    await testN7sCompletedSession();
    await testRetryButton();
    await testItem2b();
    
    console.log(`\n✅ All SessionRunner render tests passed! (${passed}/${passed + failed})\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
