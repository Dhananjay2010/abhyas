#!/usr/bin/env tsx
/**
 * Test: SessionRunner expired banner (L1)
 * 
 * Verifies:
 * - While expired, exactly ONE expired prompt shows (not two - L1 fix)
 * - After successful Retry, no expired prompt remains (L1 clear fix)
 */

import "./helpers/setup-jsdom";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
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
    restSeconds: 60,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status: sets.length >= plannedSets ? "completed" : "pending",
    feel: sets.length >= plannedSets ? "right" : null,
    sets,
    isBodyweight: false,
  };
}

const settings = {
  perSetLogging: true,
  restAutostart: false,
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

console.log("\n📋 Test: L1 - Single expired banner + clear on retry\n");

(async () => {
  // ===== Test 1: Exactly ONE expired banner (not two) =====
  console.log("=== Test 1: Log set while expired → exactly one expired banner ===\n");

  const exercise1 = makeExercise("ex-1", "squat", "Squat", 1);

  let logSetCalls = 0;
  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls++;
      await Promise.resolve();
      return { ok: false, error: "Not signed in", code: "SESSION_EXPIRED" };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      throw new Error("Should not swap");
    },
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const { container: c1, unmount: unmount1 } = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="test-user-1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise1]}
      settings={settings}
      actions={actions1}
    />,
  );

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  await waitFor(() => {
    if (!c1.textContent?.includes("Squat")) throw new Error("Exercise not shown");
  }, { timeout: 5000 });

  // Log first set while expired - fill both reps and weight
  const repsInput = [...c1.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  const weightInput = [...c1.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("kg"),
  ) as HTMLInputElement | undefined;

  if (!repsInput || !weightInput) {
    console.log("  ✗ FAIL Reps or weight input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput, { target: { value: "10" } });
    fireEvent.change(weightInput, { target: { value: "50" } });
  });

  await act(async () => {
    await Promise.resolve();
  });

  const logBtn = [...c1.querySelectorAll("button")].find((b) =>
    /Log set 1/.test(b.textContent ?? ""),
  );

  if (!logBtn) {
    console.log("  ✗ FAIL Log set button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(logBtn);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  await waitFor(() => {
    if (logSetCalls !== 1) throw new Error("logSet not called");
  }, { timeout: 2000 });

  check("Logged set (expired)", logSetCalls === 1);

  // Check for exactly ONE expired prompt
  await waitFor(() => {
    const expiredPrompts = (c1.textContent?.match(/session has expired/gi) || []).length;
    if (expiredPrompts === 0) throw new Error("Expired prompt not shown");
  }, { timeout: 1000 });

  const expiredPrompts = (c1.textContent?.match(/session has expired/gi) || []).length;
  check(`Exactly 1 expired prompt visible (L1 fix)`, expiredPrompts === 1, `found ${expiredPrompts}`);

  unmount1();
  console.log("✓ Test 1 passed\n");

  // ===== Test 2: After successful Retry, no expired prompt =====
  console.log("=== Test 2: Successful Retry clears expired prompt ===\n");

  const exercise2 = makeExercise("ex-2", "bench", "Bench Press", 1);

  let expired = true;
  let logSetCalls2 = 0;
  const actions2: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls2++;
      await Promise.resolve();
      if (expired) {
        return { ok: false, error: "Not signed in", code: "SESSION_EXPIRED" };
      }
      return { ok: true };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      throw new Error("Should not swap");
    },
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const { container: c2, unmount: unmount2 } = render(
    <SessionRunner
      sessionId="s2"
      sessionStatus="in_progress"
      userId="test-user-2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise2]}
      settings={settings}
      actions={actions2}
    />,
  );

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  await waitFor(() => {
    if (!c2.textContent?.includes("Bench Press")) throw new Error("Exercise not shown");
  }, { timeout: 5000 });

  // Log first set while expired - fill both reps and weight
  const repsInput2 = [...c2.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  const weightInput2 = [...c2.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("kg"),
  ) as HTMLInputElement | undefined;

  if (!repsInput2 || !weightInput2) {
    console.log("  ✗ FAIL Reps or weight input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput2, { target: { value: "10" } });
    fireEvent.change(weightInput2, { target: { value: "50" } });
  });

  await act(async () => {
    await Promise.resolve();
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
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  await waitFor(() => {
    if (logSetCalls2 !== 1) throw new Error("logSet not called");
  }, { timeout: 2000 });

  check("Logged set while expired", logSetCalls2 === 1);

  // Wait for expired prompt to show
  await waitFor(() => {
    if ((c2.textContent?.match(/session has expired/gi) || []).length === 0) 
      throw new Error("Expired prompt not shown");
  }, { timeout: 1000 });

  check("Expired prompt shows", (c2.textContent?.match(/session has expired/gi) || []).length > 0);

  // "Restore" session
  expired = false;

  // Click Retry
  const retryButton = [...c2.querySelectorAll("button")].find((b) =>
    /Retry/.test(b.textContent ?? ""),
  );

  if (!retryButton) {
    console.log("  ✗ FAIL Retry button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(retryButton);
  });

  await waitFor(() => {
    if (logSetCalls2 !== 2) throw new Error("Retry not called");
  }, { timeout: 2000 });

  check("Retry called logSet", logSetCalls2 === 2);

  // Wait for expired prompt to disappear
  await waitFor(() => {
    if ((c2.textContent?.match(/session has expired/gi) || []).length > 0)
      throw new Error("Expired prompt still visible");
  }, { timeout: 2000 });

  const expiredPromptsAfterRetry = (c2.textContent?.match(/session has expired/gi) || []).length;
  check("No expired prompt remains after successful retry (L1 clear fix)", expiredPromptsAfterRetry === 0, `found ${expiredPromptsAfterRetry}`);

  unmount2();
  console.log("✓ Test 2 passed\n");

  // ===== Test 3: Non-expired error → NO expired banner (M2) =====
  console.log("=== Test 3: Non-expired error → NO expired banner ===\n");

  const exercise3 = makeExercise("ex-3", "deadlift", "Deadlift", 1);

  let logSetCalls3 = 0;
  const actions3: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls3++;
      await Promise.resolve();
      return { ok: false, error: "Network error" };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    getSessionSummary: async () => ({ ok: true as const, data: [] }),
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      throw new Error("Should not swap");
    },
    findAlternatives: async () => ({ ok: true as const, data: [] }),
  } as unknown as SessionActions;

  const { container: c3, unmount: unmount3 } = render(
    <SessionRunner
      sessionId="s3"
      sessionStatus="in_progress"
      userId="test-user-3"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise3]}
      settings={settings}
      actions={actions3}
    />,
  );

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
  });

  await waitFor(() => {
    if (!c3.textContent?.includes("Deadlift")) throw new Error("Exercise not shown");
  }, { timeout: 5000 });

  // Log first set with network error - fill both reps and weight
  const repsInput3 = [...c3.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  const weightInput3 = [...c3.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("kg"),
  ) as HTMLInputElement | undefined;

  if (!repsInput3 || !weightInput3) {
    console.log("  ✗ FAIL Reps or weight input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput3, { target: { value: "10" } });
    fireEvent.change(weightInput3, { target: { value: "50" } });
  });

  await act(async () => {
    await Promise.resolve();
  });

  const logBtn3 = [...c3.querySelectorAll("button")].find((b) =>
    /Log set 1/.test(b.textContent ?? ""),
  );

  if (!logBtn3) {
    console.log("  ✗ FAIL Log set button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(logBtn3);
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  await waitFor(() => {
    if (logSetCalls3 !== 1) throw new Error("logSet not called");
  }, { timeout: 2000 });

  check("Logged set (network error)", logSetCalls3 === 1);

  // Check for NO expired prompt (flush any pending updates)
  await act(async () => {
    await Promise.resolve();
  });

  const expiredPrompts3 = (c3.textContent?.match(/session has expired/gi) || []).length;
  check(`M2: No expired prompt for non-expired error`, expiredPrompts3 === 0, `found ${expiredPrompts3}`);

  unmount3();
  console.log("✓ Test 3 passed\n");

  console.log("\n✅ All L1 tests passed\n");
  process.exit(0);
})();
