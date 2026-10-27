#!/usr/bin/env tsx
/**
 * Test: SessionRunner expired banner (L1)
 * 
 * Verifies:
 * - While expired, logging last set + tapping a feel button shows exactly ONE expired prompt
 * - After session restore + successful Retry, no expired prompt remains
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
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
  // ===== Test 1: Log last set while expired → exactly one expired banner =====
  console.log("=== Test 1: Log last set while expired → one expired banner ===\n");

  const exercise1 = makeExercise("ex-1", "bench-press", "Bench Press", 3, [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
    { setNumber: 2, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  let logSetCalls = 0;
  const storage = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => {
      console.log(`  [storage] setItem ${key} = ${value.substring(0, 100)}`);
      storage.set(key, value);
    },
    removeItem: (key: string) => { storage.delete(key); },
  } as Storage;

  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      logSetCalls++;
      console.log(`  [logSet] Called (count=${logSetCalls})`);
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
      storage={fakeStorage}
    />,
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c1.textContent?.includes("Bench Press")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Log the 3rd (last) set
  const repsInput = [...c1.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  if (!repsInput) {
    console.log("  ✗ FAIL Reps input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput, { target: { value: "10" } });
  });

  const logBtn = [...c1.querySelectorAll("button")].find((b) =>
    /Log set 3/.test(b.textContent ?? ""),
  );

  if (!logBtn) {
    console.log("  ✗ FAIL Log set button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(logBtn);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  check("Logged set 3 (expired)", logSetCalls === 1);

  // Tap "Easy" feel button
  const easyButton = [...c1.querySelectorAll("button")].find((b) =>
    /Easy/.test(b.textContent ?? ""),
  );

  if (!easyButton) {
    console.log("  ✗ FAIL Easy button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(easyButton);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  check("Tapped Easy feel button", logSetCalls === 2);

  // Exactly ONE expired prompt should be visible
  const expiredPrompts = (c1.textContent?.match(/session has expired/gi) || []).length;
  check(`Exactly 1 expired prompt visible`, expiredPrompts === 1, `found ${expiredPrompts}`);

  unmount1();

  // ===== Test 2: After restore + successful Retry, no expired prompt =====
  console.log("\n=== Test 2: Restore + successful Retry clears expired prompt ===\n");

  const exercise2 = makeExercise("ex-2", "squat", "Squat", 1);

  let expired = true;
  const actions2: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
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
      storage={fakeStorage}
    />,
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c2.textContent?.includes("Squat")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Log first set while expired
  const repsInput2 = [...c2.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  if (!repsInput2) {
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  check("Logged set while expired", (c2.textContent?.match(/session has expired/gi) || []).length > 0);

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
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  const expiredPromptsAfterRetry = (c2.textContent?.match(/session has expired/gi) || []).length;
  check("No expired prompt remains after successful retry", expiredPromptsAfterRetry === 0, `found ${expiredPromptsAfterRetry}`);

  unmount2();

  console.log("\n✅ All L1 tests passed\n");
  process.exit(0);
})();
