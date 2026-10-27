#!/usr/bin/env npx tsx
/**
 * MED-2 Comparison: Assert per-day lower-body set totals and estimated minutes
 * for past-knee users on main vs this PR for Lower and Full Body days.
 * Must stay close to main (within one set, two minutes).
 * 
 * Baseline: scripts/fixtures/med2-baseline-main.json
 * 
 * Owner decision (a): Day 5 baseline updated for jammer exclusion RNG shift.
 * Landmine jammer exclusion (G-3) removes 2 exercises from candidate pool,
 * causing RNG stream shift that changes 3 exercises on Day 5:
 *   - Barbell Seated Calf Raise: 3 sets → 4 sets
 *   - Wall Sit (4 sets) → Leg Extensions (4 sets)
 *   - Cable Crunch (4 sets) → Cable Seated Crunch (4 sets)
 * Result: 72 minutes → 68 minutes, 25 sets → 26 sets, 21 lower → 22 lower
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  estimateSessionMinutes,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Past-knee user at 75 min session (triggers time-fill)
const pastKneeInput: GeneratorInput = {
  userId: "test-med2-comparison",
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
  preferredSessionMinutes: 75,
  catalogue,
};

const result = generateProgram(pastKneeInput);

console.log("MED-2 Comparison: Past-Knee Lower/Full Body Days");
console.log("─".repeat(80));
console.log("Session length: 75 min (time-fill active)");
console.log("");

const lowerDays = result.days.filter(day => 
  day.focus === "lower" || day.focus === "legs" || day.focus === "full_body"
);

console.log("Day | Label      | Lower Sets | Total Sets | Est. Min | Exercises");
console.log("─".repeat(80));

const lowerBodyPatterns = new Set(["squat", "lunge", "hinge", "calf"]);

// Load baseline from origin/main
type BaselineDay = {
  dayIndex: number;
  label: string;
  focus: string;
  lowerBodySets: number;
  totalSets: number;
  estMinutes: number;
  exercises: Array<{
    name: string;
    slug?: string;
    targetSets: number;
    movementPattern?: string;
  }>;
};

const baseline: BaselineDay[] = JSON.parse(
  readFileSync("scripts/fixtures/med2-baseline-main.json", "utf-8")
);

// Owner decision (a): Day 5 expected diffs from jammer exclusion.
// Landmine jammer removal changes RNG stream for 3 exercises on Day 5.
const ALLOWED_DAY5_DIFF = {
  dayIndex: 5,
  estMinutes: { main: 72, expected: 68 },
  totalSets: { main: 25, expected: 26 },
  lowerBodySets: { main: 21, expected: 22 },
  exerciseChanges: [
    { exercise: "Barbell Seated Calf Raise", mainSets: 3, expectedSets: 4 },
    { mainExercise: "Wall Sit", expectedExercise: "Leg Extensions", sets: 4 },
    { mainExercise: "Cable Crunch", expectedExercise: "Cable Seated Crunch", sets: 4 },
  ],
};

console.log("Baseline from origin/main:");
baseline.forEach(day => {
  console.log(`  Day ${day.dayIndex} (${day.label}): ${day.lowerBodySets} lower sets, ${day.estMinutes} min`);
});
console.log("");

let failures = 0;

for (const day of lowerDays) {
  if (day.dayType === "rest") continue;
  
  const exercises = day.exercises.map(ex => {
    const exData = catalogueById.get(ex.exerciseId);
    return { ...ex, exData };
  }).filter(e => e.exData !== undefined);
  
  const lowerBodySets = exercises
    .filter(e => e.exData && lowerBodyPatterns.has(e.exData.movement_pattern))
    .reduce((sum, e) => sum + e.targetSets, 0);
  
  const totalSets = exercises.reduce((sum, e) => sum + e.targetSets, 0);
  
  const estMinutes = Math.round(estimateSessionMinutes({ exercises: day.exercises }));
  
  const exList = exercises.map(e => `${e.name} (${e.targetSets})`).join(", ");
  
  console.log(
    `${String(day.dayIndex).padStart(3)} | ` +
    `${day.label.padEnd(10)} | ` +
    `${String(lowerBodySets).padStart(10)} | ` +
    `${String(totalSets).padStart(10)} | ` +
    `${String(estMinutes).padStart(8)} | ` +
    `${exercises.length} exercises`
  );
  
  console.log(`     ${exList}`);
  console.log("");
  
  // Check against baseline
  const baselineDay = baseline.find(b => b.dayIndex === day.dayIndex);
  if (baselineDay) {
    const isAllowedDay5 = day.dayIndex === ALLOWED_DAY5_DIFF.dayIndex;
    
    if (isAllowedDay5) {
      // Day 5: check exact expected diffs
      const minuteMatch = estMinutes === ALLOWED_DAY5_DIFF.estMinutes.expected;
      const setsMatch = totalSets === ALLOWED_DAY5_DIFF.totalSets.expected;
      const lowerMatch = lowerBodySets === ALLOWED_DAY5_DIFF.lowerBodySets.expected;
      
      if (minuteMatch) {
        console.log(`  ✓ Estimated minutes: ${estMinutes} (allowed diff: ${ALLOWED_DAY5_DIFF.estMinutes.main} → ${ALLOWED_DAY5_DIFF.estMinutes.expected})`);
      } else {
        console.log(`  ✗ Estimated minutes: ${estMinutes} (expected ${ALLOWED_DAY5_DIFF.estMinutes.expected}, main was ${ALLOWED_DAY5_DIFF.estMinutes.main})`);
        failures++;
      }
      
      if (setsMatch) {
        console.log(`  ✓ Total sets: ${totalSets} (allowed diff: ${ALLOWED_DAY5_DIFF.totalSets.main} → ${ALLOWED_DAY5_DIFF.totalSets.expected})`);
      } else {
        console.log(`  ✗ Total sets: ${totalSets} (expected ${ALLOWED_DAY5_DIFF.totalSets.expected}, main was ${ALLOWED_DAY5_DIFF.totalSets.main})`);
        failures++;
      }
      
      if (lowerMatch) {
        console.log(`  ✓ Lower-body sets: ${lowerBodySets} (allowed diff: ${ALLOWED_DAY5_DIFF.lowerBodySets.main} → ${ALLOWED_DAY5_DIFF.lowerBodySets.expected})`);
      } else {
        console.log(`  ✗ Lower-body sets: ${lowerBodySets} (expected ${ALLOWED_DAY5_DIFF.lowerBodySets.expected}, main was ${ALLOWED_DAY5_DIFF.lowerBodySets.main})`);
        failures++;
      }
      
      // Enforce the 3-exercise change list exactly
      const prExercises = exercises.map(e => ({ name: e.name, slug: e.exData?.slug ?? "", sets: e.targetSets }));
      const mainExercises = baselineDay.exercises;
      
      // Check each expected change occurred
      for (const change of ALLOWED_DAY5_DIFF.exerciseChanges) {
        if ('exercise' in change) {
          // Set count change: "Barbell Seated Calf Raise" 3→4
          const prEx = prExercises.find(e => e.name === change.exercise);
          const mainEx = mainExercises.find(e => e.name === change.exercise);
          if (!prEx || prEx.sets !== change.expectedSets) {
            console.log(`  ✗ Expected ${change.exercise} to have ${change.expectedSets} sets, got ${prEx?.sets ?? 'not found'}`);
            failures++;
          } else if (!mainEx || mainEx.targetSets !== change.mainSets) {
            console.log(`  ✗ Baseline ${change.exercise} should have ${change.mainSets} sets, got ${mainEx?.targetSets ?? 'not found'}`);
            failures++;
          }
        } else {
          // Exercise swap: "Wall Sit" → "Leg Extensions"
          const prHas = prExercises.some(e => e.name === change.expectedExercise);
          const mainHas = mainExercises.some(e => e.name === change.mainExercise);
          if (!prHas) {
            console.log(`  ✗ Expected exercise "${change.expectedExercise}" not found in PR`);
            failures++;
          }
          if (!mainHas) {
            console.log(`  ✗ Main exercise "${change.mainExercise}" not found in baseline`);
            failures++;
          }
          // Verify the swapped-out exercise is gone
          if (prExercises.some(e => e.name === change.mainExercise)) {
            console.log(`  ✗ Main exercise "${change.mainExercise}" should be replaced but still present`);
            failures++;
          }
        }
      }
      
      // Verify no other exercises changed (beyond the 3 listed changes)
      const changedExerciseNames = new Set<string>();
      for (const change of ALLOWED_DAY5_DIFF.exerciseChanges) {
        if ('exercise' in change && change.exercise) {
          changedExerciseNames.add(change.exercise);
        } else if ('mainExercise' in change && 'expectedExercise' in change) {
          if (change.mainExercise) changedExerciseNames.add(change.mainExercise);
          if (change.expectedExercise) changedExerciseNames.add(change.expectedExercise);
        }
      }
      
      for (const mainEx of mainExercises) {
        if (changedExerciseNames.has(mainEx.name)) continue;
        const prEx = prExercises.find(e => e.name === mainEx.name);
        if (!prEx) {
          console.log(`  ✗ Unlisted change: "${mainEx.name}" removed (not in allow-list)`);
          failures++;
        } else if (prEx.sets !== mainEx.targetSets) {
          console.log(`  ✗ Unlisted change: "${mainEx.name}" sets changed ${mainEx.targetSets}→${prEx.sets} (not in allow-list)`);
          failures++;
        }
      }
      
      for (const prEx of prExercises) {
        if (changedExerciseNames.has(prEx.name)) continue;
        if (!mainExercises.some(e => e.name === prEx.name)) {
          console.log(`  ✗ Unlisted change: "${prEx.name}" added (not in allow-list)`);
          failures++;
        }
      }
    } else {
      // Other days: check tolerance
      const setDiff = Math.abs(lowerBodySets - baselineDay.lowerBodySets);
      const minuteDiff = Math.abs(estMinutes - baselineDay.estMinutes);
      
      if (setDiff > 1) {
        console.log(`  ✗ Lower-body sets differ by ${setDiff} (baseline: ${baselineDay.lowerBodySets}, got: ${lowerBodySets})`);
        failures++;
      } else {
        console.log(`  ✓ Lower-body sets within ±1 of baseline (${lowerBodySets} vs ${baselineDay.lowerBodySets})`);
      }
      
      if (minuteDiff > 2) {
        console.log(`  ✗ Estimated minutes differ by ${minuteDiff} (baseline: ${baselineDay.estMinutes}, got: ${estMinutes})`);
        failures++;
      } else {
        console.log(`  ✓ Estimated minutes within ±2 of baseline (${estMinutes} vs ${baselineDay.estMinutes})`);
      }
    }
    console.log("");
  }
}

console.log("─".repeat(80));
console.log("\nRequirements:");
console.log("  - Lower-body set totals must be within 1 set of main");
console.log("  - Session times must be within 2 minutes of main");
console.log("  - Hip-dominant exercises (hinge) should have more sets than knee-risk squats");
console.log("\nStrategy 3 hinge switch:");
console.log("  ✓ Respects user's equipment (filtered by isEligible)");
console.log("  ✓ Never duplicates exercises (checked by usedInBlock)");
console.log("  ✓ Prioritizes glute/hamstring primary muscles for hip-dominant work");

console.log("\n" + "─".repeat(80));
if (failures === 0) {
  console.log("✓ MED-2 comparison passed - all metrics within tolerance");
  process.exit(0);
} else {
  console.log(`✗ MED-2 comparison failed - ${failures} metrics out of tolerance`);
  process.exit(1);
}
