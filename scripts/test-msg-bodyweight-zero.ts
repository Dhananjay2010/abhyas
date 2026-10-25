#!/usr/bin/env tsx
/**
 * Test: MSG mutant - bodyweight at 0 kg miss message
 * 
 * A pull_up_bar or band exercise logged at 0 kg with isBodyweight false
 * on a miss must NOT say "Staying at 0 kg".
 * 
 * Mutant MSG removes `currentWeight === 0 ||` from the message condition.
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`  FAIL ${label}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

const PULLUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_pull",
  isBodyweight: false, // Equipment present (pull_up_bar)
  progressionChain: null,
  progressionRank: null,
};

console.log("MSG: Bodyweight exercise at 0 kg on miss - message must not say 'Staying at 0 kg'\n");

const result = evaluateProgression({
  sets: [
    { reps: 7, weightKg: 0 },
    { reps: 7, weightKg: 0 },
    { reps: 7, weightKg: 0 },
  ],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: "right",
  meta: PULLUP,
  state: {
    currentWorkingWeightKg: 0,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 0,
    bestReps: 10,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: null,
  },
  isDeload: false,
  equipmentIds: ["pull_up_bar"],
});

check("Pull-up at 0 kg miss: outcome is hold", result.outcome === "hold");
check("Pull-up at 0 kg miss: weight stays at 0", result.nextWorkingWeightKg === 0, `got ${result.nextWorkingWeightKg}`);
check(
  "MSG: Pull-up at 0 kg miss: message does NOT say 'Staying at 0 kg'",
  !result.message.includes("Staying at 0 kg"),
  `message: "${result.message}"`
);
check(
  "MSG: Message mentions 'this weight' not specific kg",
  result.message.includes("Staying at this weight") || result.message.includes("until every set"),
  `message: "${result.message}"`
);

console.log("\n=== SUMMARY ===");
if (failures > 0) {
  console.log(`FAILED: ${failures} checks`);
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED - MSG mutant would be killed");
  process.exit(0);
}
