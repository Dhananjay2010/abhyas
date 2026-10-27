#!/usr/bin/env npx tsx
/**
 * Test banned exercise replacement in existing planned sessions.
 * 
 * Owner decision: Replace banned exercises in NOT-YET-STARTED planned sessions only.
 * Logged sets, completed days, and in-progress sessions are never touched (tested via ensureSessionExercises contract).
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
console.log("BANNED EXERCISE REPLACEMENT TEST");
console.log("=".repeat(80));
console.log("");

// Test 1: shouldReplaceBannedExercise logic
console.log("=== Test 1: shouldReplaceBannedExercise ===");

const testCases = [
  { slug: "single-leg-leg-extension", hasPastKnee: true, hasAnyKnee: true, expected: true, label: "past-knee PAST_KNEE_BANNED" },
  { slug: "single-leg-leg-extension", hasPastKnee: false, hasAnyKnee: true, expected: false, label: "current-knee not PAST_KNEE_BANNED" },
  { slug: "calf-press-on-the-leg-press-machine", hasPastKnee: true, hasAnyKnee: true, expected: true, label: "past-knee PAST_KNEE_BANNED (calf-press)" },
  { slug: "landmine-linear-jammer", hasPastKnee: true, hasAnyKnee: true, expected: true, label: "past-knee ANY_KNEE_BANNED" },
  { slug: "landmine-linear-jammer", hasPastKnee: false, hasAnyKnee: true, expected: true, label: "current-knee ANY_KNEE_BANNED" },
  { slug: "single-arm-linear-jammer", hasPastKnee: false, hasAnyKnee: true, expected: true, label: "current-knee ANY_KNEE_BANNED (single-arm)" },
  { slug: "barbell-squat", hasPastKnee: false, hasAnyKnee: true, expected: false, label: "current-knee safe exercise" },
  { slug: "single-leg-leg-extension", hasPastKnee: false, hasAnyKnee: false, expected: false, label: "no-knee user" },
];

for (const tc of testCases) {
  const result = shouldReplaceBannedExercise(tc.slug, tc.hasPastKnee, tc.hasAnyKnee);
  if (result === tc.expected) {
    console.log(`  ✓ PASS: ${tc.label}`);
  } else {
    console.log(`  ✗ FAIL: ${tc.label} - got ${result}, expected ${tc.expected}`);
    failures++;
  }
}

console.log("");

// Test 2: Past-knee user with single-leg-leg-extension → replaced
console.log("=== Test 2: Past-knee user - single-leg-leg-extension replaced ===");

const pastKneeInput: GeneratorInput = {
  userId: "past-knee-test",
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
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const singleLegExt = catalogueBySlug.get("single-leg-leg-extension");
if (!singleLegExt) {
  console.log("  ✗ FAIL: single-leg-leg-extension not found in catalogue");
  failures++;
} else {
  const planned: PlannedExercise[] = [
    {
      exercise_id: singleLegExt.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "test-session");
  
  if (result.length !== 1) {
    console.log(`  ✗ FAIL: Expected 1 exercise, got ${result.length}`);
    failures++;
  } else if (result[0].exercise_id === singleLegExt.id) {
    console.log(`  ✗ FAIL: single-leg-leg-extension not replaced`);
    failures++;
  } else {
    const replacement = catalogueById.get(result[0].exercise_id);
    console.log(`  ✓ PASS: Replaced with ${replacement?.name || "unknown"} [${replacement?.slug || "unknown"}]`);
    
    // Verify prescription unchanged
    if (result[0].target_sets !== 3 || result[0].target_reps_min !== 8 || result[0].target_reps_max !== 12) {
      console.log(`  ✗ FAIL: Prescription changed`);
      failures++;
    } else {
      console.log(`  ✓ PASS: Prescription unchanged (3 sets, 8-12 reps)`);
    }
  }
}

console.log("");

// Test 3: Current-knee user - single-leg-leg-extension NOT replaced
console.log("=== Test 3: Current-knee user - single-leg-leg-extension NOT replaced ===");

const currentKneeInput: GeneratorInput = {
  ...pastKneeInput,
  currentInjuryRegions: ["knee"],
};

if (singleLegExt) {
  const planned: PlannedExercise[] = [
    {
      exercise_id: singleLegExt.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, currentKneeInput, "test-session");
  
  if (result.length !== 1) {
    console.log(`  ✗ FAIL: Expected 1 exercise, got ${result.length}`);
    failures++;
  } else if (result[0].exercise_id !== singleLegExt.id) {
    console.log(`  ✗ FAIL: single-leg-leg-extension was replaced for current-knee (should keep)`);
    failures++;
  } else {
    console.log(`  ✓ PASS: single-leg-leg-extension kept for current-knee`);
  }
}

console.log("");

// Test 4: ANY-knee jammer replacement
console.log("=== Test 4: ANY-knee user - landmine jammer replaced ===");

const jammer = catalogueBySlug.get("landmine-linear-jammer");
if (!jammer) {
  console.log("  ✗ FAIL: landmine-linear-jammer not found in catalogue");
  failures++;
} else {
  for (const label of ["current-knee", "past-knee"]) {
    const input = label === "past-knee" ? pastKneeInput : currentKneeInput;
    
    const planned: PlannedExercise[] = [
      {
        exercise_id: jammer.id,
        order_index: 0,
        target_sets: 4,
        target_reps_min: 6,
        target_reps_max: 10,
        rest_seconds: 120,
      },
    ];
    
    const result = replaceBannedInPlanned(planned, catalogue, input, "test-session-jammer");
    
    if (result[0].exercise_id === jammer.id) {
      console.log(`  ✗ FAIL: ${label} - landmine-linear-jammer not replaced`);
      failures++;
    } else {
      const replacement = catalogueById.get(result[0].exercise_id);
      console.log(`  ✓ PASS: ${label} - Replaced with ${replacement?.name || "unknown"}`);
    }
  }
}

console.log("");

// Test 5: No-knee user - no replacements
console.log("=== Test 5: No-knee user - no replacements ===");

const noKneeInput: GeneratorInput = {
  ...pastKneeInput,
  anyKneeInjury: false,
  currentInjuryRegions: [],
};

if (singleLegExt && jammer) {
  const planned: PlannedExercise[] = [
    {
      exercise_id: singleLegExt.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
    {
      exercise_id: jammer.id,
      order_index: 1,
      target_sets: 4,
      target_reps_min: 6,
      target_reps_max: 10,
      rest_seconds: 120,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, noKneeInput, "test-session");
  
  if (result.length !== 2) {
    console.log(`  ✗ FAIL: Expected 2 exercises, got ${result.length}`);
    failures++;
  } else if (result[0].exercise_id !== singleLegExt.id || result[1].exercise_id !== jammer.id) {
    console.log(`  ✗ FAIL: Exercises were replaced for no-knee user`);
    failures++;
  } else {
    console.log(`  ✓ PASS: No replacements for no-knee user`);
  }
}

console.log("");

// Test 6: Determinism - same input produces same output
console.log("=== Test 6: Determinism ===");

if (singleLegExt) {
  const planned: PlannedExercise[] = [
    {
      exercise_id: singleLegExt.id,
      order_index: 0,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
  ];
  
  const result1 = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "determinism-test");
  const result2 = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "determinism-test");
  
  if (JSON.stringify(result1) !== JSON.stringify(result2)) {
    console.log(`  ✗ FAIL: Non-deterministic replacement`);
    failures++;
  } else {
    console.log(`  ✓ PASS: Deterministic replacement`);
  }
}

console.log("");

console.log("=".repeat(80));
if (failures === 0) {
  console.log("✅ PASSED: All banned exercise replacement tests passed");
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${failures} test(s) failed`);
  process.exit(1);
}
