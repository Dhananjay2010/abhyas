#!/usr/bin/env tsx
/**
 * Test rest timer reload - comprehensive with actual logSet flow
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
  type RunnerSettings,
} from "../src/app/session/[id]/session-runner";

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

console.log("Test rest timer persistence - comprehensive:\n");

(async () => {

// Mock sessionStorage
const data = new Map<string, string>();
Object.defineProperty(global, "sessionStorage", {
  value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  },
  writable: true,
  configurable: true,
});

// Mock Date.now
let now = 1000000;
const originalDateNow = Date.now;
Date.now = () => now;

const sessionId = "session-1";
const key = `abhyas:rest:${sessionId}`;

// ===== Test actual logSet flow =====
console.log("Test 1: Log set with restAutostart → storage is written\n");

const exercise1 = makeExercise("ex-1", "bench-press", "Bench Press", 4);

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

const { container: c1, unmount: unmount1 } = render(
  <SessionRunner
    sessionId={sessionId}
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise1]}
    settings={settings}
    actions={actions}
  />,
);

// Wait for sync
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 4500));
});

await waitFor(() => {
  if (!c1.textContent?.includes("Bench Press")) throw new Error("Exercise not shown");
});

// Fill in reps
const repsInput = c1.querySelector('input[type="number"]') as HTMLInputElement;
if (!repsInput) {
  console.log("  ✗ FAIL Reps input not found");
  process.exit(1);
}

await act(async () => {
  repsInput.value = "10";
  repsInput.dispatchEvent(new Event("input", { bubbles: true }));
  repsInput.dispatchEvent(new Event("change", { bubbles: true }));
});

// Click Log set
const logButton = [...c1.querySelectorAll("button")].find((b) =>
  /Log set 1/.test(b.textContent ?? ""),
);

if (!logButton) {
  console.log("  ✗ FAIL Log set button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(logButton);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Check rest panel appeared
const hasRest1 = c1.textContent?.includes("Rest");
check("Rest panel appears after logging", hasRest1 ?? false);

// Check storage was written (THIS IS THE KEY TEST FOR MUTANT 1)
check("Storage key exists after logSet", data.has(key));

if (data.has(key)) {
  const stored = JSON.parse(data.get(key)!);
  check("Stored restEndsAt is in future", typeof stored.restEndsAt === "number" && stored.restEndsAt > now);
}

unmount1();

// ===== Test restoration (MUTANT 2) =====
console.log("\nTest 2: Unmount/remount → rest restored from storage\n");

now += 10000; // 10 seconds later

const { container: c2, unmount: unmount2 } = render(
  <SessionRunner
    sessionId={sessionId}
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

check("Rest panel restored after reload", c2.textContent?.includes("Rest") ?? false);

unmount2();

// ===== Test expiry (MUTANT 3) =====
console.log("\nTest 3: Expired rest → not restored, key removed\n");

const restEndsAt = JSON.parse(data.get(key)!).restEndsAt;
now = restEndsAt + 1000; // Past expiry

const { container: c3, unmount: unmount3 } = render(
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

check("No rest panel for expired value", !c3.textContent?.includes("Rest") || !c3.textContent?.includes("1:"));
check("Expired key removed", !data.has(key));

unmount3();

// ===== Test Skip clears storage (MUTANT 4) =====
console.log("\nTest 4: Skip button → storage cleared\n");

now = 2000000;
data.set(key, JSON.stringify({
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

const skipButton = [...c4.querySelectorAll("button")].find((b) =>
  b.textContent?.trim() === "Skip"
);

if (skipButton) {
  await act(async () => {
    fireEvent.click(skipButton);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  check("Skip clears storage", !data.has(key));
} else {
  check("Skip button found", false);
}

unmount4();

// Restore Date.now
Date.now = originalDateNow;

console.log("\n✅ All tests passed");
})();
