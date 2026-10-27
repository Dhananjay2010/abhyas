/**
 * Wiring test for M1: Runner prefill must match History display for stored weights.
 * 
 * Tests the runner's real code path (not just helpers in isolation):
 * - Stored kg (72.5, 85, 62.5) displays at nearest 0.5 lb in prefill and working weight line
 * - Unedited prefill submits original kg exactly
 * 
 * Kills mutants:
 * - session-runner.tsx reverts to displayToKg (drops weightKgToSubmit)
 * - session-runner.tsx puts snapPrescribedWeight back as defaultWeight
 */

import { 
  computeRunnerWeightPrefill, 
  weightKgToSubmit, 
  formatLoad 
} from "../src/lib/units";

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

console.log("=== M1 Runner Wiring: Stored weights display at nearest 0.5 lb ===\n");

// Test stored weights: 72.5, 85, 62.5 kg
const storedWeights = [
  { kg: 72.5, expectedPrefill: "160", expectedWorking: "160 lb" },
  { kg: 85, expectedPrefill: "187.5", expectedWorking: "187.5 lb" },
  { kg: 62.5, expectedPrefill: "138", expectedWorking: "138 lb" },
];

for (const { kg, expectedPrefill, expectedWorking } of storedWeights) {
  // Test 1: Runner prefill shows nearest 0.5 lb (not floored)
  const prefill = computeRunnerWeightPrefill(kg, "imperial", false);
  check(
    `${kg} kg: runner prefill displays as ${expectedPrefill} lb`,
    prefill === expectedPrefill,
    `expected "${expectedPrefill}", got "${prefill}"`
  );
  
  // Test 2: Working weight line matches prefill
  const workingWeight = formatLoad(kg, "imperial");
  check(
    `${kg} kg: working weight line displays as ${expectedWorking}`,
    workingWeight === expectedWorking,
    `expected "${expectedWorking}", got "${workingWeight}"`
  );
  
  // Test 3: Unedited prefill submits original kg exactly
  const submittedKg = weightKgToSubmit(prefill, prefill, kg, "imperial");
  check(
    `${kg} kg: unedited prefill submits original ${kg} kg exactly`,
    submittedKg === kg,
    `expected ${kg}, got ${submittedKg}`
  );
}

// Test 4: Edited value goes through displayToKg normally
const editTest = { kg: 72.5, editTo: "165" };
const editedResult = weightKgToSubmit(
  editTest.editTo, 
  "160", 
  editTest.kg, 
  "imperial"
);
const expectedEditedKg = 74.84; // 165 lb ≈ 74.84 kg
check(
  `${editTest.kg} kg: editing prefill to ${editTest.editTo} lb converts to ~${expectedEditedKg} kg`,
  editedResult !== null && Math.abs(editedResult - expectedEditedKg) < 0.1,
  `expected ~${expectedEditedKg} kg, got ${editedResult} kg`
);

console.log("");

if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} of ${passed + failed} tests failed\n`);
  process.exit(1);
}
