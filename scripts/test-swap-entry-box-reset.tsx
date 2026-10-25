#!/usr/bin/env tsx
/**
 * Test swap entry box reset (HIGH-1): ensures weight field resets on swap.
 * Renders the REAL SessionRunner and drives actual swaps through the UI.
 * 
 * This test must FAIL on head 493710f5 (before the fix) and PASS after.
 */

import "./helpers/setup-jsdom";
import { render, waitFor, act, fireEvent } from "@testing-library/react";
import {
  SessionRunner,
  type RunnerExercise,
  type SessionActions,
} from "../src/app/session/[id]/session-runner";

const ok = async () => ({ ok: true }) as const;

function makeActions(
  swapName: string,
  swapExerciseId: string,
  metric: "reps" | "time" | "distance",
  repsMin: number | null,
  repsMax: number | null,
  weightPrefill: number | null,
  workingWeightKg: number | null,
  isBodyweight: boolean,
): SessionActions {
  return {
    markWarmupDone: ok,
    logSet: ok,
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
        metric,
        repsMin,
        repsMax,
        equipmentIds: ["dumbbell"],
        weightPrefill,
        workingWeightKg,
        isBodyweight,
      },
    }),
    findAlternatives: async () => ({
      ok: true as const,
      data: [
        {
          exerciseId: swapExerciseId,
          name: swapName,
          cue: null,
          metric,
        },
      ],
    }),
  } as unknown as SessionActions;
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

async function testSwapScenario(
  label: string,
  initialExercise: RunnerExercise,
  actions: SessionActions,
  swapExerciseName: string,
  expectedInput: string,
  expectedHeaderMatch: string | null,
  isBodyweightAfterSwap: boolean,
) {
  console.log(`\n${label}:`);
  const r = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[{ ...initialExercise }]}
      settings={settings}
      actions={actions}
    />,
  );

  const weightInput = () =>
    [...r.container.querySelectorAll("input")].find((i) =>
      (i.closest("label")?.textContent ?? "").match(/Weight \(kg\)|Added weight/),
    ) as HTMLInputElement | undefined;

  await waitFor(() => {
    if (!weightInput()) throw new Error("no weight input");
  });

  const swapBtn = [...r.container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );
  if (!swapBtn) throw new Error("Swap button not found");

  await act(async () => {
    fireEvent.click(swapBtn);
  });

  await waitFor(() => {
    if (
      ![...r.container.querySelectorAll("button")].some((b) =>
        new RegExp(swapExerciseName).test(b.textContent ?? ""),
      )
    )
      throw new Error("alternative not shown");
  });

  const alt = [...r.container.querySelectorAll("button")].find((b) =>
    new RegExp(swapExerciseName).test(b.textContent ?? ""),
  );
  if (!alt) throw new Error("Alternative button not found");

  await act(async () => {
    fireEvent.click(alt);
  });

  await waitFor(() => {
    if (!new RegExp(swapExerciseName).test(r.container.textContent ?? ""))
      throw new Error("not swapped");
  });

  const actualInput = weightInput()?.value ?? "";
  check(`Input value is "${expectedInput}"`, actualInput === expectedInput);

  const text = r.container.textContent ?? "";
  if (expectedHeaderMatch === null) {
    check("No 'Working weight' line present", !text.includes("Working weight"));
  } else {
    const headerMatch = text.match(/Working weight[^·]*?kg( · today [0-9.]+ kg)?/)?.[0];
    check(
      `Header matches "${expectedHeaderMatch}"`,
      headerMatch === expectedHeaderMatch,
      headerMatch ? `got: "${headerMatch}"` : "not found",
    );
  }

  if (isBodyweightAfterSwap) {
    check("Bodyweight label visible", text.includes("Added weight"));
  }

  r.unmount();
}

