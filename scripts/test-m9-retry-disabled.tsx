/**
 * M9: Test Retry button is disabled while retrying
 * 
 * PLANTED BUG: Remove disabled={retrying} → allows double-click
 */

import "./helpers/setup-jsdom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { RunnerExercise, SessionActions } from "../src/app/session/[id]/session-runner";
import { SESSION_EXPIRED_CODE } from "../src/lib/session/auth-result";

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

console.log("\n🧪 M9 TEST: Retry button disabled while retrying\n");

let logSetCalls = 0;
let logSetResolve: ((value: { ok: true; data: { setId: string } }) => void) | null = null;
let throwExpired = true;

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

const actions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => {
    console.log("[TEST] logSet called, throwExpired=", throwExpired);
    logSetCalls++;
    if (throwExpired) {
      throw new Error(`${SESSION_EXPIRED_CODE}: Session expired`);
    }
    // Return a deferred promise to hold "retrying" state
    return new Promise<{ ok: true; data: { setId: string } }>((resolve) => {
      logSetResolve = resolve;
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

  // Find and click "Log set 1" to create a pending set
  const logButton = screen.getByText(/Log set 1/i);
  assert(logButton !== null, "Log button found");

  // Fill in reps field
  const repsInput = screen.getByLabelText(/reps|seconds/i);
  assert(repsInput !== null, "Reps input found");
  
  await act(async () => {
    fireEvent.change(repsInput, { target: { value: "10" } });
  });

  // Fill in weight field
  const weightInput = screen.getByLabelText(/weight/i);
  assert(weightInput !== null, "Weight input found");
  
  await act(async () => {
    fireEvent.change(weightInput, { target: { value: "60" } });
  });

  // Click Log set - this will throw SESSION_EXPIRED and create a pending set
  await act(async () => {
    fireEvent.click(logButton);
  });

  // Flush microtasks to let the logSet call happen
  await act(async () => {});

  assert(logSetCalls === 1, "logSet called once, threw SESSION_EXPIRED");

  // Now the UI should show "Retry saving 1 set"
  const retryButton = screen.queryByText(/Retry saving 1 set/i);
  assert(retryButton !== null, "Retry button appeared after failed save");
  assert(!('disabled' in retryButton && retryButton.disabled), "Retry button initially enabled");

  // Swap logSet to return a deferred promise
  throwExpired = false;

  // Click Retry
  await act(async () => {
    fireEvent.click(retryButton);
  });

  // Flush microtasks
  await act(async () => {});

  assert(logSetCalls === 2, "logSet called again after clicking Retry");

  // Button should now show "Saving 1 set…" and be disabled
  const savingButton = screen.queryByText(/Saving 1 set/i);
  assert(savingButton !== null, "M9: Button shows 'Saving...' text while retrying");
  assert('disabled' in savingButton && savingButton.disabled === true, "M9: Button is disabled while retrying");

  // Try to click again (should be blocked)
  await act(async () => {
    fireEvent.click(savingButton);
  });

  await act(async () => {});

  assert(logSetCalls === 2, "M9: logSet NOT called again (button disabled prevents double-click)");

  // Resolve the deferred promise
  if (logSetResolve) {
    await act(async () => {
      logSetResolve({ ok: true, data: { setId: "set-1" } });
    });
  }

  // Final state: button should be gone (pending sets cleared)
  const finalRetryButton = screen.queryByText(/Retry saving/i);
  assert(finalRetryButton === null, "Retry button gone after successful save");

  console.log("\n✅ M9 TEST PASSED: Retry button disabled during replay\n");
  process.exit(0);
}

runTest().catch((e) => {
  console.error("\n❌ M9 TEST FAILED:", e);
  process.exit(1);
});
