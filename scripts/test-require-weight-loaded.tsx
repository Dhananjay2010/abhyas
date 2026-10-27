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
import { render, act, screen, cleanup } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner.tsx";
import type { SessionActions } from "../src/app/session/[id]/session-runner.tsx";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

(async () => {
  console.log("\n📋 Test: Require weight on loaded exercises (Item 8)\n");
  
  const loggedSets: Array<{ exerciseId: string; setNumber: number; reps: number | null; weightKg: number | null }> = [];
  
  const fakeActions: SessionActions = {
    markWarmupDone: async () => ({ ok: true }),
    logSet: async (input) => {
      loggedSets.push({
        exerciseId: input.sessionExerciseId,
        setNumber: input.setNumber,
        reps: input.reps,
        weightKg: input.weightKg
      });
      return { ok: true };
    },
    deleteSet: async () => ({ ok: true }),
    finishExercise: async () => ({ ok: true }),
    finishSession: async () => ({ ok: true }),
    abandonSession: async () => ({ ok: true }),
    findAlternatives: async () => ({ ok: true, data: [] }),
    swapExercise: async () => ({ ok: true, data: { metric: "reps", plannedRepsMin: 8, plannedRepsMax: 12, repsMin: 8, repsMax: 12, currentTargetReps: 10, equipmentIds: [], weightPrefill: null, workingWeightKg: null, isBodyweight: false } }),
    refreshAfterSession: async () => {},
    planDay: async () => ({ ok: true, data: null }),
    getSessionSummary: async () => ({ ok: true, data: { notes: [], pbCount: 0, totalVolumeKg: 0 } }),
  };
  
  // ========================================================================
  // Test 1: Loaded exercise with blank weight is blocked
  // ========================================================================
  console.log("=== Test 1: Loaded exercise with blank weight is blocked ===\n");
  
  const { container: c1 } = render(
    <SessionRunner
      sessionId="s1"
      sessionStatus="in_progress"
      userId="u1"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          id: "ex1",
          exerciseId: "bench-press",
          name: "Barbell Bench Press",
          cue: null,
          metric: "reps",
          primaryMuscles: ["chest"],
          plannedSets: 3,
          plannedRepsMin: 8,
          plannedRepsMax: 12,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 180,
          workingWeightKg: null,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false
        }
      ]}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "metric"
      }}
      tomorrow={null}
      units="metric"
      actions={fakeActions}
    />
  );
  
  await act(async () => {});
  
  // Enter reps but leave weight blank
  const repsInput = c1.querySelector('input[placeholder="Reps"]') as HTMLInputElement;
  assert(repsInput !== null, "Reps input exists");
  
  await act(async () => {
    repsInput.value = "10";
    repsInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  
  await act(async () => {});
  
  // Try to find Log set button
  const logButton = screen.getByTestId("log-set-button");
  assert(logButton !== null, "Log set button exists");
  assert((logButton as HTMLButtonElement).disabled, "Log set button is disabled");
  
  // Check for error message
  const errorMessage = screen.queryByText(/Add the weight you used/i);
  assert(errorMessage !== null, "Shows 'Add the weight you used' message");
  
  cleanup();
  console.log("✓ Test 1 passed\n");
  
  // ========================================================================
  // Test 2: Loaded exercise with weight logs successfully
  // ========================================================================
  console.log("=== Test 2: Loaded exercise with weight logs successfully ===\n");
  
  loggedSets.length = 0;
  
  const { container: c2 } = render(
    <SessionRunner
      sessionId="s2"
      sessionStatus="in_progress"
      userId="u2"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          id: "ex2",
          exerciseId: "squat",
          name: "Barbell Squat",
          cue: null,
          metric: "reps",
          primaryMuscles: ["quads"],
          plannedSets: 3,
          plannedRepsMin: 8,
          plannedRepsMax: 12,
          repsMin: 8,
          repsMax: 12,
          restSeconds: 180,
          workingWeightKg: null,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false
        }
      ]}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "metric"
      }}
      tomorrow={null}
      units="metric"
      actions={fakeActions}
    />
  );
  
  await act(async () => {});
  
  // Enter both reps and weight
  const repsInput2 = c2.querySelector('input[placeholder="Reps"]') as HTMLInputElement;
  const weightInput2 = c2.querySelector('input[placeholder="kg"]') as HTMLInputElement;
  
  assert(repsInput2 !== null, "Reps input exists");
  assert(weightInput2 !== null, "Weight input exists");
  
  await act(async () => {
    repsInput2.value = "10";
    repsInput2.dispatchEvent(new Event("input", { bubbles: true }));
    weightInput2.value = "50";
    weightInput2.dispatchEvent(new Event("input", { bubbles: true }));
  });
  
  await act(async () => {});
  
  // Log set button should be enabled
  const logButton2 = screen.getByTestId("log-set-button");
  assert(!((logButton2 as HTMLButtonElement).disabled), "Log set button is enabled");
  
  // Click log set
  await act(async () => {
    logButton2.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(loggedSets.length === 1, "Set was logged");
  assert(loggedSets[0].reps === 10, "Reps logged correctly");
  assert(loggedSets[0].weightKg === 50, "Weight logged correctly");
  
  cleanup();
  console.log("✓ Test 2 passed\n");
  
  // ========================================================================
  // Test 3: Bodyweight exercise with blank weight logs successfully
  // ========================================================================
  console.log("=== Test 3: Bodyweight exercise with blank weight logs ===\n");
  
  loggedSets.length = 0;
  
  const { container: c3 } = render(
    <SessionRunner
      sessionId="s3"
      sessionStatus="in_progress"
      userId="u3"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          id: "ex3",
          exerciseId: "pushups",
          name: "Push-ups",
          cue: null,
          metric: "reps",
          primaryMuscles: ["chest"],
          plannedSets: 3,
          plannedRepsMin: 10,
          plannedRepsMax: 15,
          repsMin: 10,
          repsMax: 15,
          restSeconds: 90,
          workingWeightKg: null,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: true
        }
      ]}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "metric"
      }}
      tomorrow={null}
      units="metric"
      actions={fakeActions}
    />
  );
  
  await act(async () => {});
  
  // Enter reps only (no weight for bodyweight)
  const repsInput3 = c3.querySelector('input[placeholder="Reps"]') as HTMLInputElement;
  assert(repsInput3 !== null, "Reps input exists");
  
  await act(async () => {
    repsInput3.value = "12";
    repsInput3.dispatchEvent(new Event("input", { bubbles: true }));
  });
  
  await act(async () => {});
  
  // Log set button should be enabled for bodyweight
  const logButton3 = screen.getByTestId("log-set-button");
  assert(!((logButton3 as HTMLButtonElement).disabled), "Log set button is enabled for bodyweight");
  
  // Click log set
  await act(async () => {
    logButton3.click();
  });
  
  await act(async () => {});
  await act(async () => {});
  
  assert(loggedSets.length === 1, "Bodyweight set was logged");
  assert(loggedSets[0].reps === 12, "Reps logged correctly");
  assert(loggedSets[0].weightKg === null, "Weight is null for bodyweight");
  
  cleanup();
  console.log("✓ Test 3 passed\n");
  
  // ========================================================================
  // Test 4: Imperial units - loaded exercise with blank weight blocked
  // ========================================================================
  console.log("=== Test 4: Imperial units - loaded exercise blocked ===\n");
  
  loggedSets.length = 0;
  
  const { container: c4 } = render(
    <SessionRunner
      sessionId="s4"
      sessionStatus="in_progress"
      userId="u4"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          id: "ex4",
          exerciseId: "deadlift",
          name: "Barbell Deadlift",
          cue: null,
          metric: "reps",
          primaryMuscles: ["hamstrings"],
          plannedSets: 3,
          plannedRepsMin: 5,
          plannedRepsMax: 8,
          repsMin: 5,
          repsMax: 8,
          restSeconds: 240,
          workingWeightKg: null,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false
        }
      ]}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "imperial"
      }}
      tomorrow={null}
      units="imperial"
      actions={fakeActions}
    />
  );
  
  await act(async () => {});
  
  // Enter reps but leave weight blank
  const repsInput4 = c4.querySelector('input[placeholder="Reps"]') as HTMLInputElement;
  assert(repsInput4 !== null, "Reps input exists");
  
  await act(async () => {
    repsInput4.value = "5";
    repsInput4.dispatchEvent(new Event("input", { bubbles: true }));
  });
  
  await act(async () => {});
  
  // Log set button should be disabled
  const logButton4 = screen.getByTestId("log-set-button");
  assert((logButton4 as HTMLButtonElement).disabled, "Log set button is disabled for imperial");
  
  // Check for error message
  const errorMessage4 = screen.queryByText(/Add the weight you used/i);
  assert(errorMessage4 !== null, "Shows error message for imperial units");
  
  cleanup();
  console.log("✓ Test 4 passed\n");
  
  // ========================================================================
  // Test 5: Hold (timed exercise) doesn't require weight
  // ========================================================================
  console.log("=== Test 5: Hold (timed) doesn't require weight ===\n");
  
  loggedSets.length = 0;
  
  const { container: c5 } = render(
    <SessionRunner
      sessionId="s5"
      sessionStatus="in_progress"
      userId="u5"
      isDeload={false}
      week={1}
      warmupAlreadyDone={true}
      startedAt={new Date().toISOString()}
      warmup={[]}
      cooldown={[]}
      exercises={[
        {
          id: "ex5",
          exerciseId: "plank",
          name: "Plank",
          cue: null,
          metric: "seconds",
          primaryMuscles: ["core"],
          plannedSets: 3,
          plannedRepsMin: 30,
          plannedRepsMax: 60,
          repsMin: 30,
          repsMax: 60,
          restSeconds: 90,
          workingWeightKg: null,
          suggestedWeightKg: null,
          status: "pending",
          feel: null,
          sets: [],
          isBodyweight: false
        }
      ]}
      settings={{
        perSetLogging: true,
        restAutostart: true,
        restSound: false,
        restVibrate: false,
        restOverrideSeconds: null,
        cooldownEnabled: true,
        units: "metric"
      }}
      tomorrow={null}
      units="metric"
      actions={fakeActions}
    />
  );
  
  await act(async () => {});
  
  // Start hold button should exist (not blocked by weight requirement)
  const startHoldButton = screen.queryByText(/Start hold/i);
  assert(startHoldButton !== null, "Start hold button exists");
  assert(!(startHoldButton as HTMLButtonElement).disabled, "Start hold button is enabled without weight");
  
  cleanup();
  console.log("✓ Test 5 passed\n");
  
  console.log(`✅ Require weight on loaded exercises tests passed (${passed} assertions)\n`);
  process.exit(0);
})();
