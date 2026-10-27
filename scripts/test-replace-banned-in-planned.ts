#!/usr/bin/env npx tsx
/**
 * Test banned exercise replacement with comprehensive coverage and mutants.
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  replaceBannedInPlanned,
  shouldReplaceBannedExercise,
  type PlannedExercise,
} from "../src/lib/program/replace-banned-in-planned";
import type { CandidateExercise, GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { buildSwapContext } from "../src/lib/program/swap-context";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { isEligible, score, hashString } from "../src/lib/program/generate";

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

// Helper: build GeneratorInput
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

// Test 1: Replacement matches what generator would pick
console.log("=== Test 1: Replacement matches generator logic ===");

const singleLegExt = catalogueBySlug.get("single-leg-leg-extension");
if (!singleLegExt) {
  console.log("  ✗ FAIL: single-leg-leg-extension not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
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
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "test-seed");
  
  // Now manually compute what rankAlternatives would pick
  const patterns = getSwapPatterns(singleLegExt.movement_pattern, pastKneeInput);
  const patternMatches = catalogue.filter(e => patterns.includes(e.movement_pattern));
  const eligible = patternMatches
    .filter(e => e.id !== singleLegExt.id)
    .filter(e => isEligible(e, pastKneeInput));
  
  const wantCompound = singleLegExt.mechanic !== "isolation";
  const scoreFn = (e: CandidateExercise) => 
    score(e, wantCompound, pastKneeInput.level, pastKneeInput.primaryTrack);
  const tieBreakFn = (slug: string) => hashString(`test-seed:0:${slug}`);
  const swapContext = buildSwapContext(pastKneeInput, scoreFn, tieBreakFn);
  const ranked = rankAlternatives(singleLegExt, eligible, swapContext);
  
  if (ranked.length > 0 && result[0].exercise_id === ranked[0].id) {
    const replacement = catalogueById.get(result[0].exercise_id);
    console.log(`  ✓ PASS: Replacement matches generator (${replacement?.name})`);
  } else {
    console.log(`  ✗ FAIL: Replacement doesn't match generator`);
    failures++;
  }
}

console.log("");

// Test 2: No duplicate exercises introduced
console.log("=== Test 2: No duplicates introduced ===");

const barbellSquat = catalogueBySlug.get("barbell-squat");
const legPress = catalogueBySlug.get("leg-press");
if (!singleLegExt || !barbellSquat || !legPress) {
  console.log("  ✗ FAIL: Test exercises not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      exercise_id: barbellSquat.id,
      order_index: 0,
      target_sets: 4,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 90,
    },
    {
      exercise_id: singleLegExt.id,
      order_index: 1,
      target_sets: 3,
      target_reps_min: 8,
      target_reps_max: 12,
      rest_seconds: 75,
    },
    {
      exercise_id: legPress.id,
      order_index: 2,
      target_sets: 3,
      target_reps_min: 10,
      target_reps_max: 15,
      rest_seconds: 90,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "test-seed");
  
  const resultIds = result.map(e => e.exercise_id);
  const uniqueIds = new Set(resultIds);
  
  if (resultIds.length === uniqueIds.size) {
    console.log(`  ✓ PASS: No duplicates (3 unique exercises)`);
  } else {
    console.log(`  ✗ FAIL: Duplicates found (${resultIds.length} exercises, ${uniqueIds.size} unique)`);
    failures++;
  }
  
  // Also verify barbell-squat and leg-press are preserved
  if (result[0].exercise_id === barbellSquat.id && result[2].exercise_id === legPress.id) {
    console.log(`  ✓ PASS: Non-banned exercises preserved in correct positions`);
  } else {
    console.log(`  ✗ FAIL: Non-banned exercises were modified`);
    failures++;
  }
}

console.log("");

// Test 3: Behavior when no eligible alternative exists
console.log("=== Test 3: No eligible alternative behavior ===");

// Create a synthetic banned exercise with no alternatives
const jammer = catalogueBySlug.get("landmine-linear-jammer");
if (!jammer) {
  console.log("  ✗ FAIL: landmine-linear-jammer not found");
  failures++;
} else {
  // Test with very restrictive equipment (no alternatives available)
  const restrictiveInput: GeneratorInput = {
    ...buildInput(true, false),
    hasAllEquipment: false,
    equipmentIds: ["landmine"], // Only landmine available - no alternatives
  };
  
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
  
  const result = replaceBannedInPlanned(planned, catalogue, restrictiveInput, "test-seed");
  
  // When no alternative exists, the banned exercise is kept (safety: don't break the day)
  if (result[0].exercise_id === jammer.id) {
    console.log(`  ✓ PASS: Kept banned exercise when no alternative exists (safety behavior)`);
  } else {
    console.log(`  ✗ FAIL: Should keep banned exercise when no alternative exists`);
    failures++;
  }
}

console.log("");

// Test 4: Sets/reps/rest/order preserved
console.log("=== Test 4: Prescription and order preserved ===");

if (!singleLegExt) {
  console.log("  ✗ FAIL: single-leg-leg-extension not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
  const planned: PlannedExercise[] = [
    {
      exercise_id: singleLegExt.id,
      order_index: 0,
      target_sets: 5,
      target_reps_min: 6,
      target_reps_max: 10,
      rest_seconds: 120,
    },
  ];
  
  const result = replaceBannedInPlanned(planned, catalogue, pastKneeInput, "test-seed");
  
  let prescriptionPassed = true;
  if (result[0].target_sets !== 5) {
    console.log(`  ✗ FAIL: Sets changed (${result[0].target_sets} vs 5)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result[0].target_reps_min !== 6) {
    console.log(`  ✗ FAIL: Reps min changed (${result[0].target_reps_min} vs 6)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result[0].target_reps_max !== 10) {
    console.log(`  ✗ FAIL: Reps max changed (${result[0].target_reps_max} vs 10)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result[0].rest_seconds !== 120) {
    console.log(`  ✗ FAIL: Rest changed (${result[0].rest_seconds} vs 120)`);
    prescriptionPassed = false;
    failures++;
  }
  if (result[0].order_index !== 0) {
    console.log(`  ✗ FAIL: Order changed (${result[0].order_index} vs 0)`);
    prescriptionPassed = false;
    failures++;
  }
  
  if (prescriptionPassed) {
    console.log(`  ✓ PASS: All prescription fields and order preserved`);
  }
}

console.log("");

// Test 5: Determinism
console.log("=== Test 5: Determinism ===");

if (!singleLegExt) {
  console.log("  ✗ FAIL: single-leg-leg-extension not found");
  failures++;
} else {
  const pastKneeInput = buildInput(true, false);
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
  
  if (JSON.stringify(result1) === JSON.stringify(result2)) {
    console.log(`  ✓ PASS: Deterministic replacement`);
  } else {
    console.log(`  ✗ FAIL: Non-deterministic replacement`);
    failures++;
  }
}

console.log("");

console.log("=".repeat(80));
console.log("MUTANT TESTING");
console.log("=".repeat(80));
console.log("");

// Mutant 1: Skip past-knee check
console.log("Testing M1: Skip past-knee check");
const m1File = "src/lib/program/replace-banned-in-planned.ts";
const m1Original = `  if (hasPastKnee && PAST_KNEE_BANNED.has(exerciseSlug)) return true;`;
const m1Mutated = `  // MUTANT: Skip past-knee check`;

let m1Killed = false;
try {
  const content = readFileSync(m1File, "utf-8");
  if (!content.includes(m1Original)) {
    console.log("  ⊘ SKIP: Original pattern not found");
  } else {
    writeFileSync(m1File, content.replace(m1Original, m1Mutated), "utf-8");
    try {
      execSync("npm run test:past-knee-single-leg-ext", { stdio: "pipe" });
      console.log("  ✗ SURVIVED: Mutant not killed");
      failures++;
    } catch {
      console.log("  ✓ KILLED: test:past-knee-single-leg-ext");
      m1Killed = true;
    } finally {
      writeFileSync(m1File, content, "utf-8");
    }
  }
} catch (error) {
  console.log(`  ✗ ERROR: ${error}`);
  failures++;
}

console.log("");

// Mutant 2: Skip jammer check
console.log("Testing M2: Skip jammer check");
const m2Original = `  if (hasAnyKnee && ANY_KNEE_BANNED.has(exerciseSlug)) return true;`;
const m2Mutated = `  // MUTANT: Skip jammer check`;

try {
  const content = readFileSync(m1File, "utf-8");
  if (!content.includes(m2Original)) {
    console.log("  ⊘ SKIP: Original pattern not found");
  } else {
    writeFileSync(m1File, content.replace(m2Original, m2Mutated), "utf-8");
    try {
      execSync("npx tsx scripts/test-replace-banned-in-planned.ts", { stdio: "pipe" });
      console.log("  ✗ SURVIVED: Mutant not killed");
      failures++;
    } catch {
      console.log("  ✓ KILLED: test:replace-banned-in-planned");
    } finally {
      writeFileSync(m1File, content, "utf-8");
    }
  }
} catch (error) {
  console.log(`  ✗ ERROR: ${error}`);
  failures++;
}

console.log("");

// Mutant 3: Non-deterministic ordering
console.log("Testing M3: Non-deterministic ordering");
const m3Original = `    const tieBreakFn = (slug: string) => 
      hashString(\`\${sessionExerciseIdSeed}:\${ex.order_index}:\${slug}\`);`;
const m3Mutated = `    const tieBreakFn = (slug: string) => Math.random();`;

try {
  const content = readFileSync(m1File, "utf-8");
  if (!content.includes(m3Original.split('\n')[0])) {
    console.log("  ⊘ SKIP: Original pattern not found");
  } else {
    writeFileSync(m1File, content.replace(m3Original, m3Mutated), "utf-8");
    try {
      execSync("npx tsx scripts/test-replace-banned-in-planned.ts", { stdio: "pipe" });
      console.log("  ✗ SURVIVED: Mutant not killed");
      failures++;
    } catch {
      console.log("  ✓ KILLED: Determinism test");
    } finally {
      writeFileSync(m1File, content, "utf-8");
    }
  }
} catch (error) {
  console.log(`  ✗ ERROR: ${error}`);
  failures++;
}

console.log("");

console.log("=".repeat(80));
if (failures === 0) {
  console.log("✅ PASSED: All tests and mutants");
  process.exit(0);
} else {
  console.log(`❌ FAILED: ${failures} test(s) failed`);
  process.exit(1);
}
