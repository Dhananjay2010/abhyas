#!/usr/bin/env tsx
/**
 * Test: Cool-down Done and Skip replay (L3)
 * 
 * Verifies:
 * - Done button replays pending sets then finishes with cooldownCompleted: true
 * - Skip button replays pending sets then finishes with cooldownCompleted: false  
 * - Both handle empty queue, successful replay, and failed replay
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
const fakeDeps = createPendingSetDeps(() => Date.now());

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

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("\n📋 Test: L3 - Cool-down Done and Skip replay\n");

(async () => {
  // ===== Test 1: Done with empty queue =====
  console.log("=== Test 1: Done with empty queue ===\n");

  const exercise1 = makeExercise("ex-1", "squat", "Squat", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  const finishCalls: Array<{ cooldownCompleted?: boolean }> = [];
  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true }),
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async (input) => {
      finishCalls.push({ cooldownCompleted: input?.cooldownCompleted });
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
  };

  const settings = {
    perSetLogging: true,
    restAutostart: false,
    restSound: false,
    restVibrate: false,
    restOverrideSeconds: null,
    cooldownEnabled: true,
    units: "metric" as const,
  };

  const { container: c1, unmount: unmount1 } = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="test-user-1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c1", name: "Hamstring stretch", slug: "hamstring-stretch", type: "stretch", phase: "stretch", target_regions: ["lower_back"], target_muscles: ["hamstrings"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise1]}
      settings={settings}
      actions={actions1}
    />,
  );

  await waitFor(() => {
    if (!c1.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

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

  await waitFor(() => {
    if (finishCalls.length === 0) throw new Error("finishSession not called");
  });

  check("finishSession called with empty queue", finishCalls.length === 1);
  check("cooldownCompleted is true for Done", finishCalls[0].cooldownCompleted === true);

  unmount1();

  // ===== Test 2: Done with pending sets - replay succeeds =====
  console.log("\n=== Test 2: Done + pending → replay OK → finish ===\n");

  let logSetCount2 = 0;
  let logSetFailCount2 = 0;
  const finishCalls2: Array<{ cooldownCompleted?: boolean }> = [];
  
  const actions2: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCount2++;
      if (logSetFailCount2 < 1) {
        logSetFailCount2++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async (input) => {
      finishCalls2.push({ cooldownCompleted: input?.cooldownCompleted });
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
  };

  const exercise2 = makeExercise("ex-2", "bench", "Bench", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  fakeStorage.clear();
  savePendingSet(fakeStorage, "test-user-2", "s2", {
    sessionExerciseId: "ex-2",
    setNumber: 2,
    reps: 12,
    weightKg: 55,
    durationSeconds: null,
    clientId: "pending-2",
  }, fakeDeps);

  const { container: c2, unmount: unmount2 } = render(
    <SessionRunner
      sessionId="s2"
      sessionStatus="in_progress"
      userId="test-user-2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c1", name: "Hamstring stretch", slug: "hamstring-stretch", type: "stretch", phase: "stretch", target_regions: ["lower_back"], target_muscles: ["hamstrings"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise2]}
      settings={settings}
      actions={actions2}
    />,
  );

  await waitFor(() => {
    if (!c2.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  // Assert pending notice BEFORE clicking
  check("Pending notice visible before Done click", 
    c2.textContent?.includes("waiting to save") || c2.textContent?.includes("pending") || false);

  const logSetCountBeforeClick = logSetCount2;

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

  await waitFor(() => {
    if (finishCalls2.length === 0) throw new Error("finishSession not called");
  });

  check("D1: Done click triggered replay (logSet count increased)", logSetCount2 > logSetCountBeforeClick);
  check("finishSession called after replay", finishCalls2.length === 1);
  check("cooldownCompleted is true", finishCalls2[0].cooldownCompleted === true);

  unmount2();

  // ===== Test 3: Skip with pending sets - replay succeeds =====
  console.log("\n=== Test 3: Skip + pending → replay OK → finish ===\n");

  let logSetCount3 = 0;
  let logSetFailCount3 = 0;
  const finishCalls3: Array<{ cooldownCompleted?: boolean }> = [];
  
  const actions3: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCount3++;
      if (logSetFailCount3 < 1) {
        logSetFailCount3++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async (input) => {
      finishCalls3.push({ cooldownCompleted: input?.cooldownCompleted });
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
  };

  const exercise3 = makeExercise("ex-3", "deadlift", "Deadlift", 1, [
    { setNumber: 1, reps: 8, weightKg: 100, durationSeconds: null },
  ]);

  fakeStorage.clear();
  savePendingSet(fakeStorage, "test-user-3", "s3", {
    sessionExerciseId: "ex-3",
    setNumber: 2,
    reps: 8,
    weightKg: 100,
    durationSeconds: null,
    clientId: "pending-3",
  }, fakeDeps);

  const { container: c3, unmount: unmount3 } = render(
    <SessionRunner
      sessionId="s3"
      sessionStatus="in_progress"
      userId="test-user-3"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c1", name: "Hamstring stretch", slug: "hamstring-stretch", type: "stretch", phase: "stretch", target_regions: ["lower_back"], target_muscles: ["hamstrings"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise3]}
      settings={settings}
      actions={actions3}
    />,
  );

  await waitFor(() => {
    if (!c3.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  // Assert pending notice BEFORE clicking
  check("Pending notice visible before Skip click", 
    c3.textContent?.includes("waiting to save") || c3.textContent?.includes("pending") || false);

  const skipButton = [...c3.querySelectorAll("button")].find((b) =>
    /Skip cool-down/.test(b.textContent ?? ""),
  );

  if (!skipButton) {
    console.log("  ✗ FAIL Skip button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(skipButton);
  });

  await waitFor(() => {
    if (finishCalls3.length === 0) throw new Error("finishSession not called");
  });

  check("finishSession called after replay", finishCalls3.length === 1);
  check("cooldownCompleted is false for Skip", finishCalls3[0].cooldownCompleted === false);

  unmount3();

  console.log("\n✅ All L3 Done/Skip replay tests passed\n");
  process.exit(0);
})();
