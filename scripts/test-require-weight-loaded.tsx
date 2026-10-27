#!/usr/bin/env tsx
/**
 * Test: Require weight on loaded exercises (Item 8)
 * 
 * After swapping to a lift with no weight memory (Barbell Incline Bench Press),
 * a set with reps and a blank weight was accepted. For loaded (non-bodyweight)
 * exercises, block Log set while weight is blank, with a friendly inline message
 * such as "Add the weight you used."
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
  isBodyweight: boolean,
  isTimed: boolean = false,
  sets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSeconds: number | null }> = [],
): RunnerExercise {
  return {
    id,
    exerciseId,
    name,
    cue: null,
    metric: isTimed ? "seconds" : "reps",
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
    isBodyweight,
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

console.log("\n📋 Test: Require weight on loaded exercises (Item 8)\n");

(async () => {
  // ===== Test 1: Loaded exercise with blank weight is blocked =====
  console.log("=== Test 1: Loaded exercise with blank weight is blocked ===\n");

  const exercise1 = makeExercise("ex-1", "bench-press", "Barbell Bench Press", 3, false);

  const loggedSets: Array<{ exerciseId: string; setNumber: number; weightKg: number | null }> = [];

  const actions1: SessionActions = {
    markWarmupDone: ok,
    logSet: async (input) => {
      loggedSets.push({
        exerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        weightKg: input.weightKg,
      });
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

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c1.textContent?.includes("Barbell Bench Press")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Make sure weight starts empty
  const weightInput = [...c1.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("kg"),
  ) as HTMLInputElement | undefined;

  if (weightInput && weightInput.value) {
    await act(async () => {
      fireEvent.change(weightInput, { target: { value: "" } });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  }

  // Enter reps but leave weight blank
  const repsInput = [...c1.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  if (!repsInput) {
    console.log("  ✗ FAIL Reps input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput, { target: { value: "10" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  await waitFor(() => {
    const hasErrorMessage = c1.textContent?.includes("Add the weight you used");
    if (!hasErrorMessage) throw new Error("Waiting for error message");
  });

  check("Shows 'Add the weight you used' message", true);

  // Log button should not log the set (blocked)
  const logBtn = [...c1.querySelectorAll("button")].find((b) =>
    /Log set 1/.test(b.textContent ?? ""),
  );

  if (logBtn && !(logBtn as HTMLButtonElement).disabled) {
    await act(async () => {
      fireEvent.click(logBtn);
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
  }

  check("Set was NOT logged (blank weight blocked)", loggedSets.length === 0);

  unmount1();
  console.log("✓ Test 1 passed\n");

  // ===== Test 2: Loaded exercise with weight logs successfully =====
  console.log("=== Test 2: Loaded exercise with weight logs successfully ===\n");

  const exercise2 = makeExercise("ex-2", "squat", "Barbell Squat", 1, false);
  loggedSets.length = 0;

  const actions2: SessionActions = {
    ...actions1,
    logSet: async (input) => {
      loggedSets.push({
        exerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        weightKg: input.weightKg,
      });
      return { ok: true };
    },
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

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c2.textContent?.includes("Barbell Squat")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Enter both reps and weight
  const repsInput2 = [...c2.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  const weightInput2 = [...c2.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("kg"),
  ) as HTMLInputElement | undefined;

  if (!repsInput2 || !weightInput2) {
    console.log("  ✗ FAIL Input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput2, { target: { value: "10" } });
    fireEvent.change(weightInput2, { target: { value: "50" } });
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

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

  await waitFor(() => {
    if (loggedSets.length === 0) throw new Error("Waiting for set to log");
  }, { timeout: 3000 });

  check("Set was logged with weight", loggedSets.length === 1);
  check("Weight logged correctly", loggedSets[0].weightKg === 50);

  unmount2();
  console.log("✓ Test 2 passed\n");

  // ===== Test 3: Bodyweight exercise with blank weight logs =====
  console.log("=== Test 3: Bodyweight exercise with blank weight logs ===\n");

  const exercise3 = makeExercise("ex-3", "pushups", "Push-ups", 1, true);
  loggedSets.length = 0;

  const actions3: SessionActions = {
    ...actions1,
    logSet: async (input) => {
      loggedSets.push({
        exerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        weightKg: input.weightKg,
      });
      return { ok: true };
    },
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

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c3.textContent?.includes("Push-ups")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Enter reps only (bodyweight doesn't require weight)
  const repsInput3 = [...c3.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  if (!repsInput3) {
    console.log("  ✗ FAIL Reps input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput3, { target: { value: "12" } });
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  const logBtn3 = [...c3.querySelectorAll("button")].find((b) =>
    /Log set 1/.test(b.textContent ?? ""),
  );

  if (!logBtn3) {
    console.log("  ✗ FAIL Log set button not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.click(logBtn3);
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  check("Bodyweight set was logged", loggedSets.length === 1);
  check("Weight is null for bodyweight", loggedSets[0].weightKg === null);

  unmount3();
  console.log("✓ Test 3 passed\n");

  // ===== Test 4: Imperial units - loaded exercise blocked =====
  console.log("=== Test 4: Imperial units - loaded exercise blocked ===\n");

  const exercise4 = makeExercise("ex-4", "deadlift", "Barbell Deadlift", 1, false);
  loggedSets.length = 0;

  const imperialSettings = { ...settings, units: "imperial" as const };

  const { container: c4, unmount: unmount4 } = render(
    <SessionRunner
      sessionId="s4"
      sessionStatus="in_progress"
      userId="test-user-4"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise4]}
      settings={imperialSettings}
      actions={actions1}
    />,
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c4.textContent?.includes("Barbell Deadlift")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Enter reps but leave weight blank
  const repsInput4 = [...c4.querySelectorAll("input")].find((input) =>
    input.closest("label")?.textContent?.includes("Reps"),
  ) as HTMLInputElement | undefined;

  if (!repsInput4) {
    console.log("  ✗ FAIL Reps input not found");
    process.exit(1);
  }

  await act(async () => {
    fireEvent.change(repsInput4, { target: { value: "5" } });
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  // Check for error message (imperial should show same message)
  const hasErrorMessage4 = c4.textContent?.includes("Add the weight you used");
  check("Shows error message for imperial units", !!hasErrorMessage4);

  unmount4();
  console.log("✓ Test 4 passed\n");

  // ===== Test 5: Timed exercise (holds) with blank weight logs =====
  console.log("=== Test 5: Timed exercise (holds) with blank weight logs ===\n");

  const exercise5 = makeExercise("ex-5", "plank", "Plank", 1, false, true);
  loggedSets.length = 0;

  const { container: c5, unmount: unmount5 } = render(
    <SessionRunner
      sessionId="s5"
      sessionStatus="in_progress"
      userId="test-user-5"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      isStale={false}
      warmup={[]}
      cooldown={[]}
      exercises={[exercise5]}
      settings={settings}
      actions={actions1}
    />,
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  await waitFor(() => {
    if (!c5.textContent?.includes("Plank")) throw new Error("Exercise not shown");
  });

  check("Exercise loaded", true);

  // Timed exercises should have Start hold button, not blocked by weight
  const startHoldBtn = [...c5.querySelectorAll("button")].find((b) =>
    /Start hold/.test(b.textContent ?? ""),
  );

  check("Start hold button exists for timed exercise", !!startHoldBtn);

  if (startHoldBtn) {
    check("Start hold button is enabled without weight", !(startHoldBtn as HTMLButtonElement).disabled);
  }

  unmount5();
  console.log("✓ Test 5 passed\n");

  console.log("\n✅ All Item 8 tests passed\n");
  process.exit(0);
})();
