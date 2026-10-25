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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionRunner, type SessionActions, type RunnerExercise } from "../src/app/session/[id]/session-runner";
import type { SetConflictResult } from "../src/app/session/actions";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";

export {};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓ " : "✗ "} ${label}${detail ? `  -- ${detail}` : ""}`);
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
  const sessionExpiredActions: SessionActions = {
    ...defaultActions,
    logSet: async () => {
      throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired. Please sign in again.`);
    },
  };

  const exercises: RunnerExercise[] = [baseExercise("ex1", "Bench Press")];

  const { container, unmount } = render(
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
    })
  );

  const user = userEvent.setup();

  // Wait for component to sync (setTimeout 4000ms in useEffect)
  await new Promise(r => setTimeout(r, 4100));

  // Fill in reps input
  const repsInput = screen.getAllByRole("spinbutton")[0];
  await user.clear(repsInput);
  await user.type(repsInput, "10");

  // Click log set button
  const logButton = screen.getByText(/Log set 1/);
  await user.click(logButton);

  // Wait for error to appear
  try {
    await waitFor(() => {
      const text = container.textContent ?? "";
      if (!text.includes("Your session has expired")) {
        throw new Error("Error not shown yet");
      }
    }, { timeout: 3000 });
  } catch {
    // Timeout - error didn't appear
  }

  const text = container.textContent ?? "";
  const hasFriendlyMessage = text.includes("Your session has expired, please sign in again");
  const hasRawCode = text.includes("SESSION_EXPIRED:");
  
  check("Friendly error message shows", hasFriendlyMessage, hasFriendlyMessage ? "" : `got: "${text.slice(0, 200)}"`);
  check("Raw SESSION_EXPIRED code NOT shown", !hasRawCode);

  unmount();
}

// Test 2: L1 - conflict on last set → feel prompt appears
console.log("\n2. L1: conflict on last set → feel prompt appears");
{
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

  const { container, unmount } = render(
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
    })
  );

  const user = userEvent.setup();

  // Wait for component to sync (setTimeout 4000ms in useEffect)
  await new Promise(r => setTimeout(r, 4100));

  // Fill in reps and click log set 3
  const repsInput = screen.getAllByRole("spinbutton")[0];
  await user.clear(repsInput);
  await user.type(repsInput, "8");
  
  const logButton = screen.getByText(/Log set 3/);
  await user.click(logButton);

  // Wait for feel prompt
  try {
    await waitFor(() => {
      const text = container.textContent ?? "";
      if (!text.includes("How did that feel")) {
        throw new Error("Feel prompt not shown yet");
      }
    }, { timeout: 3000 });
  } catch {
    // Timeout - feel prompt didn't appear
  }

  const text = container.textContent ?? "";
  const hasFeelPrompt = text.includes("How did that feel");
  const stillOnExercise1 = text.includes("Exercise 1 of 2");
  
  check("Feel prompt appears after conflict on last set", hasFeelPrompt, hasFeelPrompt ? "" : text.slice(0, 200));
  check("Still on Exercise 1 (not jumped to Exercise 2)", stillOnExercise1);

  unmount();
}

// Test 3: L1 - picking feel after conflict advances to next exercise
console.log("\n3. L1: picking feel after conflict advances to next exercise");
{
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

  const { container, unmount } = render(
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
    })
  );

  const user = userEvent.setup();

  // Wait for component to sync (setTimeout 4000ms in useEffect)
  await new Promise(r => setTimeout(r, 4100));

  // Fill in reps and click log set 3
  const repsInput = screen.getAllByRole("spinbutton")[0];
  await user.clear(repsInput);
  await user.type(repsInput, "8");
  
  const logButton = screen.getByText(/Log set 3/);
  await user.click(logButton);

  // Wait for feel prompt, then click Just right
  let feelButton;
  try {
    await waitFor(() => {
      feelButton = screen.queryByText("Just right");
      if (!feelButton) {
        throw new Error("Just right button not found");
      }
    }, { timeout: 3000 });
    
    if (feelButton) {
      await user.click(feelButton);
      // Wait a bit for the action to complete
      await new Promise(r => setTimeout(r, 500));
    }
  } catch {
    // Feel prompt didn't appear or button not found
  }

  // Wait for transition to exercise 2
  try {
    await waitFor(() => {
      const text = container.textContent ?? "";
      if (!text.includes("Exercise 2 of 2")) {
        throw new Error("Not on exercise 2 yet");
      }
    }, { timeout: 5000 });
  } catch {
    // Didn't advance
  }

  const text = container.textContent ?? "";
  const onExercise2 = text.includes("Exercise 2 of 2");
  
  check("Advanced to Exercise 2 after picking feel", onExercise2, onExercise2 ? "" : `Still showing: ${text.match(/Exercise \d+ of \d+/)?.[0]}`);

  unmount();
}

console.log(`\n${failures > 0 ? "FAILED" : "PASSED"}: ${failures} failure(s)\n`);
process.exit(failures > 0 ? 1 : 0);

})();
