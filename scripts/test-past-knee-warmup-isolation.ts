#!/usr/bin/env tsx
/**
 * QA Steer (n): Warm-up input isolation test.
 * 
 * Verifies that:
 * 1. Past shoulder warm-ups are byte-identical to no-injury baseline
 * 2. Past lower-back warm-ups are byte-identical to no-injury baseline
 * 3. Past knee warm-ups ARE different (include knee-safe patterns for Lower days)
 */

import { selectWarmup, buildWarmupInput } from "../src/lib/program/warmup";
import type { Muscle, Track } from "../src/lib/database.types";

// Mock warmup data (simplified)
const mockWarmups = [
  {
    id: "warmup-1",
    name: "Bodyweight Squat",
    slug: "bodyweight-squat-warmup",
    primary_muscles: ["quads", "glutes"],
    contraindicated_regions: null,
    equipment_ids: [],
  },
  {
    id: "warmup-2",
    name: "Leg Swings",
    slug: "leg-swings",
    primary_muscles: ["quads", "hamstrings"],
    contraindicated_regions: null,
    equipment_ids: [],
  },
  {
    id: "warmup-3",
    name: "Knee-Safe Squat",
    slug: "knee-safe-squat",
    primary_muscles: ["quads"],
    contraindicated_regions: null,
    equipment_ids: [],
  },
];

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
    process.exit(1);
  }
}

async function testWarmupIsolation(): Promise<void> {
  console.log("Running warm-up isolation tests...\n");

  const trainingMuscles: Muscle[] = ["quads", "glutes", "hamstrings"]; // Lower day
  const track: Track = "weights";
  const availableEquipment = new Set(["barbell", "dumbbell"]);
  const hasAllEquipment = false;

  // Test 1: No injury baseline
  console.log("Test 1: No injury baseline...");
  const baselineInput = buildWarmupInput([], mockWarmups, trainingMuscles, track, availableEquipment, hasAllEquipment);
  const baselineWarmup = selectWarmup(baselineInput);
  const baselineSlugs = baselineWarmup.map(w => w.slug).sort().join(",");
  console.log(`  Baseline: ${baselineSlugs}`);
  console.log(`  Baseline injury regions: ${JSON.stringify(baselineInput.injuryRegions)}\n`);

  // Test 2: Past shoulder should be identical to baseline
  console.log("Test 2: Past shoulder warm-up...");
  const pastShoulderInput = buildWarmupInput(
    [{ severity: "past", body_region: "shoulder" }],
    mockWarmups,
    trainingMuscles,
    track,
    availableEquipment,
    hasAllEquipment
  );
  const pastShoulderWarmup = selectWarmup(pastShoulderInput);
  const pastShoulderSlugs = pastShoulderWarmup.map(w => w.slug).sort().join(",");
  console.log(`  Past shoulder: ${pastShoulderSlugs}`);
  console.log(`  Past shoulder injury regions: ${JSON.stringify(pastShoulderInput.injuryRegions)}`);

  check(
    "Past shoulder warm-up is byte-identical to baseline",
    pastShoulderSlugs === baselineSlugs,
    `expected: ${baselineSlugs}, got: ${pastShoulderSlugs}`
  );
  
  check(
    "Past shoulder injury regions is empty (filtered out)",
    pastShoulderInput.injuryRegions.length === 0,
    `expected: [], got: ${JSON.stringify(pastShoulderInput.injuryRegions)}`
  );

  console.log();

  // Test 3: Past lower_back should be identical to baseline
  console.log("Test 3: Past lower_back warm-up...");
  const pastLowerBackInput = buildWarmupInput(
    [{ severity: "past", body_region: "lower_back" }],
    mockWarmups,
    trainingMuscles,
    track,
    availableEquipment,
    hasAllEquipment
  );
  const pastLowerBackWarmup = selectWarmup(pastLowerBackInput);
  const pastLowerBackSlugs = pastLowerBackWarmup.map(w => w.slug).sort().join(",");
  console.log(`  Past lower_back: ${pastLowerBackSlugs}`);
  console.log(`  Past lower_back injury regions: ${JSON.stringify(pastLowerBackInput.injuryRegions)}`);

  check(
    "Past lower_back warm-up is byte-identical to baseline",
    pastLowerBackSlugs === baselineSlugs,
    `expected: ${baselineSlugs}, got: ${pastLowerBackSlugs}`
  );
  
  check(
    "Past lower_back injury regions is empty (filtered out)",
    pastLowerBackInput.injuryRegions.length === 0,
    `expected: [], got: ${JSON.stringify(pastLowerBackInput.injuryRegions)}`
  );

  console.log();

  // Test 4: Past knee should be DIFFERENT (includes knee-safe patterns)
  console.log("Test 4: Past knee warm-up...");
  const pastKneeInput = buildWarmupInput(
    [{ severity: "past", body_region: "knee" }],
    mockWarmups,
    trainingMuscles,
    track,
    availableEquipment,
    hasAllEquipment
  );
  const pastKneeWarmup = selectWarmup(pastKneeInput);
  const pastKneeSlugs = pastKneeWarmup.map(w => w.slug).sort().join(",");
  console.log(`  Past knee: ${pastKneeSlugs}`);
  console.log(`  Past knee injury regions: ${JSON.stringify(pastKneeInput.injuryRegions)}`);

  check(
    "Past knee injury regions includes knee",
    pastKneeInput.injuryRegions.includes("knee"),
    `expected: ["knee"], got: ${JSON.stringify(pastKneeInput.injuryRegions)}`
  );
  
  check(
    "Past knee flag is true",
    pastKneeInput.pastKneeInjury === true,
    `expected: true, got: ${pastKneeInput.pastKneeInjury}`
  );

  console.log();

  // Test 5: Combined past injuries (shoulder + knee)
  console.log("Test 5: Combined past shoulder + past knee...");
  const combinedInput = buildWarmupInput(
    [
      { severity: "past", body_region: "shoulder" },
      { severity: "past", body_region: "knee" },
    ],
    mockWarmups,
    trainingMuscles,
    track,
    availableEquipment,
    hasAllEquipment
  );
  console.log(`  Combined injury regions: ${JSON.stringify(combinedInput.injuryRegions)}`);

  check(
    "Combined injuries: only knee is included",
    combinedInput.injuryRegions.length === 1 && combinedInput.injuryRegions[0] === "knee",
    `expected: ["knee"], got: ${JSON.stringify(combinedInput.injuryRegions)}`
  );

  console.log();

  console.log("✅ All warm-up isolation tests passed");
}

async function main(): Promise<void> {
  try {
    await testWarmupIsolation();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
