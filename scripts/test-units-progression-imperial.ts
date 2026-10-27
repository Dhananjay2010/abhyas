#!/usr/bin/env tsx
/**
 * Test: Imperial units in progression messages
 * 
 * Verifies:
 * 1. Hold messages show weight in lb (nearest 0.5 lb)
 * 2. Progress messages show weight in lb
 * 3. PB strings include lb
 * 4. No kg appears in imperial messages
 */

import { evaluateProgression, describePersonalBest } from "../src/lib/program/progression.js";

let failures = 0;

function check(desc: string, pass: boolean, detail = "") {
  if (!pass) {
    failures++;
    console.log(`❌ FAIL: ${desc}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`✓ ${desc}`);
  }
}

const CURL = {
  mechanic: "isolation" as const,
  metric: "reps" as const,
  movementPattern: "biceps" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const PRESS = {
  mechanic: "compound" as const,
  metric: "reps" as const,
  movementPattern: "vertical_press" as const,
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("\n=== Imperial Units in Progression Messages ===\n");

// Test 1: Progress message with imperial
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }, { reps: 12, weightKg: 45.36 }],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 45.36, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  check("Progress: 45.36 kg (100 lb) → includes 'lb'", d.message.includes("lb"), d.message);
  check("Progress: no 'kg' in message", !d.message.includes("kg"));
}

// Test 2: Hold message with imperial (in-range)
{
  const d = evaluateProgression({
    sets: [{ reps: 10, weightKg: 22.68 }, { reps: 10, weightKg: 22.68 }, { reps: 10, weightKg: 22.68 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 22.68, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "lb",
  });
  
  check("Hold: 22.68 kg (50 lb) in-range → includes 'lb'", d.message.includes("lb"), d.message);
  check("Hold: shows 50 lb", d.message.includes("50 lb"), d.message);
}

// Test 3: Miss/drop message with imperial
{
  const d = evaluateProgression({
    sets: [{ reps: 7, weightKg: 36.29 }, { reps: 7, weightKg: 36.29 }, { reps: 7, weightKg: 36.29 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: CURL,
    state: { currentWorkingWeightKg: 36.29, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["dumbbell"],
    unit: "lb",
  });
  
  check("Miss: 36.29 kg (80 lb) first miss → includes 'lb'", d.message.includes("lb"), d.message);
  check("Miss: no 'kg' in message", !d.message.includes("kg"));
}

// Test 4: PB description includes unit
{
  const pb = { kind: "weight" as const, value: 56.7 };
  const desc = describePersonalBest(pb, "imperial");
  
  check("PB: weight PB includes 'lb'", desc.includes("lb"), desc);
  check("PB: shows 125 lb", desc.includes("125"), desc);
}

// Test 5: Metric messages still work (byte-identical guard)
{
  const d = evaluateProgression({
    sets: [{ reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }],
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: PRESS,
    state: { currentWorkingWeightKg: 50, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  check("Metric: includes 'kg'", d.message.includes("kg"), d.message);
  check("Metric: no 'lb' in message", !d.message.includes("lb"));
  check("Metric: next is 52.5 kg (50+2.5)", d.nextWorkingWeightKg === 52.5, `got ${d.nextWorkingWeightKg}`);
}

console.log(failures === 0 ? "\n✅ All imperial units tests passed\n" : `\n❌ ${failures} test(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
