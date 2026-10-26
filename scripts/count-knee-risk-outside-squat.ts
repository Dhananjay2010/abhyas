#!/usr/bin/env tsx
/**
 * Count past-knee profiles with knee-risk lifts outside squat slot.
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import { KNEE_PROFILES, makeGeneratorInput } from "./knee-volume-grid";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

// Filter to past-knee profiles only
const pastKneeProfiles = KNEE_PROFILES.filter(spec =>
  spec.injuries.some(i => i.body_region === "knee" && i.severity === "past")
);

let countWithKneeRiskOutsideSquat = 0;
let countWithKneeRiskInAnySlot = 0;

for (const spec of pastKneeProfiles) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  
  let foundKneeRiskOutsideSquat = false;
  let foundKneeRiskInAnySlot = false;
  
  for (const day of result.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exData = catalogueById.get(ex.exerciseId);
      if (!exData) continue;
      
      // Check if it's a knee-risk lift in ANY slot (including squat slot)
      if (isKneeRiskForKneeUser(exData, true)) {
        // Exception: squat slot (orderIndex 0) is allowed to have knee-risk exercises
        // (e.g., Barbell Squat in slot 0 is OK for past-knee users)
        if (ex.orderIndex !== 0) {
          if (!foundKneeRiskOutsideSquat) {
            countWithKneeRiskOutsideSquat++;
            console.log(`${spec.id} day ${day.dayIndex}: slot ${ex.orderIndex} has ${ex.name} [KNEE-RISK outside squat slot]`);
            foundKneeRiskOutsideSquat = true;
          }
        }
        
        // Also count ANY knee-risk (even in slot 0) for comprehensive check
        if (!foundKneeRiskInAnySlot) {
          foundKneeRiskInAnySlot = true;
        }
      }
    }
  }
  
  if (foundKneeRiskInAnySlot) {
    countWithKneeRiskInAnySlot++;
  }
}

console.log(`\n${countWithKneeRiskOutsideSquat} of ${pastKneeProfiles.length} past-knee profiles have knee-risk lifts outside squat slot`);
console.log(`${countWithKneeRiskInAnySlot} of ${pastKneeProfiles.length} past-knee profiles have knee-risk lifts in any slot`);

if (countWithKneeRiskOutsideSquat > 0) {
  console.error(`✗ FAIL: Expected 0 knee-risk lifts outside squat slot`);
  process.exit(1);
} else {
  console.log(`✓ PASS: All past-knee profiles are knee-safe outside squat slot`);
  process.exit(0);
}