async function testUserTypeSurvival() {
  console.log("\nCase 5: User-typed value survives re-render");
  const initialEx: RunnerExercise = {
    id: "e5",
    exerciseId: "ex5",
    name: "Initial Exercise",
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 50,
    suggestedWeightKg: 50,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const actions = makeActions(
    "Swapped Exercise",
    "swapped-ex",
    "reps",
    8,
    12,
    60,
    60,
    false,
  );

  const r = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[{ ...initialEx }]}
      settings={settings}
      actions={actions}
    />,
  );

  const weightInput = () =>
    [...r.container.querySelectorAll("input")].find((i) =>
      (i.closest("label")?.textContent ?? "").match(/Weight \(kg\)|Added weight/),
    ) as HTMLInputElement | undefined;

  await waitFor(() => {
    if (!weightInput()) throw new Error("no weight input");
  });

  const swapBtn = [...r.container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );
  if (!swapBtn) throw new Error("Swap button not found");

  await act(async () => {
    fireEvent.click(swapBtn);
  });

  await waitFor(() => {
    if (
      ![...r.container.querySelectorAll("button")].some((b) =>
        /Swapped Exercise/.test(b.textContent ?? ""),
      )
    )
      throw new Error("alternative not shown");
  });

  const alt = [...r.container.querySelectorAll("button")].find((b) =>
    /Swapped Exercise/.test(b.textContent ?? ""),
  );
  if (!alt) throw new Error("Alternative button not found");

  await act(async () => {
    fireEvent.click(alt);
  });

  await waitFor(() => {
    if (!/Swapped Exercise/.test(r.container.textContent ?? ""))
      throw new Error("not swapped");
  });

  await act(async () => {
    fireEvent.change(weightInput()!, { target: { value: "75.5" } });
  });

  const valueBefore = weightInput()?.value;
  check("User typed 75.5", valueBefore === "75.5");

  r.rerender(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          ...initialEx,
          exerciseId: "swapped-ex",
          name: "Swapped Exercise",
          suggestedWeightKg: 60,
          workingWeightKg: 60,
        },
      ]}
      settings={settings}
      actions={actions}
    />,
  );

  const valueAfter = weightInput()?.value;
  check("Typed value survives re-render", valueAfter === "75.5");

  r.unmount();
}

console.log("Test swap entry box reset (HIGH-1):\n");

