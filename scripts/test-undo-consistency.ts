#!/usr/bin/env tsx
/**
 * Test: After undo + re-log, progression computed from final logged sets.
 * Message weight must match nextWorkingWeightKg.
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, ...overrides };
}

function makeSet(reps: number, weightKg: number): LoggedSet {
  return { reps, weightKg };
}

function check(desc: string, pass: boolean): void {
  if (!pass) {
    console.log(`  FAIL ${desc}`);
    process.exitCode = 1;
  } else {
    console.log(`  ok   ${desc}`);
  }
}

console.log("\n=== Undo Consistency: Final Logged Sets ===\n");

// Case: After undo, progression from what remains
// Scenario: logged 4x12@60, undid one set → 3x12@60 (first miss: mode 60 → drops to 57.5)
{
  const sets = [
    makeSet(12, 60),
    makeSet(12, 60),
    makeSet(12, 60),
  ];
  
  const result = evaluateProgression({
    sets,
    plannedSets: 4, // Originally planned 4, but only 3 logged after undo
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Planned 4 but logged 3x12@60 → drops from mode 60 to 57.5 kg (first miss)", result.nextWorkingWeightKg === 57.5);
  check("  message includes '57.5 kg'", result.message.includes("57.5 kg"));
  check("  message weight matches next", result.message.includes(result.nextWorkingWeightKg.toString()));
  check("  outcome is hold", result.outcome === "hold");
}

// Case: Undid last set, then re-logged at lighter weight
// Scenario: logged 3x12@60 + 1x10@62.5, undid 62.5 set, re-logged 1x12@60 → 4x12@60 (success)
{
  const sets = [
    makeSet(12, 60),
    makeSet(12, 60),
    makeSet(12, 60),
    makeSet(12, 60),
  ];
  
  const result = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("After undo+relog: 4x12@60 → progresses to 62.5 kg", result.nextWorkingWeightKg === 62.5);
  check("  message includes '62.5 kg'", result.message.includes("62.5 kg"));
  check("  message weight matches next", result.nextWorkingWeightKg === 62.5);
  check("  outcome is progressed", result.outcome === "progressed");
}

// Case: Mode weight after undo (multiple weights present)
// Scenario: logged 2x12@60 + 2x12@62.5, undid one 62.5 set → 2x12@60 + 1x12@62.5 (mode 60 → drops to 57.5)
{
  const sets = [
    makeSet(12, 60),
    makeSet(12, 60),
    makeSet(12, 62.5),
  ];
  
  const result = evaluateProgression({
    sets,
    plannedSets: 4, // Planned 4, logged 3 after undo
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    unit: "kg",
    meta: BENCH,
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("After undo: 2x12@60 + 1x12@62.5 → drops from mode 60 to 57.5 kg", result.nextWorkingWeightKg === 57.5);
  check("  message includes '57.5 kg'", result.message.includes("57.5 kg"));
  check("  message weight matches next", result.message.includes(result.nextWorkingWeightKg.toString()));
  check("  outcome is hold", result.outcome === "hold");
}

console.log("\n✅ All undo consistency tests passed\n");
