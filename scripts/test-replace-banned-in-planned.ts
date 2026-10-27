#!/usr/bin/env npx tsx
/**
 * Test banned exercise replacement with comprehensive coverage.
 * Tests the pure function against real catalogue and expected behavior.
 */

import { readFileSync } from "fs";
import {
  replaceBannedInPlanned,
  shouldReplaceBannedExercise,
  type PlannedExercise,
} from "../src/lib/program/replace-banned-in-planned";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(e => [e.id, e]));
const catalogueBySlug = new Map(catalogue.map(e => [e.slug, e]));

let failures = 0;

console.log("=".repeat(80));
console.log("BANNED EXERCISE REPLACEMENT - COMPREHENSIVE TEST");
console.log("=".repeat(80));
console.log("");

function buildInput(anyKneeInjury: boolean, currentKnee: boolean): GeneratorInput {
  return {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: currentKnee ? ["knee"] : [],
    anyKneeInjury,
    preferredSessionMinutes: 60,
    catalogue,
  };
}

// Test 1: Past-knee banned exercise is replaced
console.log("=== Test 1: Past-knee banned exercise replacement ===");

const thruster = catalogueBySlug.get("kettlebell-thruster");
if (!thruster) {
  console.log("  ✗ FAIL: kettlebell-thruster not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      id: "test-row-1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  
  if (result.changed && result.rows[0].exercise_id !== thruster.id) {
    const replacement = catalogueById.get(result.rows[0].exercise_id);
    console.log(`  ✓ PASS: Replaced with ${replacement?.name}`);
  } else {
    console.log(`  ✗ FAIL: Should have replaced kettlebell-thruster`);
    failures++;
  }
}

console.log("");

// Test 2: No duplicates introduced
console.log("=== Test 2: No duplicates introduced ===");

const barbellSquat = catalogueBySlug.get("barbell-squat");
const legPress = catalogueBySlug.get("leg-press");
if (!thruster || !barbellSquat || !legPress) {
  console.log("  ✗ FAIL: Test exercises not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      id: "test-row-1",
      exercise_id: barbellSquat.id,
      order_index: 0,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
    {
      id: "test-row-2",
      exercise_id: thruster.id,
      order_index: 1,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 75,
    },
    {
      id: "test-row-3",
      exercise_id: legPress.id,
      order_index: 2,
      target_sets: 3,
      target_reps_min: 10,
      target_reps_max: 15,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  
  const resultIds = result.rows.map(e => e.exercise_id);
  const uniqueIds = new Set(resultIds);
  
  if (resultIds.length === uniqueIds.size) {
    console.log(`  ✓ PASS: No duplicates (3 unique exercises)`);
  } else {
    console.log(`  ✗ FAIL: Duplicates found (${resultIds.length} exercises, ${uniqueIds.size} unique)`);
    failures++;
  }
  
  if (result.rows[0].exercise_id === barbellSquat.id && result.rows[2].exercise_id === legPress.id) {
    console.log(`  ✓ PASS: Non-banned exercises preserved in correct positions`);
  } else {
    console.log(`  ✗ FAIL: Non-banned exercises were modified`);
    failures++;
  }
}

console.log("");

// Test 3: Sets/reps/rest/order preserved
console.log("=== Test 3: Prescription and order preserved ===");

if (!thruster) {
  console.log("  ✗ FAIL: kettlebell-thruster not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      id: "test-row-1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 5,
      target_reps_min: 6,
      target_reps_max: 10,
      rest_seconds: 120,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  
  let prescriptionPassed = true;
  if (result.rows[0].target_sets !== 5) {
    console.log(`  ✗ FAIL: Sets changed (${result.rows[0].target_sets} vs 5)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result.rows[0].target_reps_min !== 6) {
    console.log(`  ✗ FAIL: Reps min changed (${result.rows[0].target_reps_min} vs 6)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result.rows[0].target_reps_max !== 10) {
    console.log(`  ✗ FAIL: Reps max changed (${result.rows[0].target_reps_max} vs 10)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result.rows[0].rest_seconds !== 120) {
    console.log(`  ✗ FAIL: Rest changed (${result.rows[0].rest_seconds} vs 120)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result.rows[0].order_index !== 0) {
    console.log(`  ✗ FAIL: Order changed (${result.rows[0].order_index} vs 0)`);
    prescriptionPassed = false;
    failures++;
  }
  
  if (prescriptionPassed) {
    console.log(`  ✓ PASS: All prescription fields and order preserved`);
  }
}

console.log("");

// Test 4: Determinism
console.log("=== Test 4: Determinism ===");

if (!thruster) {
  console.log("  ✗ FAIL: kettlebell-thruster not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      id: "determinism-test-seed",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result1 = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  const result2 = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  
  if (JSON.stringify(result1) === JSON.stringify(result2)) {
    console.log(`  ✓ PASS: Deterministic replacement`);
  } else {
    console.log(`  ✗ FAIL: Non-deterministic replacement`);
    failures++;
  }
}

console.log("");

// Test 5: Non-knee users pass through unchanged
console.log("=== Test 5: Non-knee users unchanged ===");

if (!thruster) {
  console.log("  ✗ FAIL: kettlebell-thruster not found");
  failures++;
} else {
  const noKneeInput = buildInput(false, false);
  const planned: PlannedExercise[] = [
    {
      id: "test-row-1",
      exercise_id: thruster.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, noKneeInput);
  
  if (!result.changed && result.rows[0].exercise_id === thruster.id) {
    console.log(`  ✓ PASS: Non-knee users unchanged`);
  } else {
    console.log(`  ✗ FAIL: Non-knee users should be unchanged`);
    failures++;
  }
}

console.log("");

// Test 6: Current-knee banned exercises
console.log("=== Test 6: Current-knee tier bans ===");

const kbPushPress = catalogueBySlug.get("one-arm-kettlebell-push-press");
if (!thruster || !kbPushPress) {
  console.log("  ✗ FAIL: Test exercises not found");
  failures++;
} else {
  // Past knee: thruster banned, push-press allowed
  const pastKneeInput = buildInput(true, false);
  const pastKneeTier = determineKneeTier(true, []);
  
  if (pastKneeTier === "past") {
    const thrusterBanned = shouldReplaceBannedExercise(thruster.slug, pastKneeTier);
    const pushPressBanned = shouldReplaceBannedExercise(kbPushPress.slug, pastKneeTier);
    
    if (thrusterBanned && !pushPressBanned) {
      console.log(`  ✓ PASS: Past-knee: thruster banned, push-press allowed`);
    } else {
      console.log(`  ✗ FAIL: Past-knee tier incorrect (thruster: ${thrusterBanned}, push-press: ${pushPressBanned})`);
      failures++;
    }
  } else {
    console.log(`  ✗ FAIL: Knee tier should be 'past'`);
    failures++;
  }
  
  // Current knee: both banned
  const currentKneeInput = buildInput(true, true);
  const currentKneeTier = determineKneeTier(true, ["knee"]);
  
  if (currentKneeTier === "current") {
    const thrusterBanned = shouldReplaceBannedExercise(thruster.slug, currentKneeTier);
    const pushPressBanned = shouldReplaceBannedExercise(kbPushPress.slug, currentKneeTier);
    
    if (thrusterBanned && pushPressBanned) {
      console.log(`  ✓ PASS: Current-knee: both banned`);
    } else {
      console.log(`  ✗ FAIL: Current-knee tier incorrect (thruster: ${thrusterBanned}, push-press: ${pushPressBanned})`);
      failures++;
    }
  } else {
    console.log(`  ✗ FAIL: Knee tier should be 'current'`);
    failures++;
  }
}

console.log("");

// Test 7: Changed flag accuracy
console.log("=== Test 7: Changed flag accuracy ===");

if (!thruster && !barbellSquat) {
  console.log("  ✗ FAIL: Test exercises not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  
  // Test with banned exercise
  if (thruster) {
    const plannedBanned: PlannedExercise[] = [
      {
        id: "test-row-1",
        exercise_id: thruster.id,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      },
    ];
    
    const resultBanned = replaceBannedInPlanned(plannedBanned, catalogue, pastKneeInput);
    
    if (resultBanned.changed) {
      console.log(`  ✓ PASS: Changed flag true when replacement occurs`);
    } else {
      console.log(`  ✗ FAIL: Changed flag should be true`);
      failures++;
    }
  }
  
  // Test without banned exercise
  if (barbellSquat) {
    const plannedClean: PlannedExercise[] = [
      {
        id: "test-row-1",
        exercise_id: barbellSquat.id,
        order_index: 0,
        target_sets: 4,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      },
    ];
    
    const resultClean = replaceBannedInPlanned(plannedClean, catalogue, pastKneeInput);
    
    if (!resultClean.changed) {
      console.log(`  ✓ PASS: Changed flag false when no replacement`);
    } else {
      console.log(`  ✗ FAIL: Changed flag should be false`);
      failures++;
    }
  }
}

console.log("");

// Test 8: Jammer banned for any knee
console.log("=== Test 8: Jammer banned for any knee ===");

const jammer = catalogueBySlug.get("landmine-linear-jammer");
if (!jammer) {
  console.log("  ✗ FAIL: landmine-linear-jammer not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      id: "test-row-1",
      exercise_id: jammer.id,
      order_index: 0,
      target_sets: 4,
      target_reps_min: 6,
      target_reps_max: 10,
      rest_seconds: 120,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput);
  
  if (result.changed && result.rows[0].exercise_id !== jammer.id) {
    const replacement = catalogueById.get(result.rows[0].exercise_id);
    console.log(`  ✓ PASS: Jammer replaced for past knee (${replacement?.name})`);
  } else {
    console.log(`  ✗ FAIL: Jammer should be replaced for past knee`);
    failures++;
  }
}

console.log("");

function determineKneeTier(anyKneeInjury: boolean, currentInjuryRegions: string[]): "past" | "current" | null {
  if (!anyKneeInjury) return null;
  return currentInjuryRegions.includes("knee") ? "current" : "past";
}

console.log("=".repeat(80));
if (failures === 0) {
  console.log("✅ PASSED: All tests");
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${failures} test(s) failed`);
  process.exit(1);
}
