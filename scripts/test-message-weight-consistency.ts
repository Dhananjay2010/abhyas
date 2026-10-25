#!/usr/bin/env tsx
/**
 * Test: Hold messages include the weight when holding.
 * When state.currentWorkingWeightKg is null, use most common working-set weight (ties go to lower).
 */

import { evaluateProgression, type ExerciseMeta, type ProgressState, type LoggedSet } from "../src/lib/program/progression.js";

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function fresh(overrides: Partial<ProgressState> = {}): ProgressState {
  return { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null, ...overrides };
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

console.log("\n=== Message Weight Consistency: Actual Lifted Weight (Mode) ===\n");

// Case: 1x7@72.5 + 4x12@70, no prior row → mode is 70 kg (miss case, one set below repsMin)
{
  const sets = [
    makeSet(7, 72.5),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
  ];
  
  // With equipment (first miss from mode 70 kg → 67.5 kg)
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("With equipment: 1x7@72.5 + 4x12@70 → drops from mode 70 to 67.5 kg", withEquip.nextWorkingWeightKg === 67.5);
  check("  message includes '67.5 kg'", withEquip.message.includes("67.5 kg"));
  check("  consecutiveFailures incremented", withEquip.consecutiveFailures === 1);
  
  // Without equipment (first miss from mode 70 kg → holds at 70 due to 20% threshold)
  const noEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: undefined,
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Without equipment: 1x7@72.5 + 4x12@70 → holds at mode 70 kg (20% threshold)", noEquip.nextWorkingWeightKg === 70);
  check("  message includes '70 kg'", noEquip.message.includes("70 kg"));
  check("  progression computed from 70 kg baseline", noEquip.consecutiveFailures === 1);
}

// Case: Success case with mode weight - all sets hit top
{
  const sets = [
    makeSet(12, 72.5),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
  ];
  
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Success: 5x12 (1@72.5, 4@70) → progresses from mode 70 to 72.5 kg", withEquip.nextWorkingWeightKg === 72.5);
  check("  message includes '72.5 kg'", withEquip.message.includes("72.5 kg"));
  check("  outcome is progressed", withEquip.outcome === "progressed");
}

// Case: ties go to lower weight (2x12@70 + 2x12@72.5)
{
  const sets = [
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 72.5),
    makeSet(12, 72.5),
  ];
  
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Tie-breaker: 2x12@70 + 2x12@72.5 → progresses from lower (70 to 72.5 kg)", withEquip.nextWorkingWeightKg === 72.5);
  check("  message includes '72.5 kg'", withEquip.message.includes("72.5 kg"));
  check("  outcome is progressed", withEquip.outcome === "progressed");
}

// Case: Drop from most common weight when below threshold
{
  const sets = [
    makeSet(7, 72.5),
    makeSet(11, 70),
    makeSet(11, 70),
    makeSet(11, 70),
    makeSet(11, 70),
  ];
  
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Drop case: 1x7@72.5 + 4x11@70 → drops from mode 70 to 67.5 kg", withEquip.nextWorkingWeightKg === 67.5);
  check("  message includes '67.5 kg'", withEquip.message.includes("67.5 kg"));
  check("  outcome is hold", withEquip.outcome === "hold");
}

// Case: Hold at smallest weight with mode fallback
{
  const sets = [
    makeSet(7, 7.5),
    makeSet(11, 5),
    makeSet(11, 5),
    makeSet(11, 5),
    makeSet(11, 5),
  ];
  
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["dumbbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Hold at smallest: 1x7@7.5 + 4x11@5 → holds at mode 5 kg", withEquip.nextWorkingWeightKg === 5);
  check("  message includes '5 kg'", withEquip.message.includes("5 kg"));
  check("  outcome is hold", withEquip.outcome === "hold");
}

console.log("\n=== Progression Base: Actual Lifted Weight, Not Stored ===\n");

// QA case: stored 14 + 4x12@30 → must progress from 30, not 14
{
  const sets = [
    makeSet(12, 30),
    makeSet(12, 30),
    makeSet(12, 30),
    makeSet(12, 30),
  ];
  
  const result = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 14, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Stored 14 + 4x12@30 → progresses from 30 to 32.5 kg (not from 14)", result.nextWorkingWeightKg === 32.5);
  check("  message includes '32.5 kg'", result.message.includes("32.5 kg"));
  check("  outcome is progressed", result.outcome === "progressed");
}

// Case: stored 70 + 4x12@65 → must progress from 65
{
  const sets = [
    makeSet(12, 65),
    makeSet(12, 65),
    makeSet(12, 65),
    makeSet(12, 65),
  ];
  
  const result = evaluateProgression({
    sets,
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: 70, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("Stored 70 + 4x12@65 → progresses from 65 to 67.5 kg (not from 70)", result.nextWorkingWeightKg === 67.5);
  check("  message includes '67.5 kg'", result.message.includes("67.5 kg"));
  check("  outcome is progressed", result.outcome === "progressed");
}

// Case: 1x11@72.5 + 4x12@70 with no prior row (already tested above, verify message)
{
  const sets = [
    makeSet(12, 72.5),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
    makeSet(12, 70),
  ];
  
  const withEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: ["barbell"],
    
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("No prior row: 5x12 (1@72.5, 4@70) → from mode 70 to 72.5 kg", withEquip.nextWorkingWeightKg === 72.5);
  check("  message weight matches next (72.5 kg)", withEquip.message.includes("72.5 kg"));
  
  const noEquip = evaluateProgression({
    sets,
    plannedSets: 5,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    equipmentIds: undefined,
    meta: CURL,
    state: fresh({ currentWorkingWeightKg: null, consecutiveFailures: 0 }),
    isDeload: false,
  });
  
  check("No equipment: from mode 70 to 71.25 kg", noEquip.nextWorkingWeightKg === 71.25);
}

console.log("\n✅ All message weight consistency tests passed\n");
