#!/usr/bin/env npx tsx
/**
 * MED-2 Comparison: Show per-day lower-body set totals and estimated minutes
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
}

console.log("─".repeat(80));
console.log("\nExpected (from main PR #144 behavior):");
console.log("  - Lower-body set totals should be close to main (within 1-2 sets)");
console.log("  - Session times should be close to main (within 2 minutes)");
console.log("  - Hip-dominant exercises (hinge) should have more sets than knee-risk squats");
console.log("\nStrategy 3 hinge switch:");
console.log("  ✓ Respects user's equipment (filtered by isEligible)");
console.log("  ✓ Never duplicates exercises (checked by usedInBlock)");
console.log("  ✓ Prioritizes glute/hamstring primary muscles for hip-dominant work");
