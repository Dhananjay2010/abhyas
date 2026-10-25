#!/usr/bin/env tsx
/**
 * Test swap sheet close on exercise change (LOW): ensures the swap sheet
 * closes and resets when the current exercise changes.
 * 
 * This test verifies that the alternatives state is cleared when switching
 * between exercises.
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
  sets: any[] = [],
): RunnerExercise {
  return {
    id,
    exerciseId,
    name,
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 1,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status: sets.length >= 1 ? "completed" : "pending",
    feel: sets.length >= 1 ? "right" : null,
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
};

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("Test swap sheet close on exercise change:\n");

(async () => {
  console.log("Case 1: Swap sheet with pending alternatives gets cleared when re-rendering");

  const exerciseA = makeExercise("ex-a", "vertical-press", "Military Press");
  const exerciseB = makeExercise("ex-b", "horizontal-pull", "Bent Over Barbell Row");

  const alternativesA = [
    { exerciseId: "shoulder-press", name: "Shoulder Press", cue: null, metric: "reps" as const },
  ];

  const alternativesB = [
    { exerciseId: "pendlay-row", name: "Pendlay Row", cue: null, metric: "reps" as const },
  ];

  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => {
      // Return success to advance
      return { ok: true as const };
    },
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => ({
      ok: true as const,
      data: {
        metric: "reps" as const,
        repsMin: 8,
        repsMax: 12,
        equipmentIds: ["barbell"],
        weightPrefill: null,
        workingWeightKg: null,
        isBodyweight: false,
      },
    }),
    findAlternatives: async (sessionExerciseId: string) => {
      if (sessionExerciseId === "ex-a") {
        return { ok: true as const, data: alternativesA };
      } else if (sessionExerciseId === "ex-b") {
        return { ok: true as const, data: alternativesB };
      }
      return { ok: true as const, data: [] };
    },
  } as unknown as SessionActions;

  const { rerender, container, unmount } = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exerciseA, exerciseB]}
      settings={settings}
      actions={actions}
    />,
  );

  // Wait for initial render
  await waitFor(() => {
    if (!container.textContent?.includes("Military Press")) {
      throw new Error("Exercise A not shown");
    }
  });

  check("Initial render: Exercise A (Military Press) shown", true);

  // Open swap sheet for exercise A
  let swapBtn = [...container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );

  if (swapBtn) {
    await act(async () => {
      fireEvent.click(swapBtn);
    });

    // Wait for alternatives to load
    await waitFor(() => {
      if (!container.textContent?.includes("Shoulder Press")) {
        throw new Error("Alternatives not shown");
      }
    });

    check("Swap sheet opened with exercise A alternatives", true);
  }

  // Now rerender with exercise A completed and exercise B as current
  const exerciseACompleted = makeExercise("ex-a", "vertical-press", "Military Press", [
    { setNumber: 1, reps: 10, weightKg: 50, durationSeconds: null },
  ]);

  await act(async () => {
    rerender(
      <SessionRunner
        sessionId="s1"
        isDeload={false}
        week={1}
        warmupAlreadyDone={true}
        startedAt={new Date().toISOString()}
        warmup={[]}
        cooldown={[]}
        exercises={[exerciseACompleted, exerciseB]}
        settings={settings}
        actions={actions}
      />,
    );
  });

  // Wait for exercise B to render
  await waitFor(() => {
    if (!container.textContent?.includes("Bent Over Barbell Row")) {
      throw new Error("Exercise B not shown");
    }
  });

  check("After completing A, now on exercise B", true);

  // The fix: alternatives from A should NOT be visible on B
  const hasShoulderPress = container.textContent?.includes("Shoulder Press");
  check(
    "Exercise A alternatives cleared (Shoulder Press not visible)",
    !hasShoulderPress,
    hasShoulderPress ? "FAILED - still visible" : undefined,
  );

  // Verify we can open new alternatives for exercise B
  swapBtn = [...container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );

  if (swapBtn) {
    await act(async () => {
      fireEvent.click(swapBtn);
    });

    await waitFor(() => {
      if (!container.textContent?.includes("Pendlay Row")) {
        throw new Error("Exercise B alternatives not shown");
      }
    });

    check("New swap sheet shows exercise B alternatives (Pendlay Row)", true);
    check(
      "Exercise A alternatives still not visible",
      !container.textContent?.includes("Shoulder Press"),
    );
  }

  unmount();

  console.log("\n✅ All swap sheet close tests passed");
  console.log(
    "⚠️  This test MUST FAIL when the reset useEffect is removed (mutant test)\n",
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
