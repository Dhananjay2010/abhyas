#!/usr/bin/env tsx
/**
 * Mutation tests R4/R4s: SessionRunner Retry button behavior
 * 
 * R4: Retry button must be visible when replay error exists
 * R4s: Clicking Retry button must call controller.replay()
 */

import "./helpers/setup-jsdom";

import { render, act, screen } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerSettings } from "../src/app/session/[id]/session-runner";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import type { PendingSetDeps } from "../src/lib/session/pending-set-deps";

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

const FIXED_TIME = new Date('2026-10-25T12:00:00Z').getTime();

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

const fakeTimer = {
  setTimeout: () => {
    // Don't call callback - let the test proceed without auto-retry
    return 0;
  },
  clearTimeout: () => {},
};

async function testR4AndR4s() {
  console.log("\n📋 Test R4/R4s/M9: Retry button visibility, replay trigger, and disabled state\n");
  
  let replayCallCount = 0;
  let logSetDeferred: ((value: { ok: true }) => void) | null = null;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      // Always throw on first mount to ensure error state and Retry button
      if (replayCallCount === 0) {
        replayCallCount++;
        throw new Error("Server timeout");
      }
      replayCallCount++;
      // Return a deferred promise to hold "retrying" state for M9
      return new Promise<{ ok: true }>((resolve) => {
        logSetDeferred = resolve;
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
  getSessionSummary: async () => ({ ok: true, data: [] }),
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
  
  const userId = "test-user-r4";
  const sessionId = "session-r4";
  
  fakeStorage.clear();
  
  // Seed 1 pending set to trigger error
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-r4"
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
      now={() => FIXED_TIME}
    />
  );
  
  // Wait for initial replay to fail
  await act(async () => {
    // Allow useEffect to run
  });
  
  await act(async () => {});
  await act(async () => {});
  await act(async () => {});
  
  // R4: Assert Retry button is visible
  const retryButtons = screen.queryAllByRole("button", { name: /retry/i });
  assert(retryButtons.length > 0, "R4: Retry button is visible after replay error");
  
  // R4e: Assert error message is shown (not just the heading)
  const errorTexts = screen.queryAllByText(/failed to save|server timeout/i);
  assert(errorTexts.length > 0, "R4e: Error heading shown after replay failure");
  
  // R4e detail: Assert the actual error message (not just heading) is present
  // getReplayErrorMessage returns the replayError, which is "Server timeout" from the mock
  const errorMessages = screen.queryAllByText(/server timeout/i);
  assert(errorMessages.length > 0, "R4e detail: Error message content shown (getReplayErrorMessage output)");
  
  const retryButton = retryButtons[retryButtons.length - 1];
  assert(retryButton !== null, "R4: Retry button element exists");
  
  // R4s: Click Retry button and assert replay is called
  const beforeClick = replayCallCount;
  await act(async () => {
    retryButton.click();
  });
  
  await act(async () => {
    // Allow state update to propagate
  });
  
  assert(replayCallCount > beforeClick, "R4s: Clicking Retry button triggers controller.replay() (replayCallCount increased)");
  
  // M9: Assert button is disabled while retrying
  const savingButtons = screen.queryAllByText(/Saving.*set/i);
  assert(savingButtons.length > 0, "M9: Button shows 'Saving...' text while retrying");
  const savingButton = savingButtons[savingButtons.length - 1];
  assert('disabled' in savingButton && savingButton.disabled === true, "M9: Button is disabled while retrying");
  
  // M9: Try to click again (should be blocked)
  const beforeSecondClick = replayCallCount;
  await act(async () => {
    savingButton.click();
  });
  
  await act(async () => {});
  
  assert(replayCallCount === beforeSecondClick, "M9: logSet NOT called again (button disabled prevents double-click)");
  
  // Resolve the deferred promise
  await act(async () => {
    if (logSetDeferred) {
      logSetDeferred({ ok: true });
    }
  });
  
  console.log(`\n✅ Tests R4/R4s/M9 passed (${passed} assertions)`);
  console.log("\nMutation R4 killed: Removing error state or Retry button breaks retry UI");
  console.log("Break: Without Retry button, users cannot manually trigger replay");
  console.log("\nMutation R4s killed: Removing replay() call on Retry button onClick breaks retry action");
  console.log("Break: Without replay(), clicking Retry does nothing");
  console.log("\nMutation M9 killed: Removing disabled={retrying} allows double-click");
  console.log("Break: Without disabled, clicking Retry twice sends duplicate logSet calls\n");
  
  fakeStorage.clear();
}

(async () => {
  try {
    await testR4AndR4s();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Tests R4/R4s failed:`, error);
    process.exit(1);
  }
})();
