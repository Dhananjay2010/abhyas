#!/usr/bin/env tsx
/**
 * Test rest timer reload - comprehensive with all mutants
 *
 * Bug: Rest timer doesn't survive a page reload because restEndsAt is only in useState.
 *
 * Fix: Persist to sessionStorage via rest-timer-persistence.ts, restore on mount.
 *
 * Tests all paths and mutants:
 * - Case 0: Real save path through startRest
 * - Case 1: Different exercise ID - no restore, key cleared
 * - Case 2: Finish exercise clears storage
 * - Case 3: End early clears storage
 * - Case 4: Finish session clears storage
 * - Case 5: Skip clears storage
 * - Case 6: Undo clears storage
 * - Case 7: Expired rest not restored
 * - Case 8: Hydration safety (storage seeded before first render)
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
import type { WarmupItem } from "../src/lib/program/warmup";

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

console.log("Test rest timer reload - comprehensive:\n");

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

// Also set window.sessionStorage for the hook
if (typeof window !== "undefined") {
  Object.defineProperty(window, "sessionStorage", {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
}

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
} as unknown as SessionActions;

// ===== CASE 0: Real save path through logSet =====
console.log("Case 0: Log set with restAutostart → startRest saves, reload restores with seeded remaining\n");

const exercise0 = makeExercise("ex-0", "bench-press", "Bench Press", 4);

const { container: c0, unmount: unmount0 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
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

// Fill in reps using type guard
const repsInput0 = [...c0.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput0 instanceof HTMLInputElement)) {
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

check("Rest panel appears after logging", c0.textContent?.includes("Rest") ?? false);
check("Storage key exists after logSet", mockStorage.data.has(key));

if (mockStorage.data.has(key)) {
  const stored = JSON.parse(mockStorage.data.get(key)!);
  check("Stored sessionExerciseId matches current", stored.sessionExerciseId === "ex-0");
  const expectedEndsAt = now + 90000;
  check("Stored restEndsAt === now + 90000", stored.restEndsAt === expectedEndsAt);
}

unmount0();

// Unmount, advance clock, remount: panel shows ~1:20 with seeded remaining
now += 10000;

const { container: c0b, unmount: unmount0b } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
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
const restText0 = c0b.textContent ?? "";
const hasCorrectTime0 = restText0.includes("1:2") || restText0.includes("1:19") || restText0.includes("1:18");
check("Rest shows ~1:20 remaining (±1s), seeded", hasCorrectTime0, restText0.match(/1:\d\d/)?.[0]);

unmount0b();

// Clear storage for next tests
mockStorage.data.clear();

// ===== CASE 1: Different exercise ID =====
console.log("\nCase 1: Stored rest for different exercise → no panel, key cleared\n");

const exercise1a = makeExercise("ex-1a", "squat", "Squat", 4, [{ setNumber: 1, reps: 10, weightKg: null, durationSeconds: null }]);
const exercise1b = makeExercise("ex-1b", "deadlift", "Deadlift", 4);

// Write rest for ex-1b but mount with ex-1a
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-1b",
  restEndsAt: now + 90000,
}));

const { container: c1, unmount: unmount1 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise1a, exercise1b]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

check("No rest panel for different exercise", !c1.textContent?.includes("Rest") || !c1.textContent?.includes("1:"));
check("Wrong exercise key cleared", !mockStorage.data.has(key));

unmount1();

// ===== CASE 2: Finish exercise clears storage =====
console.log("\nCase 2: Finish exercise → storage cleared\n");

const exercise2a = makeExercise("ex-2a", "press", "Press", 2);
const exercise2b = makeExercise("ex-2b", "curl", "Curl", 1);

const { container: c2, unmount: unmount2 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise2a, exercise2b]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 4500));
});

await waitFor(() => {
  if (!c2.textContent?.includes("Press")) throw new Error("Exercise not shown");
});

// Log set 1 to start rest
const repsInput2 = [...c2.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput2 instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput2, { target: { value: "10" } });
});

const logBtn2 = [...c2.querySelectorAll("button")].find((b) =>
  /Log set 1/.test(b.textContent ?? ""),
);

if (!logBtn2) {
  console.log("  ✗ FAIL Log set button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(logBtn2);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Wait for rest panel to appear
await waitFor(() => {
  if (!c2.textContent?.includes("Rest")) throw new Error("Rest panel not shown");
}, { timeout: 2000 });

check("Rest starts after logging set 1", c2.textContent?.includes("Rest") ?? false);
check("Storage has key after logging", mockStorage.data.has(key));

// Log set 2 to complete the exercise
const logBtn2b = [...c2.querySelectorAll("button")].find((b) =>
  /Log set 2/.test(b.textContent ?? ""),
);

if (!logBtn2b) {
  console.log("  ✗ FAIL Log set 2 button not found");
  process.exit(1);
}

const repsInput2b = [...c2.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput2b instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found for set 2");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput2b, { target: { value: "10" } });
});

await act(async () => {
  fireEvent.click(logBtn2b);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Now finish the exercise through the UI (all sets done, click feel)
await waitFor(() => {
  if (!c2.textContent?.includes("How did that feel?")) throw new Error("Feel prompt not shown");
});

const rightBtn = [...c2.querySelectorAll("button")].find((b) =>
  b.textContent?.trim() === "Just right",
);

if (!rightBtn) {
  console.log("  ✗ FAIL 'Just right' button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(rightBtn);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// Should move to next exercise and clear storage
await waitFor(() => {
  if (!c2.textContent?.includes("Curl")) throw new Error("Next exercise not shown");
});

check("Moved to next exercise", c2.textContent?.includes("Curl") ?? false);
check("Finish exercise clears storage immediately", !mockStorage.data.has(key));

unmount2();

// ===== CASE 3: End early clears storage =====
console.log("\nCase 3: End early → storage cleared\n");

const exercise3 = makeExercise("ex-3", "curl", "Curl", 3);

mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-3",
  restEndsAt: now + 90000,
}));

const { container: c3, unmount: unmount3 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise3]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const endEarlyButton = [...c3.querySelectorAll("button")].find((b) =>
  /End session early/.test(b.textContent ?? "")
);

if (endEarlyButton) {
  await act(async () => {
    fireEvent.click(endEarlyButton);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  check("End early clears storage", !mockStorage.data.has(key));
} else {
  check("End early button found", false);
}

unmount3();

// ===== CASE 4: Finish session (no cooldown, last exercise) clears storage =====
console.log("\nCase 4: Finish last exercise (no cooldown) → storage cleared inside onFinishExercise\n");

const exercise4 = makeExercise("ex-4", "row", "Row", 2);

const { container: c4, unmount: unmount4 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise4]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 4500));
});

await waitFor(() => {
  if (!c4.textContent?.includes("Row")) throw new Error("Exercise not shown");
});

// Log set 1 to start rest
const repsInput4 = [...c4.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput4 instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput4, { target: { value: "10" } });
});

const logBtn4 = [...c4.querySelectorAll("button")].find((b) =>
  /Log set 1/.test(b.textContent ?? ""),
);

if (!logBtn4) {
  console.log("  ✗ FAIL Log set button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(logBtn4);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

await waitFor(() => {
  if (!c4.textContent?.includes("Rest")) throw new Error("Rest panel not shown");
}, { timeout: 2000 });

check("Rest starts after logging set 1", c4.textContent?.includes("Rest") ?? false);
check("Storage has key after logging", mockStorage.data.has(key));

// Log set 2 to complete the exercise
const logBtn4_2 = [...c4.querySelectorAll("button")].find((b) =>
  /Log set 2/.test(b.textContent ?? ""),
);

if (!logBtn4_2) {
  console.log("  ✗ FAIL Log set 2 button not found");
  process.exit(1);
}

const repsInput4_2 = [...c4.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput4_2 instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found for set 2");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput4_2, { target: { value: "10" } });
});

await act(async () => {
  fireEvent.click(logBtn4_2);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Now finish the exercise through the UI - this is the last exercise with no cooldown
await waitFor(() => {
  if (!c4.textContent?.includes("How did that feel?")) throw new Error("Feel prompt not shown");
});

const rightBtn4 = [...c4.querySelectorAll("button")].find((b) =>
  b.textContent?.trim() === "Just right",
);

if (!rightBtn4) {
  console.log("  ✗ FAIL 'Just right' button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(rightBtn4);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// Should go to done phase and clear storage
await waitFor(() => {
  if (!c4.textContent?.includes("Session complete")) throw new Error("Summary not shown");
});

check("Session complete", c4.textContent?.includes("Session complete") ?? false);
check("Finish last exercise clears storage (finishSession in onFinishExercise)", !mockStorage.data.has(key));

unmount4();

// ===== CASE 4b: Cooldown screen finish button clears storage =====
console.log("\nCase 4b: Finish on cooldown screen (not-completed button) → storage cleared\n");

const cooldownItem: WarmupItem = {
  id: "cool-1",
  slug: "hamstring-stretch",
  name: "Hamstring stretch",
  type: "stretch",
  phase: "stretch",
  target_regions: [],
  target_muscles: [],
  duration_seconds: 30,
  instructions: ["Hold for 30s"],
  equipment_ids: [],
  contraindicated_regions: [],
};

const settingsWithCooldown: RunnerSettings = {
  ...settings,
  cooldownEnabled: true,
};

const exercise4b = makeExercise("ex-4b", "deadlift", "Deadlift", 2);

const { container: c4b, unmount: unmount4b } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[cooldownItem]}
    exercises={[exercise4b]}
    settings={settingsWithCooldown}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 4500));
});

await waitFor(() => {
  if (!c4b.textContent?.includes("Deadlift")) throw new Error("Exercise not shown");
});

// Log set to start rest
const repsInput4b = [...c4b.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput4b instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput4b, { target: { value: "10" } });
});

const logBtn4b = [...c4b.querySelectorAll("button")].find((b) =>
  /Log set 1/.test(b.textContent ?? ""),
);

if (!logBtn4b) {
  console.log("  ✗ FAIL Log set button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(logBtn4b);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

await waitFor(() => {
  if (!c4b.textContent?.includes("Rest")) throw new Error("Rest panel not shown");
}, { timeout: 2000 });

check("Rest starts after set 1", c4b.textContent?.includes("Rest") ?? false);

// Log set 2 to complete the exercise
const logBtn4b2 = [...c4b.querySelectorAll("button")].find((b) =>
  /Log set 2/.test(b.textContent ?? ""),
);

if (!logBtn4b2) {
  console.log("  ✗ FAIL Log set 2 button not found");
  process.exit(1);
}

const repsInput4b2 = [...c4b.querySelectorAll("input")].find((input) =>
  input.closest("label")?.textContent?.includes("Reps"),
);

if (!(repsInput4b2 instanceof HTMLInputElement)) {
  console.log("  ✗ FAIL Reps input not found for set 2");
  process.exit(1);
}

await act(async () => {
  fireEvent.change(repsInput4b2, { target: { value: "10" } });
});

await act(async () => {
  fireEvent.click(logBtn4b2);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Finish exercise to get to cooldown
await waitFor(() => {
  if (!c4b.textContent?.includes("How did that feel?")) throw new Error("Feel prompt not shown");
});

const rightBtn4b = [...c4b.querySelectorAll("button")].find((b) =>
  b.textContent?.trim() === "Just right",
);

if (!rightBtn4b) {
  console.log("  ✗ FAIL 'Just right' button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(rightBtn4b);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// Should be on cooldown screen now
await waitFor(() => {
  if (!c4b.textContent?.includes("Cool-down")) throw new Error("Cooldown screen not shown");
});

check("Cooldown screen shown", c4b.textContent?.includes("Cool-down") ?? false);

// Put a valid rest record in storage (simulating leftover data)
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-4b",
  restEndsAt: now + 90000,
}));

check("Storage has key before cooldown finish", mockStorage.data.has(key));

// Click "Skip cool-down" button (cooldownCompleted: false)
const skipCooldownBtn = [...c4b.querySelectorAll("button")].find((b) =>
  /Skip cool-down/.test(b.textContent ?? ""),
);

if (!skipCooldownBtn) {
  console.log("  ✗ FAIL Skip cool-down button not found");
  process.exit(1);
}

await act(async () => {
  fireEvent.click(skipCooldownBtn);
  await new Promise((resolve) => setTimeout(resolve, 200));
});

// Should finish session and clear storage
await waitFor(() => {
  if (!c4b.textContent?.includes("Session complete")) throw new Error("Summary not shown");
});

check("Session complete after cooldown skip", c4b.textContent?.includes("Session complete") ?? false);
check("Cooldown skip button clears storage", !mockStorage.data.has(key));

unmount4b();

// ===== CASE 5: Skip clears storage =====
console.log("\nCase 5: Skip button → storage cleared\n");

const exercise5 = makeExercise("ex-5", "press", "Press", 2, [
  { setNumber: 1, reps: 10, weightKg: null, durationSeconds: null },
]);

mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-5",
  restEndsAt: now + 90000,
}));

const { container: c5, unmount: unmount5 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise5]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const skipButton = [...c5.querySelectorAll("button")].find((b) =>
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

unmount5();

// ===== CASE 6: Undo clears storage =====
console.log("\nCase 6: Undo button → storage cleared\n");

const exercise6 = makeExercise("ex-6", "row", "Row", 2, [
  { setNumber: 1, reps: 10, weightKg: null, durationSeconds: null },
]);

mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-6",
  restEndsAt: now + 90000,
}));

const { container: c6, unmount: unmount6 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise6]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

const undoButton = [...c6.querySelectorAll("button")].find((b) =>
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

unmount6();

// ===== CASE 7: Expired rest =====
console.log("\nCase 7: Expired rest → not restored, key removed\n");

const exercise7 = makeExercise("ex-7", "squat", "Squat", 2, [
  { setNumber: 1, reps: 10, weightKg: null, durationSeconds: null },
]);

const restEndsAt = now + 90000;
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-7",
  restEndsAt,
}));

now = restEndsAt + 1000; // Past expiry

const { container: c7, unmount: unmount7 } = render(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now - 100000).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise7]}
    settings={settings}
    actions={actions}
  />,
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

check("No rest panel for expired value", !c7.textContent?.includes("Rest") || !c7.textContent?.includes("1:"));
check("Expired key removed", !mockStorage.data.has(key));

unmount7();

// ===== CASE 8: Hydration safety - no storage read during render =====
console.log("\nCase 8: Hydration safety → storage read in effect, not render (SSR + hydration)\n");

const exercise8 = makeExercise("ex-8", "bench", "Bench", 2, [
  { setNumber: 1, reps: 10, weightKg: null, durationSeconds: null },
]);

now = 3000000;
mockStorage.data.set(key, JSON.stringify({
  sessionId: sessionId,
  sessionExerciseId: "ex-8",
  restEndsAt: now + 90000,
}));

// (a) Server-side render: storage should NOT be read during render
const { renderToString } = await import("react-dom/server");
const serverHtml = renderToString(
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise8]}
    settings={settings}
    actions={actions}
  />,
);

check("Server HTML has no rest panel (no Skip button)", !serverHtml.includes(">Skip<"));
check("Server HTML has no rest timer", !serverHtml.includes("Rest") || !serverHtml.includes("1:"));

// (b) Hydrate with the server HTML and check for hydration errors
const { hydrateRoot } = await import("react-dom/client");
const container8 = document.createElement("div");
container8.innerHTML = serverHtml;
document.body.appendChild(container8);

const hydrationErrors: unknown[] = [];
const root8 = hydrateRoot(
  container8,
  <SessionRunner
    sessionId={sessionId}
    sessionStatus="in_progress"
    userId="test-user"
    isDeload={false}
    week={1}
    warmupAlreadyDone={true}
    startedAt={new Date(now).toISOString()}
    warmup={[]}
    cooldown={[]}
    exercises={[exercise8]}
    settings={settings}
    actions={actions}
  />,
  {
    onRecoverableError: (error) => {
      hydrationErrors.push(error);
    },
  },
);

await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
});

check("No hydration errors", hydrationErrors.length === 0);
check("No #418 hydration mismatch", !hydrationErrors.some((e) => e instanceof Error && (e.message.includes("418") || e.message.includes("Hydration"))));

// (c) After effects, rest panel should appear
const hasRestAfterHydration = container8.textContent?.includes("Rest") && container8.textContent?.includes("1:");
check("Rest panel appears after hydration (client effects ran)", hasRestAfterHydration ?? false);

const restTimeText = container8.textContent?.match(/Rest.*?(1:\d\d)/)?.[1];
check("Rest shows ~1:30 remaining after hydration", !!(restTimeText?.startsWith("1:2") || restTimeText?.startsWith("1:3") || restTimeText?.startsWith("1:29")), restTimeText);

root8.unmount();
document.body.removeChild(container8);

// Restore Date.now
Date.now = originalDateNow;

console.log("\n✅ All tests passed");
})();
