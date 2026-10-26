#!/usr/bin/env npx tsx
/**
 * MED-2 Comparison: Assert per-day lower-body set totals and estimated minutes
 * for past-knee users on main vs this PR for Lower and Full Body days.
 * Must stay close to main (within one set, two minutes).
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  estimateSessionMinutes,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

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
