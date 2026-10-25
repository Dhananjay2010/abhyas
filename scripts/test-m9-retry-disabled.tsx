/**
 * M9: Test Retry button is disabled while retrying
 * 
 * PLANTED BUG: Remove disabled={retrying} → allows double-click
 */

import "./helpers/setup-jsdom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { RunnerExercise, SessionActions } from "../src/app/session/[id]/session-runner";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = 1700000000000;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n  🐛 ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✓ ${message}`);
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

Object.defineProperty(window, 'localStorage', {
  value: new FakeStorage(),
  writable: true,
  configurable: true
});

const deps = createPendingSetDeps(FIXED_TIME);

console.log("\n🧪 M9 TEST: Retry button disabled while retrying\n");

let logSetCalls = 0;

const exercise: RunnerExercise = {
  id: "ex-1",
  exerciseId: "bench-press",
  name: "Bench Press",
  cue: null,
  metric: "reps",
  primaryMuscles: ["chest"],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  plannedRepsMin: 8,
  plannedRepsMax: 12,
  restSeconds: 90,
  workingWeightKg: 60,
  suggestedWeightKg: 60,
  status: "pending",
  feel: null,
  sets: [],
  isBodyweight: false,
};

// Seed a pending set
savePendingSet(window.localStorage, "test-user", "test-session", {
  sessionExerciseId: "ex-1",
  setNumber: 1,
  reps: 10,
  weightKg: 60,
  durationSeconds: null,
  clientId: "ex-1:1:1700000000000",
}, deps);

const actions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => {
    logSetCalls++;
    // Return a promise that hangs indefinitely to simulate slow network
    return new Promise(() => {
      // Never resolves
    });
  },
  deleteSet: async () => ({ ok: true }),
  finishExercise: async () => ({ ok: true, data: { outcome: "hold", message: "", personalBest: null } }),
  finishSession: async () => ({ ok: true }),
  abandonSession: async () => ({ ok: true }),
  planDay: async () => ({ ok: true }),
  refreshAfterSession: async () => ({ ok: true }),
  swapExercise: async () => ({ ok: true, data: { workingWeightKg: null, currentTargetReps: null, isBodyweight: false } }),
  findAlternatives: async () => ({ ok: true, data: [] }),
} as unknown as SessionActions;

async function runTest() {
  render(
    <SessionRunner
      sessionId="test-session"
      sessionStatus="in_progress"
      userId="test-user"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise]}
      settings={{
        perSetLogging: true,
        restAutostart: false,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
      }}
      actions={actions}
    />
  );

  // Wait for retry button to appear
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  const retryButton = screen.queryByText(/Retry saving/i);
  assert(!!retryButton, "Retry button found");
  assert(!(retryButton as HTMLButtonElement).disabled, "Retry button initially enabled");

  // Click retry
  await act(async () => {
    fireEvent.click(retryButton!);
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  assert(logSetCalls === 1, "logSet called once after clicking Retry");

  // Button should now be disabled while retrying
  const retryButtonDuringReplay = screen.queryByText(/Saving.*set/i);
  assert(!!retryButtonDuringReplay, "M9: Button shows 'Saving...' text while retrying");
  assert((retryButtonDuringReplay as HTMLButtonElement).disabled, "M9: Button is disabled while retrying");

  // Try to click again (should be blocked)
  await act(async () => {
    fireEvent.click(retryButtonDuringReplay!);
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  assert(logSetCalls === 1, "M9: logSet NOT called again (button disabled prevents double-click)");

  console.log("\n✅ M9 TEST PASSED: Retry button disabled during replay\n");
  process.exit(0);
}

runTest().catch((e) => {
  console.error("\n❌ M9 TEST FAILED:", e);
  process.exit(1);
});
