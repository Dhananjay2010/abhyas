#!/usr/bin/env tsx
/**
 * Generate detailed diff between main fixture (4a7ba6d) behavior and current behavior.
 * Shows which specific cases changed and why.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState } from "@/lib/program/progression";

const meta: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("=== NO-EQUIPMENT FIXTURE CHANGES ===\n");
console.log("Comparing current behavior vs main 4a7ba6d\n");

// Case 1: Never-raise (second miss at 4kg with pre-miss 6kg)
console.log("Case 1: Never-raise fix (c0729845)");
console.log("  Scenario: Second miss at 4kg, pre-miss weight was 6kg");
console.log("  Input: consecutiveFailures=1, currentWeight=4kg, weightAtFailureStartKg=6kg");

const case1 = evaluateProgression({
  sets: [{ reps: 5, weightKg: 4 }, { reps: 4, weightKg: 4 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 4,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 6,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: 6,
  },
  isDeload: false,
});

console.log("  Old (4a7ba6d): Would try 10% of 6kg = 5.4kg (RAISES weight from 4 to 5.4 - BUG)");
console.log(`  New (current): weight=${case1.nextWorkingWeightKg}kg, failures=${case1.consecutiveFailures}, outcome=${case1.outcome}`);
console.log("  Fix: Never-raise check prevents weight from increasing\n");

// Case 2: Hold-preserve-counter (second miss at 17.5kg with pre-miss 20kg)
console.log("Case 2: Hold-preserve-counter fix (c0729845)");
console.log("  Scenario: Second miss at 17.5kg, pre-miss was 20kg");
console.log("  Input: consecutiveFailures=1, currentWeight=17.5kg, weightAtFailureStartKg=20kg");

const case2 = evaluateProgression({
  sets: [{ reps: 5, weightKg: 17.5 }, { reps: 4, weightKg: 17.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 17.5,
    currentTargetReps: 12,
    consecutiveFailures: 1,
    bestWeightKg: 20,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 2,
    weightAtFailureStartKg: 20,
  },
  isDeload: false,
});

console.log("  Old (4a7ba6d): 10% of 20kg = 18kg, snaps to 17.5kg, outcome=backed_off, failures=0 (RESETS counter)");
console.log(`  New (current): weight=${case2.nextWorkingWeightKg}kg, failures=${case2.consecutiveFailures}, outcome=${case2.outcome}`);
console.log("  Fix: When back-off lands on current weight, preserve counter for third-miss\n");

// Case 3: Third miss now reachable
console.log("Case 3: Third-miss reachable (2866409e)");
console.log("  Scenario: Third miss after preserved counter");
console.log("  Input: consecutiveFailures=2, currentWeight=17.5kg, weightAtFailureStartKg=20kg");

const case3 = evaluateProgression({
  sets: [{ reps: 5, weightKg: 17.5 }, { reps: 4, weightKg: 17.5 }],
  plannedSets: 3,
  repsMin: 8,
  repsMax: 12,
  feel: null,
  meta,
  state: {
    currentWorkingWeightKg: 17.5,
    currentTargetReps: 12,
    consecutiveFailures: 2,
    bestWeightKg: 20,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 3,
    weightAtFailureStartKg: 20,
  },
  isDeload: false,
});

console.log("  Old (4a7ba6d): Third-miss UNREACHABLE (counter was reset to 0 on second miss)");
console.log(`  New (current): weight=${case3.nextWorkingWeightKg}kg, failures=${case3.consecutiveFailures}, outcome=${case3.outcome}`);
console.log("  Fix: Counter preservation in case 2 enables third-miss step-down\n");

console.log("=== SUMMARY ===");
console.log("All fixture changes are from approved QA Bot 3 fixes:");
console.log("1. Never-raise: prevents second-miss from incorrectly raising weight");
console.log("2. Hold-preserve-counter: preserves failures counter when back-off equals current");
console.log("3. Third-miss reachable: counter preservation enables intended third-miss logic");
