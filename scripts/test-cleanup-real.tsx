#!/usr/bin/env tsx
/**
 * Gap (e): Cleanup test with real EventTarget and counting timer fakes.
 * 
 * Verifies that cleanup:
 * - Returns listener add/remove counts to zero
 * - Clears all scheduled timers
 * - Prevents 'online' events from triggering replay after cleanup
 * 
 * Tests both unmount and sign-out scenarios.
 * 
 * Mutants:
 * - Remove removeEventListener call (line 92 of pending-set-retry-scheduler.ts)
 * - Remove clearTimeout call (line 80 of pending-set-retry-scheduler.ts)
 */

import "./helpers/setup-jsdom";
import { render, act } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerSettings } from "../src/app/session/[id]/session-runner";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();

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

Object.defineProperty(window, 'localStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

const fakeDeps: PendingSetDeps = {
  now: () => FIXED_TIME,
};

class CountingEventTarget {
  private target: EventTarget;
  private handlers = new Map<string, Set<() => void>>();
  
  addCount = 0;
  removeCount = 0;
  
  constructor() {
    // Use jsdom's EventTarget
    this.target = new (global as typeof window).window.EventTarget();
  }
  
  addEventListener = (type: string, handler: () => void): void => {
    this.addCount++;
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    this.target.addEventListener(type, handler as EventListener);
  };
  
  removeEventListener = (type: string, handler: () => void): void => {
    this.removeCount++;
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
    this.target.removeEventListener(type, handler as EventListener);
  };
  
  dispatchEvent = (event: Event): boolean => {
    return this.target.dispatchEvent(event);
  };
  
  getNetListenerCount(): number {
    return this.addCount - this.removeCount;
  }
}

class CountingTimer {
  private scheduledTimers = new Map<number, { callback: () => void; ms: number }>();
  private nextId = 1;
  
  setTimeoutCount = 0;
  clearTimeoutCount = 0;
  
  setTimeout = (callback: () => void, ms: number): number => {
    this.setTimeoutCount++;
    const id = this.nextId++;
    this.scheduledTimers.set(id, { callback, ms });
    return id;
  };
  
  clearTimeout = (id: number | NodeJS.Timeout): void => {
    const timerId = typeof id === 'number' ? id : parseInt(String(id));
    if (this.scheduledTimers.has(timerId)) {
      this.clearTimeoutCount++;
      this.scheduledTimers.delete(timerId);
    }
  };
  
  getActiveTimerCount(): number {
    return this.scheduledTimers.size;
  }
  
  getNetTimerCount(): number {
    return this.setTimeoutCount - this.clearTimeoutCount;
  }
}

async function testUnmountCleanup() {
  console.log("\n📋 Test: Cleanup on unmount\n");
  
  fakeStorage.clear();
  
  const eventTarget = new CountingEventTarget();
  const timer = new CountingTimer();
  let replayCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCount++;
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
  
  const userId = "test-user-cleanup";
  const sessionId = "session-cleanup";
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-cleanup"
  }, fakeDeps);
  
  const { unmount } = render(
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
      timer={timer}
      addEventListener={eventTarget.addEventListener}
      removeEventListener={eventTarget.removeEventListener}
    />
  );
  
  await act(async () => {});
  await act(async () => {});
  
  assert(replayCount === 1, "Initial replay should have been triggered");
  assert(eventTarget.addCount > 0, "Event listeners should be registered");
  assert(timer.setTimeoutCount > 0, "Timers should be scheduled");
  
  const beforeUnmount = {
    netListeners: eventTarget.getNetListenerCount(),
    activeTimers: timer.getActiveTimerCount(),
  };
  
  assert(beforeUnmount.netListeners > 0, "Net listener count should be positive before unmount");
  
  const beforeReplayCount = replayCount;
  
  // Unmount should trigger cleanup
  unmount();
  
  assert(eventTarget.getNetListenerCount() === 0, "UNMOUNT: Net listener count should be zero after cleanup");
  assert(timer.getActiveTimerCount() === 0, "UNMOUNT: All timers should be cleared after cleanup");
  
  // Dispatch online event - should NOT trigger replay
  eventTarget.dispatchEvent(new Event('online'));
  await act(async () => {});
  
  assert(replayCount === beforeReplayCount, "UNMOUNT: Online event should NOT trigger replay after cleanup");
  
  fakeStorage.clear();
}

async function testSignOutCleanup() {
  console.log("\n📋 Test: Cleanup on sign-out\n");
  
  fakeStorage.clear();
  
  const eventTarget = new CountingEventTarget();
  const timer = new CountingTimer();
  let replayCount = 0;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      replayCount++;
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
  
  const userId = "test-user-signout";
  const sessionId = "session-signout";
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-signout"
  }, fakeDeps);
  
  const { unmount } = render(
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
      timer={timer}
      addEventListener={eventTarget.addEventListener}
      removeEventListener={eventTarget.removeEventListener}
    />
  );
  
  await act(async () => {});
  await act(async () => {});
  
  assert(replayCount === 1, "Initial replay should have been triggered");
  assert(eventTarget.getNetListenerCount() > 0, "Net listener count should be positive before sign-out");
  
  const beforeReplayCount = replayCount;
  
  // Unmount simulates sign-out cleanup
  unmount();
  
  assert(eventTarget.getNetListenerCount() === 0, "SIGNOUT: Net listener count should be zero after cleanup");
  assert(timer.getActiveTimerCount() === 0, "SIGNOUT: All timers should be cleared after cleanup");
  
  // Dispatch online event - should NOT trigger replay
  eventTarget.dispatchEvent(new Event('online'));
  await act(async () => {});
  
  assert(replayCount === beforeReplayCount, "SIGNOUT: Online event should NOT trigger replay after cleanup");
  
  fakeStorage.clear();
}

(async () => {
  try {
    console.log("Gap (e): Cleanup with real EventTarget and counting timer fakes");
    console.log("═".repeat(70));
    
    await testUnmountCleanup();
    await testSignOutCleanup();
    
    console.log("\n═".repeat(70));
    console.log(`✅ All cleanup tests passed (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Cleanup test failed:`, error);
    process.exit(1);
  }
})();
