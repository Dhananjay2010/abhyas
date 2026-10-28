#!/usr/bin/env tsx
/**
 * Test: M4 - Cool-down rest persistence (runtime tests with real SessionRunner)
 * 
 * Covers all 4 cool-down finish paths:
 * 1. Done with pending: replay succeeds, finish succeeds → rest cleared
 * 2. Done with pending (P1): replay succeeds, finish fails → rest NOT cleared
 * 3. Skip with pending: replay succeeds, finish succeeds → rest cleared
 * 4. Skip with pending (P3): replay succeeds, finish fails → rest NOT cleared
 * 
 * Moving restPersistence.clear() before result.ok check must fail paths 2 & 4.
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

console.log("\n📋 Test: M4 - Cool-down rest persistence (4 paths)\n");

(async () => {
  // ===== Path 1: Done + pending + replay OK + finish OK → rest cleared =====
  console.log("=== Path 1: Done + pending + replay OK + finish OK → rest cleared ===\n");

  const exercise1 = makeExercise("ex-1", "squat", "Squat", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetFailCount1 = 0;
  let finishCalls1 = 0;
  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      if (logSetFailCount1 < 1) {
        logSetFailCount1++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
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
  };

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

  await waitFor(() => {
    if (!c1.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  // Assert pending notice before clicking
  check("Pending notice visible before Done click", 
    c1.textContent?.includes("waiting to save") || c1.textContent?.includes("pending") || false);

  const restKeyBefore = `abhyas:rest:${sessionId1}`;
  const restBefore = fakeStorage.getItem(restKeyBefore);
  check("Rest persistence exists before Done", restBefore !== null);

  const doneButton1 = [...c1.querySelectorAll("button")].find((b) =>
    /Done/.test(b.textContent ?? ""),
  );

  if (!doneButton1) {
    console.log("  ✗ FAIL Done button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(doneButton1);
  });

  await waitFor(() => {
    if (finishCalls1 === 0) throw new Error("finishSession not called");
  });

  check("finishSession called", finishCalls1 === 1);
  
  const restAfter = fakeStorage.getItem(restKeyBefore);
  check("M4 Path 1: Rest persistence cleared after successful finish", restAfter === null);

  unmount1();
  console.log("✓ Path 1 passed\n");

  // ===== Path 2: Done + pending + replay OK + finish FAIL → rest NOT cleared =====
  console.log("=== Path 2 (P1): Done + pending + replay OK + finish FAIL → rest NOT cleared ===\n");

  const exercise2 = makeExercise("ex-2", "bench", "Bench Press", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetFailCount2 = 0;
  let finishCalls2 = 0;
  const actions2: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      if (logSetFailCount2 < 1) {
        logSetFailCount2++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
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
  };

  const userId2 = "test-user-m4-2";
  const sessionId2 = "session-m4-2";

  fakeStorage.clear();
  
  savePendingSet(fakeStorage, userId2, sessionId2, {
    sessionExerciseId: "ex-2",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m4-2"
  }, fakeDeps);

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

  await waitFor(() => {
    if (!c2.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  check("Pending notice visible before Done click", 
    c2.textContent?.includes("waiting to save") || c2.textContent?.includes("pending") || false);

  const restBefore2 = fakeStorage.getItem(restKey2);
  check("Rest persistence exists before Done", restBefore2 !== null);

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
    if (finishCalls2 === 0) throw new Error("finishSession not called");
  });

  check("finishSession called (failed)", finishCalls2 === 1);
  
  const restAfter2 = fakeStorage.getItem(restKey2);
  check("P1: Rest persistence KEPT after failed finish (Done+pending)", restAfter2 !== null);

  unmount2();
  console.log("✓ Path 2 passed\n");

  // ===== Path 3: Skip + pending + replay OK + finish OK → rest cleared =====
  console.log("=== Path 3: Skip + pending + replay OK + finish OK → rest cleared ===\n");

  const exercise3 = makeExercise("ex-3", "deadlift", "Deadlift", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetFailCount3 = 0;
  let finishCalls3 = 0;
  const actions3: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      if (logSetFailCount3 < 1) {
        logSetFailCount3++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishCalls3++;
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

  const userId3 = "test-user-m4-3";
  const sessionId3 = "session-m4-3";

  fakeStorage.clear();
  
  savePendingSet(fakeStorage, userId3, sessionId3, {
    sessionExerciseId: "ex-3",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m4-3"
  }, fakeDeps);

  const restKey3 = `abhyas:rest:${sessionId3}`;
  fakeStorage.setItem(restKey3, JSON.stringify({
    sessionId: sessionId3,
    sessionExerciseId: "ex-3",
    restEndsAt: Date.now() + 60000
  }));

  const { container: c3, unmount: unmount3 } = render(
    <SessionRunner
      sessionId={sessionId3}
      sessionStatus="in_progress"
      userId={userId3}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c3", name: "Calf stretch", slug: "calf-stretch", type: "stretch", phase: "stretch", target_regions: ["ankle"], target_muscles: ["calves"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise3]}
      settings={settings}
      actions={actions3}
    />,
  );

  await waitFor(() => {
    if (!c3.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  check("Pending notice visible before Skip click", 
    c3.textContent?.includes("waiting to save") || c3.textContent?.includes("pending") || false);

  const restBefore3 = fakeStorage.getItem(restKey3);
  check("Rest persistence exists before Skip", restBefore3 !== null);

  const skipButton3 = [...c3.querySelectorAll("button")].find((b) =>
    /Skip/.test(b.textContent ?? ""),
  );

  if (!skipButton3) {
    console.log("  ✗ FAIL Skip button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(skipButton3);
  });

  await waitFor(() => {
    if (finishCalls3 === 0) throw new Error("finishSession not called");
  });

  check("finishSession called", finishCalls3 === 1);
  
  const restAfter3 = fakeStorage.getItem(restKey3);
  check("M4 Path 3: Rest persistence cleared after successful Skip finish", restAfter3 === null);

  unmount3();
  console.log("✓ Path 3 passed\n");

  // ===== Path 4: Skip + pending + replay OK + finish FAIL → rest NOT cleared =====
  console.log("=== Path 4 (P3): Skip + pending + replay OK + finish FAIL → rest NOT cleared ===\n");

  const exercise4 = makeExercise("ex-4", "press", "Overhead Press", 1, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetFailCount4 = 0;
  let finishCalls4 = 0;
  const actions4: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      if (logSetFailCount4 < 1) {
        logSetFailCount4++;
        return { ok: false, error: "NETWORK_ERROR" };
      }
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: async () => {
      finishCalls4++;
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
  };

  const userId4 = "test-user-m4-4";
  const sessionId4 = "session-m4-4";

  fakeStorage.clear();
  
  savePendingSet(fakeStorage, userId4, sessionId4, {
    sessionExerciseId: "ex-4",
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
    clientId: "pending-m4-4"
  }, fakeDeps);

  const restKey4 = `abhyas:rest:${sessionId4}`;
  fakeStorage.setItem(restKey4, JSON.stringify({
    sessionId: sessionId4,
    sessionExerciseId: "ex-4",
    restEndsAt: Date.now() + 50000
  }));

  const { container: c4, unmount: unmount4 } = render(
    <SessionRunner
      sessionId={sessionId4}
      sessionStatus="in_progress"
      userId={userId4}
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date(FIXED_TIME).toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[{ id: "c4", name: "Hip stretch", slug: "hip-stretch", type: "stretch", phase: "stretch", target_regions: ["hip"], target_muscles: ["hip_flexors"], instructions: [""], duration_seconds: 30, equipment_ids: [], contraindicated_regions: [] }]}
      exercises={[exercise4]}
      settings={settings}
      actions={actions4}
    />,
  );

  await waitFor(() => {
    if (!c4.textContent?.includes("Cool-down")) throw new Error("Cool-down not shown");
  });

  check("Pending notice visible before Skip click", 
    c4.textContent?.includes("waiting to save") || c4.textContent?.includes("pending") || false);

  const restBefore4 = fakeStorage.getItem(restKey4);
  check("Rest persistence exists before Skip", restBefore4 !== null);

  const skipButton4 = [...c4.querySelectorAll("button")].find((b) =>
    /Skip/.test(b.textContent ?? ""),
  );

  if (!skipButton4) {
    console.log("  ✗ FAIL Skip button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(skipButton4);
  });

  await waitFor(() => {
    if (finishCalls4 === 0) throw new Error("finishSession not called");
  });

  check("finishSession called (failed)", finishCalls4 === 1);
  
  const restAfter4 = fakeStorage.getItem(restKey4);
  check("P3: Rest persistence KEPT after failed Skip finish (Skip+pending)", restAfter4 !== null);

  unmount4();
  console.log("✓ Path 4 passed\n");

  console.log("\n✅ All M4 tests passed (4 paths)\n");
  console.log("Paths 2 (P1) & 4 (P3) verify restPersistence.clear() is inside 'if (result && result.ok)' block.");
  console.log("Moving it before the check would cause Paths 2 & 4 to fail.\n");
  process.exit(0);
})();
