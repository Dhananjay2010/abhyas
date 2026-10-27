#!/usr/bin/env tsx
/**
 * Test cd1: Cool-down must clear rest persistence ONLY after finishSession succeeds.
 * 
 * Tests real SessionRunner component with jsdom and typed fakes.
 * 
 *   npx tsx scripts/test-cd1-runner-rest-clearance.tsx
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, screen, cleanup } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
  type RunnerSettings,
} from "../src/app/session/[id]/session-runner";
import type { StorageAdapter } from "../src/lib/session/rest-timer-persistence";

function createFakeStorage(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

// Set up fake sessionStorage BEFORE main()
const fakeStorage = createFakeStorage();
Object.defineProperty(global, "sessionStorage", {
  value: fakeStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "sessionStorage", {
    value: fakeStorage,
    writable: true,
    configurable: true,
  });
}

// Mock Date.now to control time
const now = 1000000;
Date.now = () => now;

let passedCd1 = 0;
let failedCd1 = 0;

function assertEqualsCd1<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passedCd1++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failedCd1++;
  }
}

function makeExercise(id: string, name: string, status: "pending" | "completed" | "skipped"): RunnerExercise {
  return {
    id,
    exerciseId: "ex-1",
    name,
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    restSeconds: 90,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status,
    feel: status === "completed" ? "right" : null,
    sets: status === "completed" ? [
      { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
      { setNumber: 2, reps: 10, weightKg: 50, durationSeconds: null },
      { setNumber: 3, reps: 10, weightKg: 50, durationSeconds: null },
    ] : [],
    isBodyweight: false,
  };
}

const settings: RunnerSettings = {
  perSetLogging: true,
  restAutostart: true,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: true,
  units: "metric" as const,
};

const ok = async () => ({ ok: true }) as const;

(async function main() {
console.log("\ncd1: Rest persistence cleared only after finishSession succeeds\n");

console.log("1. Done button: finishSession fails - rest persistence NOT cleared");
{
  const SESSION_ID = "test-session-1";
  const restKey = `abhyas:rest:${SESSION_ID}`;
  
  // Clear and pre-seed storage
  fakeStorage.data.clear();
  fakeStorage.setItem(restKey, JSON.stringify({
    sessionId: SESSION_ID,
    sessionExerciseId: "ex-completed-1",
    restEndsAt: now + 90000,
  }));

  let finishAttempts = 0;
  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishAttempts++;
      return { ok: false, error: "Network error" };
    },
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => ({ ok: true as const, data: {
      metric: "reps" as const,
      repsMin: 8,
      repsMax: 12,
      equipmentIds: [],
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: false,
    }}),
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  };

  render(
    <SessionRunner
      sessionId={SESSION_ID}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[makeExercise("ex-completed-1", "Bench Press", "completed")]}
      settings={settings}
      actions={actions}
    />
  );

  await act(async () => {
    await waitFor(() => {
      const btn = screen.queryByText(/Done/i);
      if (!btn) throw new Error("Waiting for Done button");
    }, { timeout: 2000 });
  });

  const cooldownButton = screen.getByText(/Done/i);

  assertEqualsCd1(!!cooldownButton, true, "Cool-down Done button present");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence exists before finish");

  await act(async () => {
    cooldownButton.click();
    await waitFor(() => finishAttempts > 0, { timeout: 1000 });
  });

  assertEqualsCd1(finishAttempts, 1, "finishSession was called");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence NOT cleared after failed finish");
  
  cleanup();
}

console.log("\n2. Done button: finishSession succeeds - rest persistence cleared");
{
  const SESSION_ID = "test-session-2";
  const restKey = `abhyas:rest:${SESSION_ID}`;
  
  // Clear and pre-seed storage
  fakeStorage.data.clear();
  fakeStorage.setItem(restKey, JSON.stringify({
    sessionId: SESSION_ID,
    sessionExerciseId: "ex-completed-2",
    restEndsAt: now + 90000,
  }));

  let finishAttempts = 0;
  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async (params: { sessionId: string; durationSeconds: number; cooldownCompleted: boolean }) => {
      finishAttempts++;
      return {
        ok: true,
        data: {
          status: "completed" as const,
          durationSeconds: params.durationSeconds,
        },
      };
    },
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => ({ ok: true as const, data: {
      metric: "reps" as const,
      repsMin: 8,
      repsMax: 12,
      equipmentIds: [],
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: false,
    }}),
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  };

  render(
    <SessionRunner
      sessionId={SESSION_ID}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[makeExercise("ex-completed-2", "Squat", "completed")]}
      settings={settings}
      actions={actions}
    />
  );

  await act(async () => {
    await waitFor(() => {
      const btn = screen.queryByText(/Done/i);
      if (!btn) throw new Error("Waiting for Done button");
    }, { timeout: 2000 });
  });

  const cooldownButton = screen.getByText(/Done/i);

  assertEqualsCd1(!!cooldownButton, true, "Cool-down Done button present");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence exists before finish");

  await act(async () => {
    cooldownButton.click();
    await waitFor(() => finishAttempts > 0, { timeout: 1000 });
    await waitFor(() => !fakeStorage.data.has(restKey), { timeout: 1000 });
  });

  assertEqualsCd1(finishAttempts, 1, "finishSession was called");
  assertEqualsCd1(fakeStorage.data.has(restKey), false, "rest persistence cleared after successful finish");
  
  cleanup();
}

console.log("\n3. Skip button: finishSession fails - rest persistence NOT cleared");
{
  const SESSION_ID = "test-session-3";
  const restKey = `abhyas:rest:${SESSION_ID}`;
  
  // Clear and pre-seed storage
  fakeStorage.data.clear();
  fakeStorage.setItem(restKey, JSON.stringify({
    sessionId: SESSION_ID,
    sessionExerciseId: "ex-completed-3",
    restEndsAt: now + 90000,
  }));

  let finishAttempts = 0;
  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishAttempts++;
      return { ok: false, error: "Network error" };
    },
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => ({ ok: true as const, data: {
      metric: "reps" as const,
      repsMin: 8,
      repsMax: 12,
      equipmentIds: [],
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: false,
    }}),
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  };

  render(
    <SessionRunner
      sessionId={SESSION_ID}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[makeExercise("ex-completed-3", "Deadlift", "completed")]}
      settings={settings}
      actions={actions}
    />
  );

  await act(async () => {
    await waitFor(() => {
      const btn = screen.queryByText(/Skip/i);
      if (!btn) throw new Error("Waiting for Skip button");
    }, { timeout: 2000 });
  });

  const skipButton = screen.getByText(/Skip/i);

  assertEqualsCd1(!!skipButton, true, "Skip cool-down button present");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence exists before finish");

  await act(async () => {
    skipButton.click();
    await waitFor(() => finishAttempts > 0, { timeout: 1000 });
  });

  assertEqualsCd1(finishAttempts, 1, "finishSession was called");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence NOT cleared after failed finish");
  
  cleanup();
}

console.log("\n4. Skip button: finishSession succeeds - rest persistence cleared");
{
  const SESSION_ID = "test-session-4";
  const restKey = `abhyas:rest:${SESSION_ID}`;
  
  // Clear and pre-seed storage
  fakeStorage.data.clear();
  fakeStorage.setItem(restKey, JSON.stringify({
    sessionId: SESSION_ID,
    sessionExerciseId: "ex-completed-4",
    restEndsAt: now + 90000,
  }));

  let finishAttempts = 0;
  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async (params: { sessionId: string; durationSeconds: number; cooldownCompleted: boolean }) => {
      finishAttempts++;
      return {
        ok: true,
        data: {
          status: "completed" as const,
          durationSeconds: params.durationSeconds,
        },
      };
    },
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => ({ ok: true as const, data: {
      metric: "reps" as const,
      repsMin: 8,
      repsMax: 12,
      equipmentIds: [],
      weightPrefill: null,
      workingWeightKg: null,
      currentTargetReps: null,
      isBodyweight: false,
    }}),
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  };

  render(
    <SessionRunner
      sessionId={SESSION_ID}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(now).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[makeExercise("ex-completed-4", "OHP", "completed")]}
      settings={settings}
      actions={actions}
    />
  );

  await act(async () => {
    await waitFor(() => {
      const btn = screen.queryByText(/Skip/i);
      if (!btn) throw new Error("Waiting for Skip button");
    }, { timeout: 2000 });
  });

  const skipButton = screen.getByText(/Skip/i);

  assertEqualsCd1(!!skipButton, true, "Skip cool-down button present");
  assertEqualsCd1(fakeStorage.data.has(restKey), true, "rest persistence exists before finish");

  await act(async () => {
    skipButton.click();
    await waitFor(() => finishAttempts > 0, { timeout: 1000 });
    await waitFor(() => !fakeStorage.data.has(restKey), { timeout: 1000 });
  });

  assertEqualsCd1(finishAttempts, 1, "finishSession was called");
  assertEqualsCd1(fakeStorage.data.has(restKey), false, "rest persistence cleared after successful finish");
  
  cleanup();
}

console.log(`\n✅ Passed: ${passedCd1}`);
if (failedCd1 > 0) {
  console.log(`❌ Failed: ${failedCd1}`);
  process.exit(1);
}
console.log("\n✨ All cd1 rest clearance tests passed!");
})();
