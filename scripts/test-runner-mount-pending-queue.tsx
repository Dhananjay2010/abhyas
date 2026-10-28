#!/usr/bin/env tsx
/**
 * Test: Runner loads pending queue on mount (C1 mutant)
 * 
 * Proves controller.load() runs on mount and sets expired:true for non-empty queues.
 * 
 * C1 mutant: controller.load() deleted. The mount-time onFocus() still loads the queue
 * into state.pending, but doesn't set expired:true. Only load() sets that flag.
 * 
 * The test asserts on the SessionExpiredPrompt, which only shows when
 * getPendingUiMode returns "expired" (driven by state.expired === true).
 */

import "./helpers/setup-jsdom";
import { render, act, screen, cleanup } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerTimer } from "../src/app/session/[id]/session-runner";
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

const FIXED_TIME = new Date('2026-10-27T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };

const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => {
    callback();
    return setTimeout(() => {}, 999999);
  },
  clearTimeout: () => {},
};

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

(async () => {
  console.log("\n📋 Test: Runner loads pending queue on mount (C1)\n");
  
  fakeStorage.clear();
  
  const logSetCalls: Array<{ setNumber: number }> = [];
  
  const fakeActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push({ setNumber: input.setNumber });
      return { ok: false, error: "NETWORK_ERROR" };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const exercises: RunnerExercise[] = [
    {
      id: "ex1",
      exerciseId: "squat",
      name: "Barbell Squat",
      cue: null,
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 180,
      workingWeightKg: null,
      suggestedWeightKg: null,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false
    }
  ];
  
  // Seed the queue with 2 pending sets
  savePendingSet(fakeStorage, "u1", "s1", {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "c1"
  }, fakeDeps);
  
  savePendingSet(fakeStorage, "u1", "s1", {
    sessionExerciseId: "ex1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "c2"
  }, fakeDeps);
  
  const queueBefore = fakeStorage.getItem("pending-sets:u1");
  assert(queueBefore !== null, "Queue seeded in storage");
  
  // Mount the runner
  const { container } = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="u1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "metric"
      }}
      tomorrow={null}
      units="metric"
      actions={fakeActions}
      timer={fakeTimer}
      nowFn={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  await act(async () => {});
  
  // C1: Assert the SessionExpiredPrompt is shown
  // This prompt only appears when getPendingUiMode returns "expired",
  // which requires state.expired === true. Only controller.load() sets
  // expired:true when loading a non-empty queue. onFocus() doesn't set it.
  const text = container.textContent || "";
  const hasExpiredPrompt = text.toLowerCase().includes("expired") || 
                          text.toLowerCase().includes("sign") ||
                          screen.queryByText(/sign/i) !== null;
  
  assert(hasExpiredPrompt, "C1: SessionExpiredPrompt shown (controller.load() set expired:true)");
  
  // Also verify "2 sets waiting to save" is shown
  const hasWaitingNotice = text.includes("2 set") && (text.includes("waiting") || text.includes("pending"));
  assert(hasWaitingNotice, "'2 sets waiting to save' visible");
  
  cleanup();
  
  console.log(`\n✅ Runner mount pending queue test passed (${passed} assertions)\n`);
  process.exit(0);
})();
