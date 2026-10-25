#!/usr/bin/env tsx
/**
 * Test: SessionRunner QA LOWs (L4, L1) via jsdom render.
 * 
 * L4: onLogSet with SESSION_EXPIRED error shows friendly message
 * L1: conflict on last set → feel prompt → picking feel advances to next exercise
 * 
 * These tests render the real SessionRunner component and assert that breaking
 * the call sites (session-runner.tsx:691 for L4, :666 and :745-765 for L1) causes
 * test failures.
 */
import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SessionRunner, type SessionActions, type RunnerExercise, type RunnerTimer } from "../src/app/session/[id]/session-runner";
import type { SetConflictResult } from "../src/app/session/actions";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";

export {};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ " : "✗ "} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeTimer() {
  const callbacks: (() => void)[] = [];
  return {
    timer: {
      setTimeout: (callback: () => void) => {
        const id = callbacks.length;
        callbacks.push(callback);
        return id;
      },
      clearTimeout: (id: unknown) => {
        if (typeof id === "number" && callbacks[id]) {
          callbacks[id] = () => {};
        }
      },
    } as RunnerTimer,
    advance: () => {
      callbacks.forEach(cb => cb());
      callbacks.length = 0;
    },
  };
}

const baseExercise = (id: string, name: string): RunnerExercise => ({
  id,
  exerciseId: `exercise-${id}`,
  name,
  cue: null,
  metric: "reps" as const,
  primaryMuscles: [],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
  workingWeightKg: 60,
  suggestedWeightKg: 60,
  status: "pending" as const,
  feel: null,
  sets: [],
  isBodyweight: false,
});

const defaultActions: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => ({ ok: true }),
  deleteSet: async () => ({ ok: true }),
  finishExercise: async () => ({ ok: true, data: null }),
  finishSession: async () => ({ ok: true }),
  abandonSession: async () => ({ ok: true }),
  findAlternatives: async () => ({ ok: true, data: [] }),
  swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } }),
  refreshAfterSession: async () => ({ ok: true }),
  planDay: async () => ({ ok: true }),
};

console.log("\nTesting SessionRunner QA LOWs\n");

(async () => {

// Test 1: L4 - logSet throws SESSION_EXPIRED → friendly error message shows
console.log("1. L4: logSet throws SESSION_EXPIRED → friendly error message shows");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const fakeTimer = createFakeTimer();

  const sessionExpiredActions: SessionActions = {
    ...defaultActions,
    logSet: async () => {
      throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired. Please sign in again.`);
    },
  };

  const exercises: RunnerExercise[] = [baseExercise("ex1", "Bench Press")];

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-1",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date().toISOString(),
        warmup: [],
        cooldown: [],
        exercises,
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: sessionExpiredActions,
        timer: fakeTimer.timer,
      })
    );
  });

  // Advance the fake timer to mark component as synced
  await act(async () => {
    fakeTimer.advance();
  });

  // Fill in reps and click log set button
  await act(async () => {
    const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const repsInput = inputs[0];
    if (repsInput) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(repsInput, "10");
      repsInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const logButton = buttons.find(b => b.textContent?.includes("Log set 1"));
    if (logButton) {
      logButton.click();
    }
  });

  // Flush microtasks
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  const text = container.textContent ?? "";
  const hasFriendlyMessage = text.includes("Your session has expired, please sign in again");
  const hasRawCode = text.includes("SESSION_EXPIRED:");
  
  check("Friendly error message shows", hasFriendlyMessage, hasFriendlyMessage ? "" : `got: "${text.slice(0, 200)}"`);
  check("Raw SESSION_EXPIRED code NOT shown", !hasRawCode);

  root.unmount();
  document.body.removeChild(container);
}

// Test 2: L1 - conflict on last set → feel prompt appears
console.log("\n2. L1: conflict on last set → feel prompt appears");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const fakeTimer = createFakeTimer();

  const conflictActions: SessionActions = {
    ...defaultActions,
    logSet: async (): Promise<SetConflictResult> => ({
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 9, weightKg: 60, durationSeconds: null },
        { setNumber: 3, reps: 8, weightKg: 60, durationSeconds: null },
      ],
    }),
  };

  const exercises: RunnerExercise[] = [
    { 
      ...baseExercise("ex1", "Bench Press"), 
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 9, weightKg: 60, durationSeconds: null },
      ] 
    },
    baseExercise("ex2", "Squat"),
  ];

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-2",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date().toISOString(),
        warmup: [],
        cooldown: [],
        exercises,
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: conflictActions,
        timer: fakeTimer.timer,
      })
    );
  });

  await act(async () => {
    fakeTimer.advance();
  });

  // Fill in reps and click log set 3
  await act(async () => {
    const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const repsInput = inputs[0];
    if (repsInput) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(repsInput, "8");
      repsInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const logButton = buttons.find(b => b.textContent?.includes("Log set 3"));
    if (logButton) {
      logButton.click();
    }
  });

  // Flush microtasks
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  const text = container.textContent ?? "";
  const hasFeelPrompt = text.includes("How did that feel");
  const stillOnExercise1 = text.includes("Exercise 1 of 2");
  
  check("Feel prompt appears after conflict on last set", hasFeelPrompt, hasFeelPrompt ? "" : text.slice(0, 200));
  check("Still on Exercise 1 (not jumped to Exercise 2)", stillOnExercise1);

  root.unmount();
  document.body.removeChild(container);
}

// Test 3: L1 - picking feel after conflict advances to next exercise
console.log("\n3. L1: picking feel after conflict advances to next exercise");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const fakeTimer = createFakeTimer();

  const conflictThenOkActions: SessionActions = {
    ...defaultActions,
    logSet: async (): Promise<SetConflictResult> => ({
      ok: false,
      reason: "set_exists",
      savedSets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 9, weightKg: 60, durationSeconds: null },
        { setNumber: 3, reps: 8, weightKg: 60, durationSeconds: null },
      ],
    }),
  };

  const exercises: RunnerExercise[] = [
    { 
      ...baseExercise("ex1", "Bench Press"), 
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
        { setNumber: 2, reps: 9, weightKg: 60, durationSeconds: null },
      ] 
    },
    baseExercise("ex2", "Squat"),
  ];

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "sess-3",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt: new Date().toISOString(),
        warmup: [],
        cooldown: [],
        exercises,
        settings: {
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: conflictThenOkActions,
        timer: fakeTimer.timer,
      })
    );
  });

  await act(async () => {
    fakeTimer.advance();
  });

  // Fill in reps and click log set 3
  await act(async () => {
    const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const repsInput = inputs[0];
    if (repsInput) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(repsInput, "8");
      repsInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const logButton = buttons.find(b => b.textContent?.includes("Log set 3"));
    if (logButton) {
      logButton.click();
    }
  });

  // Flush microtasks
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  // Click "Just right" button
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const feelButton = buttons.find(b => b.textContent?.trim() === "Just right");
    if (feelButton) {
      feelButton.click();
    }
  });

  // Flush microtasks
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  const text = container.textContent ?? "";
  const onExercise2 = text.includes("Exercise 2 of 2");
  
  check("Advanced to Exercise 2 after picking feel", onExercise2, onExercise2 ? "" : `Still showing: ${text.match(/Exercise \d+ of \d+/)?.[0]}`);

  root.unmount();
  document.body.removeChild(container);
}

console.log(`\n${failures > 0 ? "FAILED" : "PASSED"}: ${failures} failure(s)\n`);
process.exit(failures > 0 ? 1 : 0);

})();
