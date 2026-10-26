#!/usr/bin/env tsx
/**
 * Test: SessionRunner offline log set queuing (jsdom render test)
 * 
 * Verifies that the SessionRunner shows a calm inline note when logging a set
 * fails due to network error, and that the set is queued for retry.
 */

import './helpers/setup-jsdom';
import { render, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerSettings } from '../src/app/session/[id]/session-runner';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function createFakeTimer() {
  const callbacks: Array<{ callback: () => void; id: number; fireAt: number }> = [];
  let nextId = 1;
  let currentTime = 0;

  return {
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++;
      callbacks.push({ callback, id, fireAt: currentTime + ms });
      return id;
    },
    clearTimeout: (id: number | NodeJS.Timeout) => {
      const index = callbacks.findIndex((c) => c.id === id);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    },
    tick: (ms: number) => {
      currentTime += ms;
      const toFire = callbacks.filter((c) => c.fireAt <= currentTime);
      toFire.forEach((c) => {
        const index = callbacks.indexOf(c);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }
        c.callback();
      });
    },
  };
}

async function testOfflineLogSetShowsCalmMessage(): Promise<boolean> {
  console.log("\n▶ Testing offline log set shows calm message...");

  let logSetAttempts = 0;
  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      logSetAttempts += 1;
      throw new TypeError("Failed to fetch");
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: 100, currentTargetReps: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true, data: undefined }),
    planDay: async () => ({ ok: true }),
  };

  const exercises: RunnerExercise[] = [
    {
      id: "ex-1",
      exerciseId: "squat",
      name: "Barbell Squat",
      cue: "Compound lower body",
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 3,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: 100,
      suggestedWeightKg: 100,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false,
    },
  ];

  const settings: RunnerSettings = {
    perSetLogging: true,
    restAutostart: true,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: true,
  };

  const timer = createFakeTimer();
  const now = 1000000;

  const { container, getByText } = render(
    <SessionRunner
      sessionId="session-1"
      sessionStatus="in_progress"
      userId="user-1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={settings}
      actions={actions}
      timer={timer}
      now={() => now}
    />
  );

  // Wait for component to mount
  await waitFor(() => {
    return container.textContent?.includes("Barbell Squat") === true;
  });

  // Find and fill the reps input
  const repsInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  assert(repsInput !== null, "Should have reps input");

  const user = userEvent.setup();
  await user.clear(repsInput);
  await user.type(repsInput, '10');

  // Find and click the "Log set" button
  const logButton = getByText(/Log set/i);
  await user.click(logButton);

  // Wait for the action to complete
  await waitFor(() => {
    return logSetAttempts > 0;
  }, { timeout: 2000 });

  assert(logSetAttempts === 1, "Should have attempted to log set");

  // Check that the calm message is shown
  await waitFor(() => {
    const hasCalmMessage = container.textContent?.includes("Saved on this phone") === true;
    return hasCalmMessage;
  }, { timeout: 2000 });

  const hasCalmMessage = container.textContent?.includes("Saved on this phone, syncing when online");
  assert(hasCalmMessage === true, "Should show calm offline message");

  // Check that raw error is NOT shown
  const hasRawError = container.textContent?.includes("Failed to fetch");
  assert(hasRawError !== true, "Should NOT show raw 'Failed to fetch' error");

  console.log("  ✓ Shows 'Saved on this phone, syncing when online'");
  console.log("  ✓ Does NOT show raw 'Failed to fetch'");

  return true;
}

async function testPendingSetBlocksFinish(): Promise<boolean> {
  console.log("\n▶ Testing pending set blocks finish...");

  const actions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async () => {
      throw new TypeError("Failed to fetch");
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true, data: null }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [], weightPrefill: null, workingWeightKg: 100, currentTargetReps: null, isBodyweight: false } }),
    refreshAfterSession: async () => ({ ok: true, data: undefined }),
    planDay: async () => ({ ok: true }),
  };

  const exercises: RunnerExercise[] = [
    {
      id: "ex-1",
      exerciseId: "squat",
      name: "Barbell Squat",
      cue: "Compound lower body",
      metric: "reps",
      primaryMuscles: ["quads"],
      plannedSets: 1,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 90,
      workingWeightKg: 100,
      suggestedWeightKg: 100,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false,
    },
  ];

  const settings: RunnerSettings = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: true,
  };

  const timer = createFakeTimer();
  const now = 1000000;

  const { container, getByText } = render(
    <SessionRunner
      sessionId="session-1"
      sessionStatus="in_progress"
      userId="user-1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={exercises}
      settings={settings}
      actions={actions}
      timer={timer}
      now={() => now}
    />
  );

  // Wait for component to mount
  await waitFor(() => {
    return container.textContent?.includes("Barbell Squat") === true;
  });

  // Log a set that fails
  const repsInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  const user = userEvent.setup();
  await user.clear(repsInput);
  await user.type(repsInput, '10');

  const logButton = getByText(/Log set/i);
  await user.click(logButton);

  // Wait for the set to be queued
  await waitFor(() => {
    return container.textContent?.includes("Saved on this phone") === true;
  }, { timeout: 2000 });

  // Click "Done" to finish the exercise
  const doneButton = getByText(/Done/i);
  await user.click(doneButton);

  // Wait for cool-down screen
  await waitFor(() => {
    return container.textContent?.includes("Cool-down") === true;
  }, { timeout: 2000 });

  // Check that the warning is shown
  const hasWarning = container.textContent?.includes("syncing") === true;
  assert(hasWarning, "Should show syncing warning on cool-down screen");

  // Check that finish button is disabled
  const finishButtons = Array.from(container.querySelectorAll('button')).filter(
    btn => btn.textContent?.includes("Saving")
  );
  assert(finishButtons.length > 0, "Should have 'Saving' button");
  assert(finishButtons[0].disabled, "Finish button should be disabled");

  console.log("  ✓ Finish button blocked with 'Saving 1 set…'");
  console.log("  ✓ Warning shown on cool-down screen");

  return true;
}

console.log("Testing SessionRunner Offline Log Set");
console.log("=====================================");

(async () => {
  try {
    let allPassed = true;

    const result1 = await testOfflineLogSetShowsCalmMessage();
    if (!result1) {
      allPassed = false;
    }

    const result2 = await testPendingSetBlocksFinish();
    if (!result2) {
      allPassed = false;
    }

    if (allPassed) {
      console.log("\n✅ All SessionRunner offline tests passed\n");
      process.exit(0);
    } else {
      console.log("\n❌ Some tests failed\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Test error:", error);
    process.exit(1);
  }
})();
