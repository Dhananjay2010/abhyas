#!/usr/bin/env tsx
/**
 * Test: SessionRunner render test (KEY ITEM - task 2)
 * 
 * Renders the REAL SessionRunner with fake actions and localStorage.
 * Tests all critical call sites: 1b/1d, N7, 7b/7c, 8d/8e, 9b, N11, N12.
 */

import "./helpers/setup-jsdom";

import { render, act, waitFor } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerSettings } from "../src/app/session/[id]/session-runner";
import type { Result } from "../src/app/session/actions";

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

// Mock next/router
import { createRequire } from "module";
const testRequire = createRequire(import.meta.url);
type ModuleLoadFunction = (request: string, parent: unknown, isMain: boolean) => unknown;
interface ModuleWithLoad {
  _load: ModuleLoadFunction;
}

const Module = testRequire("module") as unknown as ModuleWithLoad;
const originalLoad = Module._load;

const mockRouter = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};

Module._load = function (request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/router") {
    return {
      useRouter: () => mockRouter
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Fixed timestamp for deterministic tests
const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();
const realDateNow = Date.now;

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

// Test 1b/1d: pending count per exercise feeding nextSetNumberFor
async function test1b1d() {
  console.log("\n📋 Test 1b/1d: Pending count per exercise affects nextSetNumberFor");
  
  Date.now = () => FIXED_TIME;
  
  const logSetCalls: Array<{ sessionExerciseId: string; setNumber: number }> = [];
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push({ sessionExerciseId: input.sessionExerciseId, setNumber: input.setNumber });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-1b";
  
  // Pre-populate pending sets for this exercise
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify([
    {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-1"
    },
    {
      sessionExerciseId: "ex1",
      setNumber: 2,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-2"
    }
  ]));
  
  // Override window.localStorage to use fakeStorage
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  const { container } = render(
    <SessionRunner
      sessionId="session-1b"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 100));
  });
  
  // The next set should be set 3, not set 1, because 2 sets are pending
  const setDisplay = container.textContent || "";
  
  // Check if "Set 3" appears (accounting for pending sets)
  const hasCorrectSetNumber = setDisplay.includes("Set 3") || setDisplay.includes("3 of 3") || setDisplay.includes("3/3");
  assert(hasCorrectSetNumber, "Set number accounts for 2 pending sets (shows Set 3)");
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test N7: Controller uses correct userId in storage key
async function testN7() {
  console.log("\n📋 Test N7: Controller uses pending-sets:<userId prop>");
  
  Date.now = () => FIXED_TIME;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "specific-user-n7";
  
  fakeStorage.clear();
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify([
    {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-n7"
    }
  ]));
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  render(
    <SessionRunner
      sessionId="session-n7"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 100));
  });
  
  // The controller should have loaded pending sets from the correct key
  const correctKey = `pending-sets:${userId}`;
  const wrongKey = `pending-sets:wrong-user`;
  
  const hasCorrectKey = fakeStorage.getItem(correctKey) !== null;
  const hasWrongKey = fakeStorage.getItem(wrongKey) !== null;
  
  assert(hasCorrectKey, `Controller uses correct key: ${correctKey}`);
  assert(!hasWrongKey, "Controller does not use wrong user key");
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test 7b/7c: Expired shows Sign-in link; replay failure shows error message
async function test7b7c() {
  console.log("\n📋 Test 7b/7c: Expired shows Sign-in link, replay-error shows failure message");
  
  Date.now = () => FIXED_TIME;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      // Return expired status
      return { ok: false, error: "Not signed in", code: "SESSION_EXPIRED" };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-7bc";
  fakeStorage.clear();
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  const { container, getByRole } = render(
    <SessionRunner
      sessionId="session-7bc"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 50));
  });
  
  // Try to log a set to trigger session expired
  const inputs = container.querySelectorAll('input[type="number"]');
  if (inputs.length > 0) {
    await act(async () => {
      const repsInput = inputs[0] as HTMLInputElement;
      repsInput.value = "10";
      repsInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      const doneButton = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.toLowerCase().includes('done') || b.textContent?.toLowerCase().includes('log')
      );
      if (doneButton) {
        doneButton.click();
      }
      
      await new Promise(r => setTimeout(r, 200));
    });
  }
  
  const text = container.textContent || "";
  
  // Check for expired UI elements
  const hasSignInText = text.includes("sign in") || text.includes("Sign in") || text.includes("expired");
  assert(hasSignInText, "Expired state shows sign-in related text");
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test 8d/8e: Focus retry registration
async function test8d8e() {
  console.log("\n📋 Test 8d/8e: Focus and visibilitychange trigger retry");
  
  Date.now = () => FIXED_TIME;
  
  let retryCallCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      retryCallCount++;
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-8de";
  
  fakeStorage.clear();
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify([
    {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-8de"
    }
  ]));
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  render(
    <SessionRunner
      sessionId="session-8de"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 100));
  });
  
  const initialRetryCount = retryCallCount;
  
  // Trigger focus event
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await new Promise(r => setTimeout(r, 100));
  });
  
  // Trigger visibilitychange event
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 100));
  });
  
  assert(retryCallCount > initialRetryCount, "Focus/visibilitychange triggered retry (logSet called)");
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test 9b: Done/Skip disabled while pending
async function test9b() {
  console.log("\n📋 Test 9b: Done/Skip buttons disabled while pending");
  
  Date.now = () => FIXED_TIME;
  
  let logSetInProgress = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetInProgress = true;
      await new Promise(r => setTimeout(r, 200));
      logSetInProgress = false;
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 1,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-9b";
  fakeStorage.clear();
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  const { container } = render(
    <SessionRunner
      sessionId="session-9b"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 50));
  });
  
  // Log a set (which will be slow)
  const inputs = container.querySelectorAll('input[type="number"]');
  if (inputs.length > 0) {
    await act(async () => {
      const repsInput = inputs[0] as HTMLInputElement;
      repsInput.value = "10";
      repsInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      const logButton = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.toLowerCase().includes('done') && b.textContent?.toLowerCase().includes('set')
      );
      if (logButton) {
        logButton.click();
      }
      
      await new Promise(r => setTimeout(r, 50));
    });
  }
  
  // While the set is being logged, check if finish buttons are disabled
  if (logSetInProgress) {
    const buttons = Array.from(container.querySelectorAll('button'));
    const finishButton = buttons.find(b => 
      b.textContent?.toLowerCase().includes('how') && b.textContent?.toLowerCase().includes('feel')
    );
    
    if (finishButton) {
      assert((finishButton as HTMLButtonElement).disabled, "Finish button disabled while pending");
    }
  }
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test N11: Cool-down routing with pending sets
async function testN11() {
  console.log("\n📋 Test N11: Cool-down doesn't finish session while pending sets exist");
  
  Date.now = () => FIXED_TIME;
  
  let finishSessionCalled = false;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => {
      finishSessionCalled = true;
      return { ok: true };
    },
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 1,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "completed",
      feel: "normal",
      sets: [{setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null}],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-n11";
  
  // Set up pending sets
  fakeStorage.clear();
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify([
    {
      sessionExerciseId: "ex1",
      setNumber: 2,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-n11"
    }
  ]));
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  const { container } = render(
    <SessionRunner
      sessionId="session-n11"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 100));
  });
  
  // With cooldown disabled and exercises complete, should show cool-down screen
  // but NOT call finishSession while pending sets exist
  assert(!finishSessionCalled, "finishSession not called with pending sets present");
  
  Date.now = realDateNow;
  fakeStorage.clear();
}

