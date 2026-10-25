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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionRunner, type SessionActions, type RunnerExercise } from "../src/app/session/[id]/session-runner";
import type { SetConflictResult } from "../src/app/session/actions";

export {};

// Mock next/navigation by setting it in globalThis before the component imports it
(globalThis as { next?: unknown }).next = {
  router: {
    push: () => {},
    prefetch: () => {},
    replace: () => {},
    reload: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    pathname: "/session/test",
    query: {},
  },
};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
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

async function main() {
  console.log("Testing SessionRunner QA LOWs\n");

  await test("L4: logSet throws SESSION_EXPIRED → friendly error message shows", async () => {
    const sessionExpiredActions: SessionActions = {
      ...defaultActions,
      logSet: async () => {
        throw new Error("SESSION_EXPIRED: Your session has ended. Please sign in again.");
      },
    };

    const exercises: RunnerExercise[] = [baseExercise("ex1", "Bench Press")];

    const { container } = render(
      <SessionRunner
        sessionId="sess-1"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={exercises}
        settings={{
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        }}
        tomorrow={null}
        actions={sessionExpiredActions}
        onExit={undefined}
      />,
    );

    // Find the reps input and submit button
    const repsInput = container.querySelector('input[inputmode="decimal"]');
    if (!repsInput) throw new Error("Reps input not found");

    const submitButton = screen.getByText("Log set 1");
    if (!submitButton) throw new Error("Submit button not found");

    // Enter reps and submit
    fireEvent.change(repsInput, { target: { value: "10" } });
    fireEvent.click(submitButton);

    // Wait for the error message to appear
    await waitFor(
      () => {
        const errorText = screen.queryByText(/Your session has ended/);
        if (!errorText) {
          throw new Error("Expected friendly error message not found");
        }
      },
      { timeout: 1000 },
    );

    // Verify it's NOT showing the raw "SESSION_EXPIRED:" prefix
    const rawError = screen.queryByText(/SESSION_EXPIRED:/);
    if (rawError) {
      throw new Error("Raw SESSION_EXPIRED error should not be shown to user");
    }
  });

  await test("L1: conflict on last set → feel prompt appears", async () => {
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
      { ...baseExercise("ex1", "Bench Press"), sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }] },
      baseExercise("ex2", "Squat"),
    ];

    const { container } = render(
      <SessionRunner
        sessionId="sess-2"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={exercises}
        settings={{
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        }}
        tomorrow={null}
        actions={conflictActions}
        onExit={undefined}
      />,
    );

    // Find the reps input and submit button for set 2
    const repsInput = container.querySelector('input[inputmode="decimal"]');
    if (!repsInput) throw new Error("Reps input not found");

    const submitButton = screen.getByText(/Log set 2/);
    if (!submitButton) throw new Error("Submit button not found");

    // Enter reps and submit - this will trigger the conflict
    fireEvent.change(repsInput, { target: { value: "9" } });
    fireEvent.click(submitButton);

    // Wait for the feel prompt to appear
    await waitFor(
      () => {
        const feelPrompt = screen.queryByText(/How did that feel/);
        if (!feelPrompt) {
          throw new Error("Feel prompt should appear after conflict on last set");
        }
      },
      { timeout: 1000 },
    );

    // Verify we're still on exercise 1 (index 0)
    const exerciseTitle = screen.queryByText(/Exercise 1 of 2/);
    if (!exerciseTitle) {
      throw new Error("Should still be on Exercise 1 after conflict on last set");
    }
  });

  await test("L1: picking feel after conflict advances to next exercise", async () => {
    const conflictThenOkActions: SessionActions = {
      ...defaultActions,
      logSet: async (): Promise<SetConflictResult> => {
        return {
          ok: false,
          reason: "set_exists",
          savedSets: [
            { setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null },
            { setNumber: 2, reps: 9, weightKg: 60, durationSeconds: null },
            { setNumber: 3, reps: 8, weightKg: 60, durationSeconds: null },
          ],
        };
      },
    };

    const exercises: RunnerExercise[] = [
      { ...baseExercise("ex1", "Bench Press"), sets: [{ setNumber: 1, reps: 10, weightKg: 60, durationSeconds: null }] },
      baseExercise("ex2", "Squat"),
    ];

    const { container } = render(
      <SessionRunner
        sessionId="sess-3"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={exercises}
        settings={{
          perSetLogging: true,
          restAutostart: false,
          restSound: false,
          restVibrate: false,
          restOverrideSeconds: null,
          cooldownEnabled: false,
        }}
        tomorrow={null}
        actions={conflictThenOkActions}
        onExit={undefined}
      />,
    );

    // Submit set 2 to trigger conflict
    const repsInput = container.querySelector('input[inputmode="decimal"]');
    if (!repsInput) throw new Error("Reps input not found");

    const submitButton = screen.getByText(/Log set 2/);
    fireEvent.change(repsInput, { target: { value: "9" } });
    fireEvent.click(submitButton);

    // Wait for feel prompt
    await waitFor(() => {
      if (!screen.queryByText(/How did that feel/)) {
        throw new Error("Feel prompt should appear");
      }
    });

    // Click a feel button (e.g., "Good")
    const goodButton = screen.getByText("Good");
    fireEvent.click(goodButton);

    // Wait for transition to next exercise
    await waitFor(
      () => {
        const exerciseTitle = screen.queryByText(/Exercise 2 of 2/);
        if (!exerciseTitle) {
          throw new Error("Should advance to Exercise 2 after picking feel");
        }
      },
      { timeout: 1000 },
    );
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
