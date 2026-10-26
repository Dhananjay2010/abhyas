#!/usr/bin/env tsx
/**
 * M9: Test Retry button is disabled while retrying
 * 
 * PLANTED BUG: Remove disabled={retrying} → allows double-click
 * 
 * This test reuses the same setup as test-session-runner-retry-button.tsx
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
  setTimeout: (callback: () => void) => {
    callback();
    return 0;
  },
  clearTimeout: () => {},
};

async function testM9() {
  console.log("\n📋 Test M9: Retry button disabled while retrying\n");
  
  let replayCallCount = 0;
  let logSetDeferred: ((value: { ok: true }) => void) | null = null;
  
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      if (replayCallCount === 0) {
        replayCallCount++;
        throw new Error("Network error");
      }
      replayCallCount++;
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
      units: "metric",
  };
  
  const userId = "test-user-m9";
  const sessionId = "session-m9";
  
  fakeStorage.clear();
  
  savePendingSet(fakeStorage, userId, sessionId, {
    sessionExerciseId: "ex1",
    setNumber: 1,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m9"
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
  
  await act(async () => {});
  await act(async () => {});
  
  const retryButtons = screen.queryAllByRole("button", { name: /retry/i });
  assert(retryButtons.length > 0, "Retry button is visible after replay error");
  
  const retryButton = retryButtons[retryButtons.length - 1];
  
  const beforeClick = replayCallCount;
  await act(async () => {
    retryButton.click();
  });
  
  await act(async () => {});
  
  assert(replayCallCount > beforeClick, "logSet called after clicking Retry");
  
  const savingButtons = screen.queryAllByText(/Saving.*set/i);
  assert(savingButtons.length > 0, "M9: Button shows 'Saving...' text while retrying");
  const savingButton = savingButtons[savingButtons.length - 1];
  assert('disabled' in savingButton && savingButton.disabled === true, "M9: Button is disabled while retrying");
  
  const beforeSecondClick = replayCallCount;
  await act(async () => {
    savingButton.click();
  });
  
  await act(async () => {});
  
  assert(replayCallCount === beforeSecondClick, "M9: logSet NOT called again (button disabled prevents double-click)");
  
  await act(async () => {
    if (logSetDeferred) {
      logSetDeferred({ ok: true });
    }
  });
  
  console.log(`\n✅ Test M9 passed (${passed} assertions)`);
  console.log("\nMutation M9 killed: Removing disabled={retrying} allows double-click");
  console.log("Break: Without disabled, clicking Retry twice sends duplicate logSet calls\n");
  
  fakeStorage.clear();
}

(async () => {
  try {
    await testM9();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test M9 failed:`, error);
    process.exit(1);
  }
})();