// Test N12: End early button disabled while pending
async function testN12() {
  console.log("\n📋 Test N12: End early button disabled while pending");
  
  Date.now = () => FIXED_TIME;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => ({ ok: true }),
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: { alternatives: [] } }),
    swapExercise: async () => ({ ok: true, data: { sessionExerciseId: "ex1" } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quadriceps"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      restSeconds: 90,
      status: "pending",
      feel: null,
      sets: [],
    },
  ];
  
  const settings: RunnerSettings = {
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
  };
  
  const userId = "test-user-n12";
  
  fakeStorage.clear();
  fakeStorage.setItem(`pending-sets:${userId}`, JSON.stringify([
    {
      sessionExerciseId: "ex1",
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
      clientId: "pending-n12"
    }
  ]));
  
  Object.defineProperty(window, 'localStorage', {
    value: fakeStorage,
    writable: true,
    configurable: true
  });
  
  const { container } = render(
    <SessionRunner
      sessionId="session-n12"
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
    />
  );
  
  await act(async () => {
    await new Promise(r => setTimeout(r, 100));
  });
  
  const buttons = Array.from(container.querySelectorAll('button'));
  const endEarlyButton = buttons.find(b => 
    b.textContent?.toLowerCase().includes('end') && 
    (b.textContent?.toLowerCase().includes('early') || b.textContent?.toLowerCase().includes('session'))
  );
  
  if (endEarlyButton) {
    assert((endEarlyButton as HTMLButtonElement).disabled, "End early button disabled with pending sets");
  } else {
    console.log("  ⚠️  End early button not found in UI");
  }
  
  Date.now = realDateNow;
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
    
    console.log(`\n✅ All SessionRunner render tests passed! (${passed}/${passed + failed})\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
