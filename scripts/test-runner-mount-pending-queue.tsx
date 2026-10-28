#!/usr/bin/env tsx
/**
 * Test: Runner loads pending queue on mount (Item 7 - 8f)
 * 
 * Proves the runner loads the pending queue when it mounts.
 * Seeds the queue in storage, mounts the runner, then verifies
 * the pending count shows and replay is triggered.
 */

import "./helpers/setup-jsdom";
import { render, act, cleanup } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise } from "../src/app/session/[id]/session-runner";
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
  console.log("\n📋 Test: Runner loads pending queue on mount (Item 7 - 8f)\n");
  
  fakeStorage.clear();
  
  const logSetCalls: Array<{ sessionExerciseId: string; setNumber: number }> = [];
  
  const fakeActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      logSetCalls.push({
        sessionExerciseId: input.sessionExerciseId,
        setNumber: input.setNumber
      });
      // Fail logSet so queue stays non-empty and notice remains visible
      return { ok: false, error: "NETWORK_ERROR" };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true } as const),
    planDay: async () => ({ ok: true, data: null } as const),
    getSessionSummary: async () => ({ ok: true, data: [] } as const),
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
  
  // Verify queue is seeded
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
    />
  );
  
  // Wait for controller.load() to run in useEffect
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  // C1: Assert the queue is LOADED into UI state on mount (independent of replay)
  // "2 sets waiting to save" or similar notice must be visible
  const text = container.textContent || "";
  const hasWaitingNotice = text.includes("2 set") && (text.includes("waiting") || text.includes("pending"));
  assert(hasWaitingNotice, "C1: Queue loaded on mount - '2 sets waiting to save' visible in UI");
  
  // Wait for replay to complete (it will fail, so queue stays)
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  // Verify logSet was called (replay attempted)
  assert(logSetCalls.length > 0, "Replay attempted after mount");
  
  // Queue should NOT be cleared because logSet failed
  const queueAfter = fakeStorage.getItem("pending-sets:u1");
  assert(queueAfter !== null, "Queue kept after failed replay");
  
  cleanup();
  
  console.log(`\n✅ Runner mount pending queue test passed (${passed} assertions)\n`);
  process.exit(0);
})();
