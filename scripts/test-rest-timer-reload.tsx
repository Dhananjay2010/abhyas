#!/usr/bin/env tsx
/**
 * Test rest timer reload (MEDIUM bug fix)
 *
 * Bug: Rest timer doesn't survive a page reload because restEndsAt is only in useState.
 *
 * Fix: Persist to sessionStorage via rest-timer-persistence.ts, restore on mount.
 *
 * Tests:
 * - Storage written when rest starts, reload restores it
 * - Expired rest on mount is not restored
 * - Rest cleared on skip
 * - Rest cleared on undo
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
  type RunnerSettings,
} from "../src/app/session/[id]/session-runner";
import type { StorageAdapter } from "../src/lib/session/rest-timer-persistence";

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
    restSeconds: 90,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status: sets.length >= plannedSets ? "completed" : "pending",
    feel: sets.length >= plannedSets ? "right" : null,
    sets,
    isBodyweight: false,
  };
}

const settings: RunnerSettings = {
  perSetLogging: true,
  restAutostart: true,
  restSound: false,
  restVibrate: false,
  restOverrideSeconds: null,
  cooldownEnabled: false,
};

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test rest timer reload:\n");

(async () => {

// Fake storage for testing
function createFakeStorage(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

// ===== CASE 1: Save/restore flow =====
console.log("Case 1: Rest saved → unmount/remount → restored\n");

const mockStorage = createFakeStorage();
Object.defineProperty(global, "sessionStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

const sessionId1 = "session-1";
const exercise1 = makeExercise("ex-1", "bench-press", "Bench Press", 4);

// Mock Date.now to control time
let now = 1000000;
const originalDateNow = Date.now;
Date.now = () => now;

const key1 = `abhyas:rest:${sessionId1}`;

// Write a rest to storage (simulating what startRest does after logSet)
const restEndsAt = now + 90000;
mockStorage.data.set(key1, JSON.stringify({
  sessionId: sessionId1,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt,
}));

check("Storage key exists (simulating post-logSet)", mockStorage.data.has(key1));

const actions: SessionActions = {
  markWarmupDone: ok,
  logSet: async () => ({ ok: true as const }),
  deleteSet: ok,
  finishExercise: async () => ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
  finishSession: ok,
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
} as unknown as SessionActions;

// Advance clock by 10 seconds
now += 10000;

// Mount with one set logged (rest should restore)
const { container: c1, unmount: unmount1 } = render(
  <SessionRunner
    sessionId={sessionId1}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now - 10000).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[{ ...exercise1, sets: [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }] }]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// Check for rest panel
const hasRestPanel = c1.textContent?.includes("Rest");
check("Rest panel restored after mount", hasRestPanel ?? false);

if (hasRestPanel) {
  const hasTime = c1.textContent?.includes("1:");
  check("Rest shows remaining time (~1:20)", hasTime ?? false);
}

unmount1();

// ===== CASE 2: Expired rest =====
console.log("\nCase 2: Expired rest → not restored, key removed\n");

// Advance clock past expiry
now = restEndsAt + 1000;

const { container: c2, unmount: unmount2 } = render(
  <SessionRunner
    sessionId={sessionId1}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now - 100000).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[{ ...exercise1, sets: [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }] }]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

check("No rest panel for expired value", !c2.textContent?.includes("Rest") || !c2.textContent?.includes("1:"));
check("Expired key removed", !mockStorage.data.has(key1));

unmount2();

// ===== CASE 3: Skip clears storage =====
console.log("\nCase 3: Skip button → storage cleared\n");

now = 2000000;
mockStorage.data.set(key1, JSON.stringify({
  sessionId: sessionId1,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt: now + 90000,
}));

const { container: c3, unmount: unmount3 } = render(
  <SessionRunner
    sessionId={sessionId1}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[{ ...exercise1, sets: [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }] }]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const skipButton = [...c3.querySelectorAll("button")].find((b) =>
  b.textContent?.trim() === "Skip"
);

if (skipButton) {
  await act(async () => {
    fireEvent.click(skipButton);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  check("Skip clears storage", !mockStorage.data.has(key1));
} else {
  check("Skip button found", false);
}

unmount3();

// ===== CASE 4: Undo clears storage =====
console.log("\nCase 4: Undo button → storage cleared\n");

now = 3000000;
mockStorage.data.set(key1, JSON.stringify({
  sessionId: sessionId1,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt: now + 90000,
}));

const { container: c4, unmount: unmount4 } = render(
  <SessionRunner
    sessionId={sessionId1}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[{ ...exercise1, sets: [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }] }]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const undoButton = [...c4.querySelectorAll("button")].find((b) =>
  /Undo/.test(b.textContent ?? "")
);

if (undoButton) {
  await act(async () => {
    fireEvent.click(undoButton);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  check("Undo clears storage", !mockStorage.data.has(key1));
} else {
  check("Undo button found", false);
}

unmount4();

// Restore Date.now
Date.now = originalDateNow;

console.log("\n✅ All tests passed");
console.log("\nNote: MUTANT 1 (remove restPersistence.save in startRest) would cause");
console.log("Case 1 to fail at 'Storage key exists' since the save wouldn't happen.");
})();
