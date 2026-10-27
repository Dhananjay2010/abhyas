#!/usr/bin/env tsx
/**
 * Test: F5 - allSetsDone counts pending sets
 * 
 * Verifies that when last planned set is pending:
 * - No "Log set N+1" button shown
 * - allSetsDone is true when confirmed + pending >= planned
 * 
 * Mutant: Revert to not counting pending → shows "Log set 6" on 5-set exercise
 */

import "./helpers/setup-jsdom";
import { render, screen, act } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { SessionActions, RunnerExercise, RunnerSettings, RunnerTimer } from "../src/app/session/[id]/session-runner";
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

const FIXED_TIME = new Date('2026-10-26T12:00:00Z').getTime();
const fakeDeps: PendingSetDeps = { now: () => FIXED_TIME };
const fakeTimer: RunnerTimer = {
  setTimeout: (callback: () => void) => { callback(); return setTimeout(() => {}, 999999); },
  clearTimeout: () => {},
};

(async () => {
  console.log("\n📋 Test F5: allSetsDone counts pending sets\n");
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      // Hold forever to keep set pending
      return new Promise(() => {});
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true, data: { status: "completed" as const, durationSeconds: 600 } }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true }),
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: [] }),
  };
  
  const exercises: RunnerExercise[] = [{
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
    sets: [
      { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
      { setNumber: 2, reps: 10, weightKg: 50, durationSeconds: null },
      { setNumber: 3, reps: 10, weightKg: 50, durationSeconds: null },
      { setNumber: 4, reps: 10, weightKg: 50, durationSeconds: null },
    ],
    isBodyweight: false,
  }];
  
  const settings: RunnerSettings = {
    perSetLogging: true,
    restSound: false,
    restVibrate: false,
    restAutostart: false,
    restOverrideSeconds: null,
    cooldownEnabled: false,
      units: "metric",
  };
  
  const userId = "test-user-f5";
  const sessionId = "session-f5";
  
  fakeStorage.clear();
  
  // Seed 1 pending set (the 5th/last set)
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 5,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-f5"
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
      nowFn={() => FIXED_TIME}
    />
  );
  
  await act(async () => {});
  await act(async () => {});
  
  // With 4 confirmed + 1 pending = 5 total, should NOT show "Log set 6"
  const logSet6Button = screen.queryByText(/Log set 6/i);
  assert(logSet6Button === null, "Does NOT show 'Log set 6' (5 sets planned, 4 confirmed + 1 pending)");
  
  // Should show feel rating buttons (allSetsDone = true)
  const feelButton = screen.queryByRole("button", { name: /Just right/i });
  assert(feelButton !== null, "Shows feel rating buttons (allSetsDone includes pending)");
  
  console.log(`\n✅ F5 allSetsDone test passed (${passed} assertions)\n`);
  console.log("MUTANT: Revert allSetsDone calculation → shows 'Log set 6', test fails\n");
  process.exit(0);
})();