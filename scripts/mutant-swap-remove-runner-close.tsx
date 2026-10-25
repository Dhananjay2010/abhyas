#!/usr/bin/env tsx
/**
 * MUTANT TEST: Remove the runner close-on-set-logged effect
 * 
 * This mutant removes the useEffect that closes the swap sheet when a set is logged.
 * Expected: The test should FAIL because the sheet stays open after logging a set.
 * 
 * DO NOT COMMIT THIS FILE.
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
};

console.log("MUTANT TEST: Remove runner close-on-set-logged effect\n");

(async () => {
  const alternatives = [
    { exerciseId: "shoulder-press", name: "Shoulder Press", cue: null, metric: "reps" as const },
  ];

  const exercise = makeExercise("ex-1", "military-press", "Military Press", 3);

  const actions: SessionActions = {
    markWarmupDone: ok,
    logSet: async () => ({ ok: true as const }),
    deleteSet: ok,
    finishExercise: async () =>
      ({ ok: true as const, data: { outcome: "hold", message: "", personalBest: null } }),
    finishSession: ok,
    abandonSession: ok,
    planDay: ok,
    refreshAfterSession: async () => ({ ok: true as const }),
    swapExercise: async () => {
      return {
        ok: true as const,
        data: {
          metric: "reps" as const,
          repsMin: 8,
          repsMax: 12,
          equipmentIds: ["barbell"],
          weightPrefill: null,
          workingWeightKg: null,
          currentTargetReps: null,
          isBodyweight: false,
        },
      };
    },
    findAlternatives: async () => ({ ok: true as const, data: alternatives }),
  } as unknown as SessionActions;

  const { container, unmount } = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise]}
      settings={settings}
      actions={actions}
    />,
  );

  await new Promise((resolve) => setTimeout(resolve, 4500));
  await waitFor(() => {
    if (!container.textContent?.includes("Military Press")) throw new Error("Exercise not shown");
  });

  const swapBtn = [...container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );
  
  await act(async () => {
    fireEvent.click(swapBtn!);
  });

  await waitFor(() => {
    if (!container.textContent?.includes("Shoulder Press")) throw new Error("Alternatives not shown");
  });

  console.log("  ✓ Sheet opened");

  // Log a set
  const repsInput = [...container.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement;

  await act(async () => {
    fireEvent.change(repsInput, { target: { value: "10" } });
  });

  const logBtn = [...container.querySelectorAll("button")].find((b) =>
    /Log set 1/.test(b.textContent ?? ""),
  );

  await act(async () => {
    fireEvent.click(logBtn!);
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  // Without the close effect, the sheet should still be visible
  const sheetStillVisible = container.textContent?.includes("Shoulder Press");
  
  if (sheetStillVisible) {
    console.log("  ✗ MUTANT SURVIVES: Sheet still visible after logging set");
    console.log("     This mutant should FAIL because the close-on-set effect is missing\n");
    unmount();
    process.exit(1);
  } else {
    console.log("  ✓ MUTANT KILLED: Sheet was closed (some other mechanism closed it)");
    console.log("     This is unexpected - the mutant should survive\n");
    unmount();
    process.exit(0);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
