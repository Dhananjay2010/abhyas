/**
 * M9: Test Retry button is disabled while retrying
 * 
 * PLANTED BUG: Remove disabled={retrying} → allows double-click
 */

import "./helpers/setup-jsdom";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
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
let logSetResolve: (() => void) | null = null;

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
    // Return a deferred promise to hold "retrying" state
    return new Promise<{ ok: true; data: { setId: string } }>((resolve) => {
      logSetResolve = () => resolve({ ok: true, data: { setId: "set-1" } });
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
};

async function runTest() {
  let container: HTMLElement;
  
  await act(async () => {
    const result = render(
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
    container = result.container;
  });

  // Wait for the controller to load and display the retry button
  await waitFor(
    () => {
      const retryButton = screen.queryByText(/Retry saving/i);
      if (!retryButton) {
        throw new Error("Retry button not found");
      }
      assert(retryButton !== null, "Retry button found after controller load");
    },
    { timeout: 5000 }
  );

  const retryButton = screen.getByText(/Retry saving/i);
  assert(retryButton instanceof HTMLButtonElement, "Retry button is HTMLButtonElement");
  assert(!retryButton.disabled, "Retry button initially enabled");

  // Click retry
  await act(async () => {
    fireEvent.click(retryButton);
  });

  assert(logSetCalls === 1, "logSet called once after clicking Retry");

  // Button should now be disabled while retrying
  await waitFor(() => {
    const savingButton = screen.queryByText(/Saving.*set/i);
    if (!savingButton) {
      throw new Error("Saving button not found");
    }
    assert(savingButton !== null, "M9: Button shows 'Saving...' text while retrying");
  });

  const savingButton = screen.getByText(/Saving.*set/i);
  assert(savingButton instanceof HTMLButtonElement, "M9: Saving button is HTMLButtonElement");
  assert(savingButton.disabled, "M9: Button is disabled while retrying");

  // Try to click again (should be blocked)
  await act(async () => {
    fireEvent.click(savingButton);
  });

  assert(logSetCalls === 1, "M9: logSet NOT called again (button disabled prevents double-click)");

  console.log("\n✅ M9 TEST PASSED: Retry button disabled during replay\n");
  process.exit(0);
}

runTest().catch((e) => {
  console.error("\n❌ M9 TEST FAILED:", e);
  process.exit(1);
});
