#!/usr/bin/env npx tsx
/**
 * Test MED-2: Past-knee squat main lifts get no time-fill sets.
 * Freed time goes to knee-safe hip-dominant work.
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { prescribe } from "../src/lib/program/prescription";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

let failures = 0;

function fail(message: string) {
  console.error(`FAIL: ${message}`);
  failures++;
}

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log("Testing MED-2: Past-knee time-fill prioritizes hip-dominant work");
console.log("─".repeat(60));

// Test with a past-knee user at 75 min session (which should trigger time-fill)
const pastKneeInput: GeneratorInput = {
  userId: "test-med2-user",
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
  preferredSessionMinutes: 75, // Long session to trigger time-fill
  catalogue,
};

const result = generateProgram(pastKneeInput);

// Focus on Lower days (should be days 2 and 4 in an Upper/Lower split)
const lowerDays = result.days.filter(day => 
  day.focus === "lower" || day.focus === "legs" || day.focus === "full_body"
);

console.log(`\nFound ${lowerDays.length} lower/legs/full days`);

for (const day of lowerDays) {
  if (day.dayType === "rest") continue;
  
  console.log(`\nDay ${day.dayIndex} (${day.label}):`);
  
  const exercises = day.exercises.map(ex => {
    const exData = catalogueById.get(ex.exerciseId);
    return { ...ex, exData };
  }).filter(e => e.exData !== undefined);
  
  // Check 1: Past-knee knee-risk exercises in main slots should not exceed base prescription
  const mainSlotKneeRisk = exercises
    .filter(e => e.orderIndex < 4)
    .filter(e => e.exData && isKneeRiskForKneeUser(e.exData, true));
  
  for (const ex of mainSlotKneeRisk) {
    if (!ex.exData) continue;
    
    const basePrescription = prescribe(
      pastKneeInput.goal,
      pastKneeInput.level,
      ex.exData.mechanic === "isolation",
      ex.exData.metric ?? "reps",
      60, // Base 60-min prescription
      ex.exData.equipment_ids
    );
    
    // At 75 min, the exercise should not have more sets than the 60-min prescription
    // (time-fill should not add to knee-risk exercises)
    check(
      `  ${ex.name} (main slot): no time-fill sets (${ex.targetSets} sets, base ${basePrescription.sets})`,
      ex.targetSets <= basePrescription.sets,
      ex.targetSets > basePrescription.sets ? `Has ${ex.targetSets - basePrescription.sets} extra sets` : ""
    );
  }
  
  // Check 2: Hip-dominant work should be present
  const hipDominantPatterns = exercises.filter(e => 
    e.exData?.movement_pattern === "hinge" && !isKneeRiskForKneeUser(e.exData, true)
  );
  
  check(
    `  Hip-dominant work present`,
    hipDominantPatterns.length > 0,
    hipDominantPatterns.length === 0 ? "No hip-dominant exercises found" : `${hipDominantPatterns.length} hinge exercises`
  );
  
  // Check 3: Total lower-body work should be reasonable (at least 3 lower-body exercises)
  const lowerBodyExercises = exercises.filter(e => {
    const pattern = e.exData?.movement_pattern;
    return pattern === "squat" || pattern === "lunge" || pattern === "hinge" || pattern === "calf";
  });
  
  check(
    `  Adequate lower-body volume`,
    lowerBodyExercises.length >= 3,
    `${lowerBodyExercises.length} lower-body exercises`
  );
  
  // Log exercises for inspection
  console.log(`  Exercises (${exercises.length} total):`);
  for (const ex of exercises) {
    const isKneeRisk = ex.exData ? isKneeRiskForKneeUser(ex.exData, true) : false;
    const riskMarker = isKneeRisk ? "[KNEE-RISK]" : "";
    console.log(`    ${ex.orderIndex}. ${ex.name} (${ex.exData?.movement_pattern}) - ${ex.targetSets} sets ${riskMarker}`);
  }
}

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ All MED-2 checks passed");
  process.exit(0);
} else {
  console.log(`✗ ${failures} checks failed`);
  process.exit(1);
}
