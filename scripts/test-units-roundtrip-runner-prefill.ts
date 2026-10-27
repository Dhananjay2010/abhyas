/**
 * Behavioral test for L-3: weightKgToSubmit preserves original kg when unchanged.
 * 
 * Tests the extracted weightKgToSubmit function used by SetEntry:
 * - Unedited prefill returns original kg
 * - Edited value converts normally
 * - Edit back to same string still returns original kg
 * - Empty returns null
 * - Metric works correctly
 */

import "./helpers/setup-jsdom";
import { render, waitFor } from "@testing-library/react";
import { SessionRunner, type RunnerExercise, type SessionActions } from "../src/app/session/[id]/session-runner";
import { weightKgToSubmit, computeRunnerWeightPrefill, formatTopSet, snapPrescribedWeight } from "../src/lib/units";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

console.log("=== Test weightKgToSubmit (L-3 fix) ===\n");

// Test case 1: Unedited prefill preserves original kg (72.5 kg case)
const originalKg1 = 72.5;
const prefill1 = computeRunnerWeightPrefill(originalKg1, "imperial", false);
const result1 = weightKgToSubmit(prefill1, prefill1, originalKg1, "imperial");

check(
  "72.5 kg: unedited prefill returns original 72.5 kg",
  result1 === originalKg1,
  `prefill="${prefill1}", got ${result1} kg`
);

// Test case 2: Edited value converts normally
const result2 = weightKgToSubmit("165", prefill1, originalKg1, "imperial");
check(
  "72.5 kg: editing to 165 lb converts normally",
  result2 !== null && Math.abs(result2 - 74.84) < 0.1,
  `got ${result2} kg`
);

// Test case 3: Edit back to same string returns original (not converted)
const editedBack = weightKgToSubmit(prefill1, prefill1, originalKg1, "imperial");
check(
  "72.5 kg: edit back to same string returns original",
  editedBack === originalKg1,
  `got ${editedBack} kg`
);

// Test case 4: Empty returns null
const result4 = weightKgToSubmit("", prefill1, originalKg1, "imperial");
check(
  "Empty weight returns null",
  result4 === null,
  `got ${result4}`
);

// Test case 5: Metric unedited prefill
const originalKg5 = 80;
const prefill5 = computeRunnerWeightPrefill(originalKg5, "metric", false);
const result5 = weightKgToSubmit(prefill5, prefill5, originalKg5, "metric");

check(
  "80 kg metric: unedited prefill returns original",
  result5 === originalKg5,
  `prefill="${prefill5}", got ${result5} kg`
);

// Test case 6: Metric edited value
const result6 = weightKgToSubmit("85", prefill5, originalKg5, "metric");
check(
  "80 kg metric: editing to 85 converts normally",
  result6 === 85,
  `got ${result6} kg`
);

// Test case 7: No defaultWeight (first set)
const prefill7 = "";
const result7 = weightKgToSubmit("135", prefill7, null, "imperial");
check(
  "No defaultWeight: converts normally",
  result7 !== null && Math.abs(result7 - 61.23) < 0.1,
  `got ${result7} kg`
);

// Test case 8: 85 kg case (rounds vs floors)
const originalKg8 = 85;
const prefill8 = computeRunnerWeightPrefill(originalKg8, "imperial", false);
const result8 = weightKgToSubmit(prefill8, prefill8, originalKg8, "imperial");

check(
  "85 kg: unedited prefill returns original 85 kg",
  result8 === originalKg8,
  `prefill="${prefill8}", got ${result8} kg`
);

console.log("\n=== Test L-4a: Metric prefill matches formatLoad display ===\n");

// Test case 9: Metric weight with 2dp prefills exact value, submits original
const originalKg9 = 35.15;
const prefill9 = computeRunnerWeightPrefill(originalKg9, "metric", false);
const result9 = weightKgToSubmit(prefill9, prefill9, originalKg9, "metric");

check(
  "35.15 kg: prefills as 35.15 (2 decimal places)",
  prefill9 === "35.15",
  `got "${prefill9}"`
);

check(
  "35.15 kg: unedited prefill returns original 35.15 kg",
  result9 === originalKg9,
  `got ${result9} kg`
);

// Test case 10: On-grid 2-decimal metric weight stays as-is
const originalKg10 = 16.25;
const prefill10 = computeRunnerWeightPrefill(originalKg10, "metric", false);
const result10 = weightKgToSubmit(prefill10, prefill10, originalKg10, "metric");

check(
  "16.25 kg: prefills as 16.25 (on-grid, 2 decimals)",
  prefill10 === "16.25",
  `got "${prefill10}"`
);

check(
  "16.25 kg: unedited prefill returns original",
  result10 === originalKg10,
  `got ${result10} kg`
);

// Test case 11: On-grid 1-decimal metric weight (trailing zero trimmed)
const originalKg11 = 72.5;
const prefill11 = computeRunnerWeightPrefill(originalKg11, "metric", false);
const result11 = weightKgToSubmit(prefill11, prefill11, originalKg11, "metric");

check(
  "72.5 kg: prefills as 72.5 (on-grid, trailing zero trimmed)",
  prefill11 === "72.5",
  `got "${prefill11}"`
);

check(
  "72.5 kg: unedited prefill returns original",
  result11 === originalKg11,
  `got ${result11} kg`
);

