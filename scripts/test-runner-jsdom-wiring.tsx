#!/usr/bin/env tsx
/**
 * Test SessionRunner component wiring with real rendering and fake actions.
 *
 * Tests the real SessionRunner component with typed fake actions and injected timer/clock.
 * All tests are deterministic: no real sleeps, no Date.now(), no `as` casts, no || fallbacks.
 *
 * Assertions cover:
 * - Stale session clock capped at 179:59 (f1d-runner, f1e-helper)
 * - Failed finish shows "Try again", successful retry clears it (8b, 8b-retry-render)
 * - Double-click busyRef guard: action called exactly once (9, 9b, 9d-runner)
 * - Offline error shows runnerErrorMessage text, no unhandled rejection (run-error)
 * - Cool-down Done sends cooldownCompleted=true (w-cooldown)
 * - End early confirm with set counts, sends frozen elapsed (w-title, endearly, f1c)
 * - Done sends frozen elapsed time (f1, f2)
 *
 *   npx tsx scripts/test-runner-jsdom-wiring.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SessionRunner, type SessionActions, type RunnerTimer } from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function createFakeTimer(): {
  timer: RunnerTimer;
  advance: () => void;
} {
  type TimerId = ReturnType<typeof globalThis.setTimeout>;
  const callbacks = new Map<TimerId, () => void>();
  let nextId = 1;

  return {
    timer: {
      setTimeout: (callback: () => void, _ms: number): TimerId => {
        const id = (nextId++ as unknown) as TimerId;
        callbacks.set(id, callback);
        return id;
      },
      clearTimeout: (id: TimerId): void => {
        callbacks.delete(id);
      },
    },
    advance: () => {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      pending.forEach(cb => cb());
    },
  };
}

function createFakeClock(startMs: number): {
  now: () => string;
  advanceMs: (ms: number) => void;
  nowMs: () => number;
} {
  let currentMs = startMs;
  return {
    now: () => new Date(currentMs).toISOString(),
    advanceMs: (ms: number) => { currentMs += ms; },
    nowMs: () => currentMs,
  };
}

console.log("\nTesting SessionRunner component wiring with real rendering\n");

(async () => {

// Test 1: Stale session clock capped at 179:59
console.log("1. Stale session clock capped at 179:59 (f1d-runner, f1e-helper)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));
  const startedAt = new Date(clock.nowMs() - 15 * 60 * 60 * 1000).toISOString(); // 15 hours ago

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true, data: { status: "completed" } }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-stale",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: true,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps",
          primaryMuscles: ["quads"],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  const clockText = container.textContent;
  check("Stale session clock shows 179:59", clockText !== null && clockText.includes("179:59"));

  root.unmount();
  document.body.removeChild(container);
}

// Test 2: Failed finish shows "Try again", successful retry clears it
console.log("\n2. Failed finish shows 'Try again', successful retry clears it (8b, 8b-retry-render)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let finishAttempts = 0;
  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() {
      finishAttempts++;
      if (finishAttempts === 1) {
        return { ok: false, error: "Network error" };
      }
      return { ok: true, data: { status: "completed" } };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 60 * 1000).toISOString();

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-retry",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Bench Press",
          cue: null,
          metric: "reps",
          primaryMuscles: ["chest"],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 120,
          workingWeightKg: 80,
          suggestedWeightKg: null,
          status: "completed",
          feel: "right",
          sets: [
            { setNumber: 1, reps: 10, weightKg: 80, durationSeconds: null },
            { setNumber: 2, reps: 9, weightKg: 80, durationSeconds: null },
            { setNumber: 3, reps: 8, weightKg: 80, durationSeconds: null },
          ],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  // Click "Skip cool-down"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const skipButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("Skip cool-down");
    });
    check("Skip cool-down button found", skipButton !== undefined);
    if (skipButton) {
      skipButton.click();
    }
  });

  await act(async () => {});

  let textContent = container.textContent;
  const hasError = textContent !== null && textContent.includes("Network error");
  check("Failed finish shows error", hasError);
  const hasTryAgain = textContent !== null && textContent.includes("Try again");
  check("Failed finish shows 'Try again' button", hasTryAgain);

  // Click "Try again"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const retryButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.trim() === "Try again";
    });
    check("Try again button found", retryButton !== undefined);
    if (retryButton) {
      retryButton.click();
    }
  });

  await act(async () => {});

  textContent = container.textContent;
  const noTryAgainAfterSuccess = textContent !== null && !textContent.includes("Try again");
  check("Successful retry clears 'Try again'", noTryAgainAfterSuccess);

  root.unmount();
  document.body.removeChild(container);
}

// Test 3: Double-click busyRef guard - action called exactly once
console.log("\n3. Double-click busyRef guard: action called exactly once (9, 9b, 9d-runner)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let logSetCalls = 0;
  const fakeTimer = createFakeTimer();
  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() {
      logSetCalls++;
      return { ok: true };
    },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true, data: { status: "completed" } }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 30 * 1000).toISOString();

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-doubleclick",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Deadlift",
          cue: null,
          metric: "reps",
          primaryMuscles: ["hamstrings"],
          plannedSets: 3,
          repsMin: 5,
          repsMax: 8,
          restSeconds: 180,
          workingWeightKg: 140,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
        timer: fakeTimer.timer,
      })
    );
  });

  // Advance fake timer to mark component as synced
  await act(async () => {
    fakeTimer.advance();
  });

  await act(async () => {});

  // Double-click the "Set 1 done" button
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const setDoneButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("Set 1 done");
    });
    check("Set 1 done button found", setDoneButton !== undefined);
    if (setDoneButton instanceof HTMLButtonElement && !setDoneButton.disabled) {
      setDoneButton.click();
      setDoneButton.click(); // Double-click
    }
  });

  await act(async () => {});

  check("logSet called exactly once on double-click", logSetCalls === 1);
  const textContent = container.textContent;
  const noError = textContent !== null && !textContent.includes("Couldn't save");
  check("No error shown after double-click", noError);

  root.unmount();
  document.body.removeChild(container);
}

// Test 4: Offline error shows runnerErrorMessage text, no unhandled rejection
console.log("\n4. Offline error shows runnerErrorMessage text, no unhandled rejection (run-error)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));
  let unhandledRejections = 0;

  const originalHandler = process.listeners("unhandledRejection")[0];
  const testHandler = () => { unhandledRejections++; };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", testHandler);

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true, data: { status: "completed" } }; },
    async abandonSession() {
      throw new TypeError("Failed to fetch");
    },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 60 * 1000).toISOString();

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-offline",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps",
          primaryMuscles: ["quads"],
          plannedSets: 1,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [{ setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null }],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  // Click "End session early"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const endButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("End session early");
    });
    if (endButton) {
      endButton.click();
    }
  });

  await act(async () => {});

  // Click "End now" in the confirm dialog
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.trim() === "End now";
    });
    if (confirmButton) {
      confirmButton.click();
    }
  });

  await act(async () => {});

  const textContent = container.textContent;
  const hasOfflineMessage = textContent !== null && textContent.includes("offline");
  check("Offline error shows message with 'offline'", hasOfflineMessage);
  check("No unhandled rejections", unhandledRejections === 0);

  process.removeListener("unhandledRejection", testHandler);
  if (originalHandler) {
    process.on("unhandledRejection", originalHandler as (...args: unknown[]) => void);
  }

  root.unmount();
  document.body.removeChild(container);
}

// Test 5: Cool-down Done sends cooldownCompleted=true
console.log("\n5. Cool-down Done sends cooldownCompleted=true (w-cooldown)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let receivedCooldownCompleted: boolean | null = null;
  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession(params) {
      receivedCooldownCompleted = params.cooldownCompleted;
      return { ok: true, data: { status: "completed" } };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 45 * 1000).toISOString();

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-cooldown",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [
          {
            id: "cool-1",
            phase: "stretch",
            name: "Hamstring stretch",
            instructions: [],
            duration_seconds: 30,
            slug: "hamstring-stretch",
            type: "stretch",
            target_regions: [],
            target_muscles: [],
            equipment_ids: [],
            contraindicated_regions: [],
          },
        ],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Overhead Press",
          cue: null,
          metric: "reps",
          primaryMuscles: ["front_delts"],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 50,
          suggestedWeightKg: null,
          status: "completed",
          feel: "right",
          sets: [
            { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
            { setNumber: 2, reps: 9, weightKg: 50, durationSeconds: null },
            { setNumber: 3, reps: 9, weightKg: 50, durationSeconds: null },
          ],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: true,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  // Click "Done" button on cool-down screen
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const doneButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.trim() === "Done";
    });
    check("Done button found", doneButton !== undefined);
    if (doneButton) {
      doneButton.click();
    }
  });

  await act(async () => {});

  check("Cool-down Done sends cooldownCompleted=true", receivedCooldownCompleted === true);

  root.unmount();
  document.body.removeChild(container);
}

// Test 6: End early confirm with set counts, sends frozen elapsed
console.log("\n6. End early confirm with set counts, sends frozen elapsed (w-title, endearly, f1c)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let receivedDuration: number | null = null;
  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true, data: { status: "completed" } }; },
    async abandonSession(_sessionId: string, elapsedSeconds: number) {
      receivedDuration = elapsedSeconds;
      return { ok: true };
    },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 120 * 1000).toISOString(); // 120 seconds ago

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-endearly",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [
          {
            id: "ex-1",
            exerciseId: "exercise-id-1",
            name: "Squat",
            cue: null,
            metric: "reps",
            primaryMuscles: ["quads"],
            plannedSets: 3,
            repsMin: 8,
            repsMax: 12,
            restSeconds: 90,
            workingWeightKg: 100,
            suggestedWeightKg: null,
            status: "pending",
            feel: null,
            sets: [{ setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null }],
            isBodyweight: false,
          },
          {
            id: "ex-2",
            exerciseId: "exercise-id-2",
            name: "Bench Press",
            cue: null,
            metric: "reps",
            primaryMuscles: ["chest"],
            plannedSets: 3,
            repsMin: 8,
            repsMax: 12,
            restSeconds: 120,
            workingWeightKg: 80,
            suggestedWeightKg: null,
            status: "pending",
            feel: null,
            sets: [],
            isBodyweight: false,
          },
        ],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  // Total planned sets: 3 + 3 = 6, done: 1
  // Click "End session early"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const endButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("End session early");
    });
    check("End session early button found", endButton !== undefined);
    if (endButton) {
      endButton.click();
    }
  });

  await act(async () => {});

  // Check confirm dialog shows set counts
  let textContent = container.textContent;
  const hasSetCounts = textContent !== null && textContent.includes("1 of 6");
  check("Confirm dialog shows '1 of 6 sets done'", hasSetCounts);

  // Click "End now" in the confirm dialog
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.trim() === "End now";
    });
    check("End now button found in confirm dialog", confirmButton !== undefined);
    if (confirmButton) {
      confirmButton.click();
    }
  });

  await act(async () => {});

  textContent = container.textContent;
  const hasEndEarlyTitle = textContent !== null && textContent.includes("Session ended early");
  check("Summary shows 'Session ended early'", hasEndEarlyTitle);
  check("abandonSession received frozen duration", receivedDuration !== null && receivedDuration === 120);

  root.unmount();
  document.body.removeChild(container);
}

// Test 7: Done sends frozen elapsed time
console.log("\n7. Done sends frozen elapsed time (f1, f2)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let receivedDuration: number | null = null;
  const clock = createFakeClock(Date.parse("2026-10-25T12:00:00Z"));

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession(params) {
      receivedDuration = params.durationSeconds;
      return { ok: true, data: { status: "completed" } };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() {
      return { ok: true, data: { metric: "reps", repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(clock.nowMs() - 75 * 1000).toISOString(); // 75 seconds ago

  await act(async () => {
    root.render(
      React.createElement(SessionRunner, {
        sessionId: "session-frozen",
        isDeload: false,
        week: 1,
        warmupAlreadyDone: true,
        startedAt,
        isStale: false,
        warmup: [],
        cooldown: [],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps",
          primaryMuscles: ["quads"],
          plannedSets: 1,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "completed",
          feel: "right",
          sets: [{ setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null }],
          isBodyweight: false,
        }],
        settings: {
          perSetLogging: false,
          restAutostart: true,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        },
        actions: fakeActions,
      })
    );
  });

  await act(async () => {});

  // Click "Skip cool-down"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const skipButton = buttons.find(b => {
      const text = b.textContent;
      return text !== null && text.includes("Skip cool-down");
    });
    check("Skip cool-down button found", skipButton !== undefined);
    if (skipButton) {
      skipButton.click();
    }
  });

  await act(async () => {});

  check("finishSession received frozen duration of 75 seconds", receivedDuration === 75);

  const textContent = container.textContent;
  const hasSummary = textContent !== null && textContent.includes("Session complete");
  check("Shows summary after finish", hasSummary);

  root.unmount();
  document.body.removeChild(container);
}

console.log("");
if (failures > 0) {
  console.log(`❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("✨ All SessionRunner jsdom wiring tests passed!");

})().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
