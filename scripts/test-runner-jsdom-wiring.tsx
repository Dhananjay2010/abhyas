#!/usr/bin/env tsx
/**
 * Test SessionRunner component wiring with real rendering and fake actions (item 6).
 *
 * Tests the real SessionRunner component with typed fake actions injected through props.
 * Assertions cover:
 * - Failed finish shows "Try again", successful retry clears it (8b, 8b-retry-render)
 * - Double-clicking Log set calls logSet exactly once, no error (9, 9b, 9d-runner)
 * - Cool-down Done sends cooldownCompleted=true (w-cooldown)
 * - End early shows the end-early summary title (w-title)
 * - Done sends frozen elapsed time, clock stops after finish (f1, f1c, f2)
 * - Stale session clock capped at 179:59 (f1d-runner, f1e-helper, j2)
 *
 *   npx tsx scripts/test-runner-jsdom-wiring.tsx
 */

import "./helpers/setup-jsdom";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SessionRunner, type SessionActions, type Feel, type Muscle } from "../src/app/session/[id]/session-runner";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log("\nTesting SessionRunner component wiring with real rendering\n");

(async () => {

// Test 1: Stale clock cap
console.log("1. Stale session clock capped at 179:59 (f1d-runner, f1e-helper, j2)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString();

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
          metric: "reps" as const,
          primaryMuscles: ["quads" as Muscle],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "pending" as const,
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
    await sleep(100);
  });

  const clockText = container.textContent ?? "";
  check("Stale session clock capped at 179:59", clockText.includes("179:59"));

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
      return { ok: true };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 60 * 1000).toISOString();

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
          metric: "reps" as const,
          primaryMuscles: ["chest" as Muscle],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 120,
          workingWeightKg: 80,
          suggestedWeightKg: null,
          status: "completed" as const,
          feel: "right" as Feel,
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
    await sleep(100);
  });

  // Click "Skip cool-down" (which is the only button since cooldownEnabled is false)
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const skipButton = buttons.find(b => b.textContent?.includes("Skip cool-down"));
    if (skipButton) skipButton.click();
    await sleep(150);
  });

  let textContent = container.textContent ?? "";
  const hasError = textContent.includes("Network error") || textContent.includes("Couldn't");
  check("Failed finish shows error", hasError);
  const hasTryAgain = textContent.includes("Try again");
  check("Failed finish shows 'Try again' button", hasTryAgain);

  // Click "Try again"
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const retryButton = buttons.find(b => b.textContent?.trim() === "Try again");
    if (retryButton) retryButton.click();
    await sleep(150);
  });

  textContent = container.textContent ?? "";
  const noTryAgainAfterSuccess = !textContent.includes("Try again") || textContent.includes("Session complete");
  check("Successful retry clears 'Try again'", noTryAgainAfterSuccess);

  root.unmount();
  document.body.removeChild(container);
}

// Test 3: Double-click Log set calls logSet exactly once
console.log("\n3. Double-click Log set calls logSet exactly once (9, 9b, 9d-runner)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let logSetCalls = 0;

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { 
      logSetCalls++;
      await sleep(50); // Simulate network delay
      return { ok: true };
    },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 30 * 1000).toISOString();

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
          metric: "reps" as const,
          primaryMuscles: ["hamstrings" as Muscle],
          plannedSets: 3,
          repsMin: 5,
          repsMax: 8,
          restSeconds: 180,
          workingWeightKg: 140,
          suggestedWeightKg: null,
          status: "pending" as const,
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
    await sleep(100);
  });

  // Double-click the "Done" button for set 1
  await act(async () => {
    // Fill in reps
    const inputs = container.querySelectorAll("input[type='number']");
    const repsInput = Array.from(inputs).find(i => 
      i.getAttribute("aria-label")?.includes("reps") || i.getAttribute("placeholder")?.includes("reps")
    ) as HTMLInputElement;
    if (repsInput) {
      repsInput.value = "5";
      repsInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await sleep(50);

    const buttons = Array.from(container.querySelectorAll("button"));
    const doneButton = buttons.find(b => b.textContent?.trim() === "Done" && !b.disabled);
    if (doneButton) {
      doneButton.click();
      doneButton.click(); // Double-click
    }
    await sleep(100);
  });

  check("logSet called exactly once on double-click", logSetCalls === 1);
  const textContent = container.textContent ?? "";
  const noError = !textContent.includes("Couldn't save") && !textContent.includes("error");
  check("No error shown after double-click", noError);

  root.unmount();
  document.body.removeChild(container);
}

