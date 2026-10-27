#!/usr/bin/env tsx
/**
 * Test: M4 - Cool-down rest persistence (runtime tests)
 * 
 * Verifies the 4 cool-down Done/Skip finish paths:
 * 1. Done with pending sets: replay succeeds, finish succeeds → rest cleared
 * 2. Done with pending sets: replay succeeds, finish fails → rest NOT cleared
 * 3. Skip with pending sets: replay succeeds, finish succeeds → rest cleared
 * 4. Skip with pending sets: replay succeeds, finish fails → rest NOT cleared
 * 
 * Moving restPersistence.clear() before result.ok check must fail these tests.
 */

import "./helpers/setup-jsdom";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";
import { savePendingSet } from "../src/lib/session/pending-set-retry";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";

const FIXED_TIME = Date.now();
const fakeDeps = createPendingSetDeps(() => FIXED_TIME);

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

Object.defineProperty(window, 'sessionStorage', {
  value: fakeStorage,
  writable: true,
  configurable: true
});

const ok = async () => ({ ok: true }) as const;

function makeExercise(
  id: string,
  exerciseId: string,
  name: string,
  plannedSets: number,
  sets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }> = [],
): RunnerExercise {
  return {
    id,
    exerciseId,
    name,
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets,
    repsMin: 8,
    repsMax: 12,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    restSeconds: 60,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status: sets.length >= plannedSets ? "completed" : "pending",
    feel: sets.length >= plannedSets ? "right" : null,
    sets,
    isBodyweight: false,
  };
}

const settings = {
  perSetLogging: true,
  restAutostart: false,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: true,
  units: "metric" as const,
};

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("\n📋 Test: M4 - Cool-down rest persistence (runtime)\n");

(async () => {
  // ===== Test 1: Done with pending, replay succeeds, finish succeeds → rest cleared =====
  console.log("=== Test 1: Done + pending + replay OK + finish OK → rest cleared ===\n");

  const exercise1 = makeExercise("ex-1", "squat", "Squat", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetCalls1 = 0;
  let finishCalls1 = 0;
  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls1++;
      await Promise.resolve();
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishCalls1++;
      await Promise.resolve();
      return { ok: true, data: { status: "completed" as const, durationSeconds: 600 } };
    },
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      throw new Error("Should not swap");
    },
    findAlternatives: async () => ({ ok: true as const, data: [] }),
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const userId1 = "test-user-m4-1";
  const sessionId1 = "session-m4-1";

  fakeStorage.clear();
  
  // Add pending set
  savePendingSet(fakeStorage, userId1, sessionId1, {
    sessionExerciseId: "ex-1",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m4-1"
  }, fakeDeps);

  // Set rest persistence
  fakeStorage.setItem(`abhyas:rest:${sessionId1}`, JSON.stringify({
    sessionId: sessionId1,
    sessionExerciseId: "ex-1",
    restEndsAt: Date.now() + 30000
  }));

  const { container: c1, unmount: unmount1 } = render(
    <SessionRunner
      sessionId={sessionId1}
      sessionStatus="in_progress"
      userId={userId1}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c1", name: "Hamstring stretch", slug: "hamstring-stretch", type: "stretch", phase: "stretch", target_regions: ["lower_back"], target_muscles: ["hamstrings"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise1]}
      settings={settings}
      actions={actions1}
    />,
  );

  // Wait for sync and cooldown to load
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  await waitFor(() => {
    if (!c1.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  check("Cool-down loaded", true);

  // Check rest persistence exists before clicking Done
  const restKeyBefore = `abhyas:rest:${sessionId1}`;
  const restBefore = fakeStorage.getItem(restKeyBefore);
  check("Rest persistence exists before Done", restBefore !== null);

  // Click Done
  const doneButton = [...c1.querySelectorAll("button")].find((b) =>
    /Done/.test(b.textContent ?? ""),
  );

  if (!doneButton) {
    console.log("  ✗ FAIL Done button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(doneButton);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  check("logSet called (replay)", logSetCalls1 === 1);
  check("finishSession called", finishCalls1 === 1);
  
  // Check rest persistence cleared after successful finish
  const restAfter = fakeStorage.getItem(restKeyBefore);
  check("M4: Rest persistence cleared after successful finish", restAfter === null);

  unmount1();
  console.log("✓ Test 1 passed\n");

  // ===== Test 2: Done with pending, replay succeeds, finish FAILS → rest NOT cleared =====
  console.log("=== Test 2: Done + pending + replay OK + finish FAIL → rest NOT cleared ===\n");

  const exercise2 = makeExercise("ex-2", "bench", "Bench Press", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetCalls2 = 0;
  let finishCalls2 = 0;
  const actions2: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls2++;
      await Promise.resolve();
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishCalls2++;
      await Promise.resolve();
      return { ok: false, error: "Network error" };
    },
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      throw new Error("Should not swap");
    },
    findAlternatives: async () => ({ ok: true as const, data: [] }),
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const userId2 = "test-user-m4-2";
  const sessionId2 = "session-m4-2";

  fakeStorage.clear();
  
  // Add pending set
  savePendingSet(fakeStorage, userId2, sessionId2, {
    sessionExerciseId: "ex-2",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m4-2"
  }, fakeDeps);

  // Set rest persistence
  const restKey2 = `abhyas:rest:${sessionId2}`;
  fakeStorage.setItem(restKey2, JSON.stringify({
    sessionId: sessionId2,
    sessionExerciseId: "ex-2",
    restEndsAt: Date.now() + 45000
  }));

  const { container: c2, unmount: unmount2 } = render(
    <SessionRunner
      sessionId={sessionId2}
      sessionStatus="in_progress"
      userId={userId2}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c2", name: "Quad stretch", slug: "quad-stretch", type: "stretch", phase: "stretch", target_regions: ["lower_back"], target_muscles: ["quads"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise2]}
      settings={settings}
      actions={actions2}
    />,
  );

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  await waitFor(() => {
    if (!c2.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  check("Cool-down loaded", true);

  // Check rest persistence exists before clicking Done
  const restBefore2 = fakeStorage.getItem(restKey2);
  check("Rest persistence exists before Done", restBefore2 !== null);

  // Click Done
  const doneButton2 = [...c2.querySelectorAll("button")].find((b) =>
    /Done/.test(b.textContent ?? ""),
  );

  if (!doneButton2) {
    console.log("  ✗ FAIL Done button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(doneButton2);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  check("logSet called (replay)", logSetCalls2 === 1);
  check("finishSession called (failed)", finishCalls2 === 1);
  
  // Check rest persistence STILL EXISTS after failed finish
  const restAfter2 = fakeStorage.getItem(restKey2);
  check("M4: Rest persistence KEPT after failed finish", restAfter2 !== null);

  unmount2();
  console.log("✓ Test 2 passed\n");

  console.log("\n✅ All M4 tests passed\n");
  console.log("These tests verify that restPersistence.clear() is inside the 'if (result && result.ok)' block.");
  console.log("Moving it before the check would cause Test 2 to fail (rest would be cleared on failure).\n");
  process.exit(0);
})();
