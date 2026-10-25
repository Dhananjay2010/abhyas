/**
 * Test: onLogSet catches session-expired errors and shows the friendly message.
 * 
 * L4 (QA Bot 1, PR #79): logging a set with an expired session showed the raw
 * "SESSION_EXPIRED: Your session has expired". Main (PR #105) shows the friendly
 * "Your session has expired, please sign in again". onLogSet no longer goes through
 * run()/runnerErrorMessage, so it must map isSessionExpired itself.
 * 
 * This test fails when the fix is reverted: the raw error leaks to the user.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { SessionRunner, type SessionActions } from "../src/app/session/[id]/session-runner";
import { SESSION_EXPIRED_CODE } from "../src/lib/auth/session-expired";
import type { Database } from "../src/lib/database.types";

type Feel = Database["public"]["Enums"]["set_feel"];

const MOCK_ACTIONS: SessionActions = {
  markWarmupDone: async () => ({ ok: true }),
  logSet: async () => {
    // Simulate the proxy's session-expired response: Next.js 16's action client
    // throws Error with the response text, which is "SESSION_EXPIRED: ..."
    throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
  },
  deleteSet: async () => ({ ok: true }),
  finishExercise: async () => ({ ok: true }),
  finishSession: async () => ({ ok: true }),
  abandonSession: async () => ({ ok: true }),
  findAlternatives: async () => ({ ok: true, data: [] }),
  swapExercise: async () => ({ ok: true, data: { metric: "reps" as const, repsMin: 8, repsMax: 12, equipmentIds: [] } }),
  refreshAfterSession: async () => ({ ok: true }),
  planDay: async () => ({ ok: true }),
};

const EXERCISE = {
  id: "ex1",
  exerciseId: "bench-press",
  name: "Bench Press",
  cue: null,
  metric: "reps" as const,
  primaryMuscles: ["chest"] as Array<Database["public"]["Enums"]["muscle"]>,
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
  workingWeightKg: 60,
  suggestedWeightKg: 60,
  status: "pending" as const,
  feel: null as Feel | null,
  sets: [],
  isBodyweight: false,
};

test("onLogSet session-expired error shows friendly message", async () => {
  const { user } = render(
    <SessionRunner
      sessionId="sess1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[EXERCISE]}
      settings={{
        perSetLogging: true,
        restAutostart: false,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
      }}
      actions={MOCK_ACTIONS}
    />
  );

  // Fill in set data
  const repsInput = screen.getByLabelText(/reps/i);
  const weightInput = screen.getByLabelText(/weight/i);
  await user.type(repsInput, "10");
  await user.type(weightInput, "60");

  // Submit the set
  const logButton = screen.getByRole("button", { name: /log set/i });
  await user.click(logButton);

  // Wait for the friendly error message
  await waitFor(() => {
    const alert = screen.queryByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain("Your session has expired, please sign in again");
    // The raw error must NOT appear
    expect(alert?.textContent).not.toContain("SESSION_EXPIRED:");
  });
});

test("onLogSet session-expired raw prefix is hidden", async () => {
  const { user } = render(
    <SessionRunner
      sessionId="sess1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[EXERCISE]}
      settings={{
        perSetLogging: true,
        restAutostart: false,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: false,
      }}
      actions={MOCK_ACTIONS}
    />
  );

  const repsInput = screen.getByLabelText(/reps/i);
  await user.type(repsInput, "10");
  const logButton = screen.getByRole("button", { name: /log set/i });
  await user.click(logButton);

  await waitFor(() => {
    const errorText = screen.queryByRole("alert")?.textContent ?? "";
    // Fail if the raw prefix leaks
    if (errorText.includes("SESSION_EXPIRED:")) {
      throw new Error(`Raw session-expired code leaked to the user: "${errorText}"`);
    }
  });
});