(async () => {
  // Case 1: Military Press 42.5 → Barbell Shoulder Press (never done)
  const case1: RunnerExercise = {
    id: "se1",
    exerciseId: "military-press-id",
    name: "Military Press",
    cue: null,
    metric: "reps",
    primaryMuscles: ["front_delts"],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 42.5,
    suggestedWeightKg: 42.5,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };
  await testSwapScenario(
    "Case 1: Military Press 42.5 → Barbell Shoulder Press (never done)",
    case1,
    makeActions("Barbell Shoulder Press", "barbell-shoulder-press-id", "reps", 8, 12, null, null, false),
    "Barbell Shoulder Press",
    "",
    null,
    false,
  );

  // Case 2: Wide-Grip Lat Pulldown 52.5 → Underhand Cable Pulldowns (never done)
  const case2: RunnerExercise = {
    id: "se2",
    exerciseId: "wide-grip-lat-id",
    name: "Wide-Grip Lat Pulldown",
    cue: null,
    metric: "reps",
    primaryMuscles: ["lats"],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 52.5,
    suggestedWeightKg: 52.5,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };
  await testSwapScenario(
    "Case 2: Wide-Grip Lat Pulldown 52.5 → Underhand Cable Pulldowns (never done)",
    case2,
    makeActions("Underhand Cable Pulldowns", "underhand-cable-id", "reps", 8, 12, null, null, false),
    "Underhand Cable Pulldowns",
    "",
    null,
    false,
  );

  // Case 3: Body Tricep Press 41.25 → Body-Up (never done, bodyweight)
  const case3: RunnerExercise = {
    id: "se3",
    exerciseId: "body-tricep-press-id",
    name: "Body Tricep Press",
    cue: null,
    metric: "reps",
    primaryMuscles: ["triceps"],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 41.25,
    suggestedWeightKg: 41.25,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };
  await testSwapScenario(
    "Case 3: Body Tricep Press 41.25 → Body-Up (never done, bodyweight)",
    case3,
    makeActions("Body-Up", "body-up-id", "reps", 8, 12, null, null, true),
    "Body-Up",
    "",
    null,
    true,
  );

  // Case 4: Deload - Standing Military Press 30 → Barbell Shoulder Press (ww 47.5, today 32.5)
  const case4: RunnerExercise = {
    id: "se4",
    exerciseId: "standing-military-id",
    name: "Standing Military Press",
    cue: null,
    metric: "reps",
    primaryMuscles: ["front_delts"],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 30,
    suggestedWeightKg: 30,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const case4Actions = makeActions(
    "Barbell Shoulder Press",
    "barbell-shoulder-press-id",
    "reps",
    8,
    12,
    32.5,
    47.5,
    false,
  );

  const r = render(
    <SessionRunner
      sessionId="s1"
      isDeload={true}
      week={4}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[{ ...case4 }]}
      settings={settings}
      actions={case4Actions}
    />,
  );

  console.log("\nCase 4: Deload - Standing Military Press 30 → Barbell Shoulder Press (ww 47.5, today 32.5):");

  const weightInput = () =>
    [...r.container.querySelectorAll("input")].find((i) =>
      (i.closest("label")?.textContent ?? "").match(/Weight \(kg\)|Added weight/),
    ) as HTMLInputElement | undefined;

  await waitFor(() => {
    if (!weightInput()) throw new Error("no weight input");
  });

  const swapBtn = [...r.container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );
  if (!swapBtn) throw new Error("Swap button not found");

  await act(async () => {
    fireEvent.click(swapBtn);
  });

  await waitFor(() => {
    if (
      ![...r.container.querySelectorAll("button")].some((b) =>
        /Barbell Shoulder Press/.test(b.textContent ?? ""),
      )
    )
      throw new Error("alternative not shown");
  });

  const alt = [...r.container.querySelectorAll("button")].find((b) =>
    /Barbell Shoulder Press/.test(b.textContent ?? ""),
  );
  if (!alt) throw new Error("Alternative button not found");

  await act(async () => {
    fireEvent.click(alt);
  });

  await waitFor(() => {
    if (!/Barbell Shoulder Press/.test(r.container.textContent ?? ""))
      throw new Error("not swapped");
  });

  const actualInput = weightInput()?.value ?? "";
  check(`Input value is "32.5"`, actualInput === "32.5");

  const text = r.container.textContent ?? "";
  const headerMatch = text.match(/Working weight 47\.5 kg · today 32\.5 kg/)?.[0];
  check(
    'Header shows "Working weight 47.5 kg · today 32.5 kg"',
    headerMatch !== undefined,
    headerMatch ? `got: "${headerMatch}"` : "not found",
  );

  r.unmount();

  // Case 5: User-typed value survives re-render
  await testUserTypeSurvival();

  // Case 6: Value typed BEFORE swap is DISCARDED (coordinator requirement)
  console.log("\nCase 6: Value typed BEFORE swap is discarded");

  const case6: RunnerExercise = {
    id: "se6",
    exerciseId: "old-exercise-id",
    name: "Old Exercise",
    cue: null,
    metric: "reps",
    primaryMuscles: ["chest"],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    restSeconds: 60,
    workingWeightKg: 40,
    suggestedWeightKg: 40,
    status: "pending",
    feel: null,
    sets: [],
    isBodyweight: false,
  };

  const case6Actions = makeActions(
    "New Exercise",
    "new-exercise-id",
    "reps",
    8,
    12,
    24.5, // Prefill for new exercise
    50, // Working weight for new exercise
    false,
  );

  const r6 = render(
    <SessionRunner
      sessionId="s1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[{ ...case6 }]}
      settings={settings}
      actions={case6Actions}
    />,
  );

  const weightInput6 = () =>
    [...r6.container.querySelectorAll("input")].find((i) =>
      (i.closest("label")?.textContent ?? "").match(/Weight \(kg\)|Added weight/),
    ) as HTMLInputElement | undefined;

  await waitFor(() => {
    if (!weightInput6()) throw new Error("no weight input");
  });

  // Type 50 into the OLD exercise's box
  await act(async () => {
    fireEvent.change(weightInput6()!, { target: { value: "50" } });
  });

  check("User typed 50 before swap", weightInput6()?.value === "50");

  // Now swap to new exercise
  const swapBtn6 = [...r6.container.querySelectorAll("button")].find((b) =>
    /Swap this exercise/.test(b.textContent ?? ""),
  );
  if (!swapBtn6) throw new Error("Swap button not found");

  await act(async () => {
    fireEvent.click(swapBtn6);
  });

  await waitFor(() => {
    if (
      ![...r6.container.querySelectorAll("button")].some((b) =>
        /New Exercise/.test(b.textContent ?? ""),
      )
    )
      throw new Error("alternative not shown");
  });

  const alt6 = [...r6.container.querySelectorAll("button")].find((b) =>
    /New Exercise/.test(b.textContent ?? ""),
  );
  if (!alt6) throw new Error("Alternative button not found");

  await act(async () => {
    fireEvent.click(alt6);
  });

  await waitFor(() => {
    if (!/New Exercise/.test(r6.container.textContent ?? ""))
      throw new Error("not swapped");
  });

  // The box should show the NEW exercise's prefill (24.5), NOT the typed 50
  const finalValue = weightInput6()?.value ?? "";
  check(
    "Pre-swap typed value discarded, shows new prefill",
    finalValue === "24.5",
    `got "${finalValue}", not "50"`,
  );

  const text6 = r6.container.textContent ?? "";
  const header6Match = text6.match(/Working weight 50 kg · today 24\.5 kg/)?.[0];
  check(
    'Header shows new exercise working weight',
    header6Match !== undefined,
    header6Match ? `got: "${header6Match}"` : "not found",
  );

  r6.unmount();

  console.log("\n✅ All entry box swap tests passed");
  console.log(
    "\n⚠️  This test MUST FAIL on 493710f5 (old key format) and PASS after the fix.\n",
  );
  console.log("🔑 Key includes exerciseId, so pre-swap typed values are discarded\n");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
