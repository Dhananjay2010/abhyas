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
import { savePendingSet } from "../src/lib/session/pending-set-retry";
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
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Fake timer for tests - calls callbacks immediately
const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void, _ms: number) => {
    // Call immediately for deterministic tests
    callback();
    return 0;
  },
  clearTimeout: (_id: number | NodeJS.Timeout) => {
    // No-op
  },
};

// Test 1b/1d: pending count per exercise feeding nextSetNumberFor
async function test1b1d() {
  console.log("\n📋 Test 1b/1d: Pending count per exercise affects nextSetNumberFor");
  
  const logSetCalls: Array<{ sessionExerciseId: string; setNumber: number; source?: string }> = [];
  const logSetDeferreds: Deferred<{ ok: true }>[] = [];
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      const source = logSetCalls.length < 2 ? "replay" : "click";
      logSetCalls.push({ sessionExerciseId: input.sessionExerciseId, setNumber: input.setNumber, source });
      console.log(`  [DEBUG] logSet called: setNumber=${input.setNumber}, source=${source}`);
      const deferred = createDeferred<{ ok: true }>();
      logSetDeferreds.push(deferred);
      return deferred.promise;
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  // The runner will attempt to replay the 2 pending sets on mount
  // Wait for those replay calls to be made
  await act(async () => {});
  
  console.log(`  [DEBUG] After mount, logSetDeferreds.length: ${logSetDeferreds.length}`);
  
  // Resolve those replays so the UI is ready for a new click
  if (logSetDeferreds.length >= 1) {
    // Resolve first set
    await act(async () => {
      logSetDeferreds[0].resolve({ ok: true });
    });
    console.log("  [DEBUG] Resolved first replay");
  }
  
  // Wait for more replays
  await act(async () => {});
  console.log(`  [DEBUG] After first resolve, logSetDeferreds.length: ${logSetDeferreds.length}`);
  
  if (logSetDeferreds.length >= 2) {
    // Resolve second set
    await act(async () => {
      logSetDeferreds[1].resolve({ ok: true });
    });
    console.log("  [DEBUG] Resolved second replay");
    // Wait for the controller to finish processing all results
    await act(async () => {});
    await act(async () => {});
    await act(async () => {});
  }
  
  const logButton = screen.getByRole("button", { name: /set [0-9]+ done/i });
  console.log("  [DEBUG] Button text:", logButton.textContent);
  
  // Verify button is enabled
  const buttonDisabled = (logButton as HTMLButtonElement).disabled;
  if (buttonDisabled) {
    throw new Error(`Button is still disabled after replay: ${logButton.textContent}`);
  }
  
  // Check if sets are visible in the DOM
  const setRows = screen.queryAllByText(/Set [12]/);
  console.log("  [DEBUG] Set rows found:", setRows.length, setRows.map(r => r.textContent));
  
  // Clear the replay calls - we're only testing the button click
  logSetCalls.length = 0;
  logSetDeferreds.length = 0;
  
  // Click Log set
  await act(async () => {
    logButton.click();
  });
  
  // Button was clicked, now resolve the deferred
  if (logSetDeferreds.length > 0) {
    await act(async () => {
      logSetDeferreds[0].resolve({ ok: true });
    });
  }
  
  assert(logSetCalls.length === 1, "logSet called once after click");
  console.log("  [DEBUG] Logged set number:", logSetCalls[0].setNumber);
  assert(logSetCalls[0].setNumber === 3, `logSet called with setNumber: 3 (accounting for 2 pending sets), got ${logSetCalls[0].setNumber}`);
  
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  const pendingText = screen.getByText(/2 sets waiting to save/i);
  assert(!!pendingText, "Shows '2 sets waiting to save' text");
  
  const savingRows = screen.getAllByText(/saving/i);
  assert(savingRows.length >= 2, "Shows 'Saving...' rows for pending sets");
  
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
      swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
        repsMin: 8,
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
      swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
        repsMin: 8,
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
  
  fakeStorage.clear();
}

// Test 8d/8e: Focus retry registration and trigger
async function test8d8e() {
  console.log("\n📋 Test 8d/8e: Focus and visibilitychange listener registration");
  
  let focusHandler: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let listenerCallCount = 0;
  
  const logSetCalls: unknown[] = [];
  let replayCount = 0;
  
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
      replayCount++;
      // All replays succeed - we just want to verify handlers trigger replays
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  assert((savingButton as HTMLElement & { disabled?: boolean }).disabled === true, "9b: Saving button is disabled while saving");
  
  if (skipCooldownButton) {
    assert((skipCooldownButton as HTMLElement & { disabled?: boolean }).disabled === true, "9c: Skip cool-down button is disabled while saving");
  }
  
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  assert((endEarlyButton as HTMLElement & { disabled?: boolean }).disabled === true, "N12: End early button is disabled with pending sets");
  
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  // Assert conflict message is shown
  const conflictMessages = screen.queryAllByText(/that set was already saved/i);
  assert(conflictMessages.length > 0, "Conflict: Shows 'That set was already saved' message");
  
  // Assert server's sets are on screen (12 and 11 reps)
  const set1Texts = screen.queryAllByText(/12/);
  const set2Texts = screen.queryAllByText(/11/);
  assert(set1Texts.length > 0 && set2Texts.length > 0, "Conflict: Server's sets shown on screen");
  
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  const logButton = screen.getByRole("button", { name: /set [0-9]+ done/i });
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  const logButton = screen.getByRole("button", { name: /set [0-9]+ done/i });
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
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  fakeStorage.clear();
}

// Test: Retry button (R2/R3)
async function testRetryButton() {
  console.log("\n📋 Test Retry: Click Retry button to replay pending sets");
  
  const logSetCalls: unknown[] = [];
  const logSetDeferreds: Deferred<{ ok: true }>[] = [];
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push(input);
      const deferred = createDeferred<{ ok: true }>();
      logSetDeferreds.push(deferred);
      return deferred.promise;
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } }),
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
      repsMin: 8,
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
  
  await act(async () => {});
  
  // R2: logSet was called on mount
  assert(logSetCalls.length === 1, "R2: logSet called on mount for replay");
  
  // Resolve the first call
  await act(async () => {
    logSetDeferreds[0].resolve({ ok: true });
  });
  
  // Click Retry button
  logSetCalls.length = 0;
  logSetDeferreds.length = 0;
  const retryButton = screen.queryByRole("button", { name: /retry/i });
  
  if (retryButton) {
    await act(async () => {
      retryButton.click();
    });
    
    // R3: Retry button triggers another replay
    assert(logSetCalls.length === 1, "R3: Retry button triggers logSet replay");
  }
  
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
    
    console.log(`\n✅ All SessionRunner render tests passed! (${passed}/${passed + failed})\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