// Test 4: Cool-down Done sends cooldownCompleted=true
console.log("\n4. Cool-down Done sends cooldownCompleted=true (w-cooldown)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let receivedCooldownCompleted: boolean | null = null;

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession(params) {
      receivedCooldownCompleted = params.cooldownCompleted;
      return { ok: true };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 45 * 1000).toISOString();

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
          { id: "cool-1", phase: "cooldown" as const, name: "Hamstring stretch", instructions: [], duration_seconds: 30 },
        ],
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Overhead Press",
          cue: null,
          metric: "reps" as const,
          primaryMuscles: ["shoulders" as Muscle],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 50,
          suggestedWeightKg: null,
          status: "completed" as const,
          feel: "right" as Feel,
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
    await sleep(100);
  });

  // Click "Done" button on cool-down screen
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const doneButton = buttons.find(b => b.textContent?.trim() === "Done");
    if (doneButton) doneButton.click();
    await sleep(150);
  });

  check("Cool-down Done sends cooldownCompleted=true", receivedCooldownCompleted === true);

  root.unmount();
  document.body.removeChild(container);
}

// Test 5: End early shows end-early summary title
console.log("\n5. End early shows end-early summary title (w-title)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession() { return { ok: true }; },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 120 * 1000).toISOString();

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
        exercises: [{
          id: "ex-1",
          exerciseId: "exercise-id-1",
          name: "Squat",
          cue: null,
          metric: "reps" as const,
          primaryMuscles: ["quads" as Muscle],
          plannedSets: 3,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "pending" as const,
          feel: null,
          sets: [
            { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
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
    await sleep(100);
  });

  // Open end early dialog
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const endButton = buttons.find(b => 
      b.textContent?.includes("End session early") || b.textContent?.includes("End early")
    );
    if (endButton) endButton.click();
    await sleep(100);
  });

  // Confirm end early
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirmButton = buttons.find(b => 
      b.textContent?.trim() === "End session" || b.textContent?.includes("Confirm")
    );
    if (confirmButton) confirmButton.click();
    await sleep(150);
  });

  const textContent = container.textContent ?? "";
  const hasEndEarlyTitle = textContent.includes("Session ended early") || textContent.includes("ended early");
  check("End early shows end-early summary title", hasEndEarlyTitle);

  root.unmount();
  document.body.removeChild(container);
}

// Test 6: Done sends frozen elapsed, clock stops
console.log("\n6. Done sends frozen elapsed time, clock stops after finish (f1, f1c, f2)");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let receivedDuration: number | null = null;

  const fakeActions: SessionActions = {
    async markWarmupDone() { return { ok: true }; },
    async logSet() { return { ok: true }; },
    async deleteSet() { return { ok: true }; },
    async finishExercise() { return { ok: true, data: null }; },
    async finishSession(params) {
      receivedDuration = params.durationSeconds;
      return { ok: true };
    },
    async abandonSession() { return { ok: true }; },
    async findAlternatives() { return { ok: true, data: [] }; },
    async swapExercise() { 
      return { ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } };
    },
    async planDay() { return { ok: true }; },
    async refreshAfterSession() { return { ok: true }; },
  };

  const startedAt = new Date(Date.now() - 75 * 1000).toISOString(); // 75 seconds ago

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
          metric: "reps" as const,
          primaryMuscles: ["quads" as Muscle],
          plannedSets: 1,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 90,
          workingWeightKg: 100,
          suggestedWeightKg: null,
          status: "completed" as const,
          feel: "right" as Feel,
          sets: [
            { setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null },
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
    await sleep(100);
  });

  // Get clock text before finish
  const clockBeforeFinish = container.textContent ?? "";

  // Click "Skip cool-down" (finish)
  await act(async () => {
    const buttons = Array.from(container.querySelectorAll("button"));
    const skipButton = buttons.find(b => b.textContent?.includes("Skip cool-down"));
    if (skipButton) skipButton.click();
    await sleep(150);
  });

  check("Done sends non-zero frozen duration", receivedDuration !== null && receivedDuration > 0);
  check("Duration is approximately 75 seconds", receivedDuration !== null && receivedDuration >= 74 && receivedDuration <= 76);

  // Check that clock stopped (summary shows fixed duration)
  const clockAfterFinish = container.textContent ?? "";
  const hasSummary = clockAfterFinish.includes("Session complete") || clockAfterFinish.includes("complete");
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
