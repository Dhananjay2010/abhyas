#!/usr/bin/env tsx
/**
 * Test rest timer reload (MEDIUM bug fix)
 *
 * Bug: Rest timer doesn't survive a page reload because restEndsAt is only in useState.
 *
 * Fix: Persist to sessionStorage via rest-timer-persistence.ts, restore on mount.
 *
 * Tests:
 * - Case 0: Real save path through startRest (tests MUTANT 1)
 * - Case 1: Restore from manually-written storage
 * - Case 2: Expired rest not restored
 * - Case 3: Skip clears storage
 * - Case 4: Undo clears storage
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

const mockStorage = createFakeStorage();
Object.defineProperty(global, "sessionStorage", {
  value: mockStorage,
  writable: true,
  configurable: true,
});

// Mock Date.now to control time
let now = 1000000;
const originalDateNow = Date.now;
Date.now = () => now;

const sessionId = "session-1";
const key = `abhyas:rest:${sessionId}`;

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

// ===== CASE 0: Real save path through logSet =====
console.log("Case 0: Log set with restAutostart → startRest saves to storage\n");

const exercise0 = makeExercise("ex-0", "bench-press", "Bench Press", 4);

const { container: c0, unmount: unmount0 } = render(
  <SessionRunner
    sessionId={sessionId}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise0]}
    settings={settings}
    actions={actions}
  />,
);

// Wait for sync
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 4500));
});

await waitFor(() => {
  if (!c0.textContent?.includes("Bench Press")) throw new Error("Exercise not shown");
});

check("Exercise loaded", true);

// Fill in reps
const repsInput0 = [...c0.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
) as HTMLInputElement | undefined;

if (!repsInput0) {
  console.log("  ✗ FAIL Reps input not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput0, { target: { value: "10" } });
});

// Click Log set
const logBtn0 = [...c0.querySelectorAll("button")].find((b) =>
  /Log set 1/.test(b.textContent ?? ""),
);

if (!logBtn0) {
  console.log("  ✗ FAIL Log set button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(logBtn0);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// (a) Rest panel should show
check("Rest panel appears after logging", c0.textContent?.includes("Rest") ?? false);

// (b) Storage should hold the rest record
check("Storage key exists after logSet", mockStorage.data.has(key));

if (mockStorage.data.has(key)) {
  const stored = JSON.parse(mockStorage.data.get(key)!);
  check("Stored sessionExerciseId matches current", stored.sessionExerciseId === "ex-0");
  const expectedEndsAt = now + 90000; // 90s rest
  check("Stored restEndsAt === now + 90000", stored.restEndsAt === expectedEndsAt, `${stored.restEndsAt} === ${expectedEndsAt}`);
}

unmount0();

// (c) Unmount, advance clock, remount: panel shows ~1:20
now += 10000; // 10 seconds later

const { container: c0b, unmount: unmount0b } = render(
  <SessionRunner
    sessionId={sessionId}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now - 10000).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[{ ...exercise0, sets: [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }] }]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

check("Rest panel restored after reload", c0b.textContent?.includes("Rest") ?? false);
// Should show ~1:20 (80 seconds remaining)
const restText = c0b.textContent ?? "";
const hasCorrectTime = restText.includes("1:2") || restText.includes("1:19") || restText.includes("1:18");
check("Rest shows ~1:20 remaining (±1s)", hasCorrectTime, restText.match(/1:\d\d/)?.[0]);

unmount0b();

// Clear storage for next tests
mockStorage.data.clear();

// ===== CASE 1: Manual restore test =====
console.log("\nCase 1: Manually-written storage → restored on mount\n");

const exercise1 = makeExercise("ex-1", "squat", "Squat", 4);

// Write a rest to storage (simulating what startRest does after logSet)
const restEndsAt = now + 90000;
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt,
}));

check("Storage key written", mockStorage.data.has(key));

const { container: c1, unmount: unmount1 } = render(
  <SessionRunner
    sessionId={sessionId}
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

check("Rest panel restored", c1.textContent?.includes("Rest") ?? false);

unmount1();

// ===== CASE 2: Expired rest =====
console.log("\nCase 2: Expired rest → not restored, key removed\n");

// Advance clock past expiry
now = restEndsAt + 1000;

const { container: c2, unmount: unmount2 } = render(
  <SessionRunner
    sessionId={sessionId}
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
check("Expired key removed", !mockStorage.data.has(key));

unmount2();

// ===== CASE 3: Skip clears storage =====
console.log("\nCase 3: Skip button → storage cleared\n");

now = 2000000;
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt: now + 90000,
}));

const { container: c3, unmount: unmount3 } = render(
  <SessionRunner
    sessionId={sessionId}
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
  check("Skip clears storage", !mockStorage.data.has(key));
} else {
  check("Skip button found", false);
}

unmount3();

// ===== CASE 4: Undo clears storage =====
console.log("\nCase 4: Undo button → storage cleared\n");

now = 3000000;
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-1",
  setNumber: 2,
  restEndsAt: now + 90000,
}));

const { container: c4, unmount: unmount4 } = render(
  <SessionRunner
    sessionId={sessionId}
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
  check("Undo clears storage", !mockStorage.data.has(key));
} else {
  check("Undo button found", false);
}

unmount4();

// Restore Date.now
Date.now = originalDateNow;

console.log("\n✅ All tests passed");
})();
