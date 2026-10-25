#!/usr/bin/env tsx
/**
 * Test H2: New user (null stored weight) in-range session stores the logged weight
 * 
 * HIGH-2 from QA Bot 2 on 7489d1e5:
 * A new user with no stored working weight (state.currentWorkingWeightKg null) logs
 * 4×10 at 40 kg in 8-12 range. The in-range branch must store 40 kg (the heaviest
 * logged weight), not null.
 * 
 * This file must FAIL on 7489d1e5 (before the fix) and PASS after.
 */

import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== H2: New user (null stored weight) in-range session ===");

console.log("\n1. Unit: state null + 4×10@40 → holds at 40, failures 0");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 40, durationSeconds: null },
      { reps: 10, weightKg: 40, durationSeconds: null },
      { reps: 10, weightKg: 40, durationSeconds: null },
      { reps: 10, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state: {
      currentWorkingWeightKg: null, // NEW USER: no stored weight
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
      totalSessions: 0,
    },
    isDeload: false,
  });

  check("Outcome: hold", decision.outcome === "hold", decision.outcome);
  check("Weight: stored as 40 (not null)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
  check("Failures: reset to 0", decision.consecutiveFailures === 0, `${decision.consecutiveFailures}`);
  check("Message: 'this weight' (not 'here')", decision.message.includes("this weight"), decision.message);
}

console.log("\n2. Mixed weights: state null + 4×10 at 40/42.5/40/40 → stores heaviest (42.5)");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 40, durationSeconds: null },
      { reps: 10, weightKg: 42.5, durationSeconds: null },
      { reps: 10, weightKg: 40, durationSeconds: null },
      { reps: 10, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state: {
      currentWorkingWeightKg: null,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
      totalSessions: 0,
    },
    isDeload: false,
  });

  check("Mixed weights: stores heaviest (42.5)", decision.nextWorkingWeightKg === 42.5, `${decision.nextWorkingWeightKg}`);
}

console.log("\n3. Bodyweight (no logged weights): stays null");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: null, durationSeconds: null },
      { reps: 10, weightKg: null, durationSeconds: null },
      { reps: 10, weightKg: null, durationSeconds: null },
    ],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: true,
      progressionChain: null,
      progressionRank: null,
    },
    state: {
      currentWorkingWeightKg: null,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
      totalSessions: 0,
    },
    isDeload: false,
  });

  check("Bodyweight: stays null", decision.nextWorkingWeightKg === null, `${decision.nextWorkingWeightKg}`);
  check("Bodyweight message: 'here' (not 'this weight')", decision.message.includes("Staying here"), decision.message);
}

console.log("\n4. Stored weight takes precedence over logged weight");
{
  const decision = evaluateProgression({
    sets: [
      { reps: 10, weightKg: 42.5, durationSeconds: null },
      { reps: 10, weightKg: 42.5, durationSeconds: null },
      { reps: 10, weightKg: 42.5, durationSeconds: null },
      { reps: 10, weightKg: 42.5, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state: {
      currentWorkingWeightKg: 40, // Stored weight (prescribed)
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: 56,
      totalSessions: 3,
    },
    isDeload: false,
  });

  check("Stored weight used: 40 (not logged 42.5)", decision.nextWorkingWeightKg === 40, `${decision.nextWorkingWeightKg}`);
}

if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
}

console.log(`\n✅ All H2 tests passed`);