console.log("\n=== Test Rounding Rule: Stored weights round to nearest, targets floor ===\n");

// Test (a) and (b): Runner prefill equals History display for stored kg values
const storedWeights = [
  { kg: 72.5, expectedLb: "160" },
  { kg: 85, expectedLb: "187.5" },
  { kg: 90, expectedLb: "198.5" },
  { kg: 60, expectedLb: "132.5" },
  { kg: 77.5, expectedLb: "171" },
];

for (const { kg, expectedLb } of storedWeights) {
  const runnerPrefill = computeRunnerWeightPrefill(kg, "imperial", false);
  const historyDisplay = formatTopSet(kg, "imperial");
  
  check(
    `${kg} kg: runner prefill "${runnerPrefill}" matches expected ${expectedLb} lb`,
    runnerPrefill === expectedLb,
    `expected "${expectedLb}", got "${runnerPrefill}"`
  );
  
  check(
    `${kg} kg: runner prefill equals History display`,
    historyDisplay.includes(runnerPrefill),
    `runner="${runnerPrefill}", history="${historyDisplay}"`
  );
  
  if (kg === 72.5) {
    check(
      `72.5 kg: shows 160 lb in both runner and History`,
      runnerPrefill === "160" && historyDisplay === "160 lb top",
      `runner="${runnerPrefill}", history="${historyDisplay}"`
    );
  }
}

// Test (c): Real SessionRunner renders floored prescriptions (62.5 kg → 137.5 lb, 100 kg → 220 lb)
console.log("\nTest (c): Real SessionRunner prescription flooring");
(async () => {
  for (const testCase of [
    { kg: 62.5, expectedLb: "137.5" },
    { kg: 100, expectedLb: "220" },
  ]) {
    const actions: SessionActions = {
      markWarmupDone: async () => ({ ok: true }),
      logSet: async () => ({ ok: true as const }),
      deleteSet: async () => ({ ok: true as const }),
      finishExercise: async () => ({
        ok: true as const,
        data: { outcome: "hold", message: "", personalBest: null },
      }),
      finishSession: async () => ({
        ok: true as const,
        data: { status: "completed" as const, durationSeconds: null },
      }),
      abandonSession: async () => ({ ok: true as const }),
      planDay: async () => ({ ok: true as const }),
      refreshAfterSession: async () => ({ ok: true as const }),
      swapExercise: async () => ({ 
        ok: true, 
        data: { 
          workoutSessionExerciseId: "", 
          exerciseId: "",
          metric: "reps" as const,
          repsMin: null,
          repsMax: null,
          equipmentIds: [],
          weightPrefill: null,
          workingWeightKg: null,
          currentTargetReps: null,
          isBodyweight: false,
        } 
      }),
      findAlternatives: async () => ({ ok: true as const, data: [] }),
      getSessionSummary: async () => ({ ok: true as const, data: [] }),
    };

    const settings = {
      perSetLogging: true,
      restAutostart: false,
      restSound: false,
      restVibrate: false,
      restOverrideSeconds: null,
      cooldownEnabled: false,
      units: "imperial" as const,
    };

    const exercise: RunnerExercise = {
      id: "ex1",
      exerciseId: "test",
      name: "Test",
      cue: null,
      metric: "reps",
      primaryMuscles: [],
      plannedSets: 3,
      plannedRepsMin: 6,
      plannedRepsMax: 8,
      repsMin: 6,
      repsMax: 8,
      restSeconds: 180,
      workingWeightKg: testCase.kg,
      suggestedWeightKg: testCase.kg,
      status: "pending",
      feel: null,
      sets: [],
      isBodyweight: false,
    };

    const r = render(
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

    await waitFor(() => {
      const workingWeightLine = r.container.querySelector("[data-testid='working-weight-line']");
      if (!workingWeightLine) throw new Error("Working weight line not found");
    }, { timeout: 5000 });

    const workingWeightLine = r.container.querySelector<HTMLElement>("[data-testid='working-weight-line']");
    const workingWeightText = workingWeightLine?.textContent || "";
    check(
      `SessionRunner: ${testCase.kg} kg → ${testCase.expectedLb} lb (floored)`,
      workingWeightText.includes(`${testCase.expectedLb} lb`),
      `found: "${workingWeightText}"`
    );

    const weightInput = [...r.container.querySelectorAll<HTMLInputElement>("input")].find(
      (i) => i.closest("label")?.textContent?.match(/Weight \(lb\)|Weight \(kg\)|Added weight/)
    );
    
    check(
      `SessionRunner prefill: ${testCase.kg} kg → ${testCase.expectedLb} lb`,
      weightInput?.value === testCase.expectedLb,
      `got "${weightInput?.value}"`
    );

    r.unmount();
  }
})().catch(e => { console.error(e); process.exit(1); });

// Test (d): Unedited prefill submits original kg (already covered above, verify once more)
const testKg = 72.5;
const testPrefill = computeRunnerWeightPrefill(testKg, "imperial", false);
const testResult = weightKgToSubmit(testPrefill, testPrefill, testKg, "imperial");
check(
  "Rounding rule: unedited prefill still submits original kg exactly",
  testResult === testKg,
  `prefill="${testPrefill}", submitted ${testResult} kg (original ${testKg} kg)`
);

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
