#!/usr/bin/env tsx
/**
 * Count past-knee profiles with knee-risk lifts outside squat slot.
 */

import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import { isKneeRiskForKneeUser } from "../src/lib/program/knee-safety";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";
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
let countWithExplicitKneeContraindication = 0;
let countWithPastKneeExcludedExercise = 0;

for (const spec of pastKneeProfiles) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  
  let foundKneeRiskInAnySlot = false;
  
  for (const day of result.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exData = catalogueById.get(ex.exerciseId);
      if (!exData) continue;
      
      // K1 mutant killer: Check for explicitly knee-contraindicated exercises outside slot 0
      // (slot 0 squat is allowed to have knee contraindication)
      if (ex.orderIndex !== 0 && exData.contraindicated_regions.includes("knee")) {
        countWithExplicitKneeContraindication++;
        console.log(`${spec.id} day ${day.dayIndex}: slot ${ex.orderIndex} has ${ex.name} [EXPLICIT KNEE CONTRAINDICATION]`);
      }
      
      // Mutant 10 killer: Check for past-knee excluded exercises (jumps, etc. - NEVER allowed for past-knee)
      if (isExcludedForPastKnee(exData)) {
        countWithPastKneeExcludedExercise++;
        console.log(`${spec.id} day ${day.dayIndex}: slot ${ex.orderIndex} has ${ex.name} [PAST-KNEE EXCLUDED]`);
      }
      
      // Check if it's a knee-risk lift in ANY slot (including squat slot)
      if (isKneeRiskForKneeUser(exData, true)) {
        // Exception: squat slot (orderIndex 0) is allowed to have knee-risk exercises
        // (e.g., Barbell Squat in slot 0 is OK for past-knee users)
        if (ex.orderIndex !== 0) {
          countWithKneeRiskOutsideSquat++;
          console.log(`${spec.id} day ${day.dayIndex}: slot ${ex.orderIndex} has ${ex.name} [KNEE-RISK outside squat slot]`);
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
console.log(`${countWithExplicitKneeContraindication} of ${pastKneeProfiles.length} past-knee profiles have explicitly knee-contraindicated exercises`);
console.log(`${countWithPastKneeExcludedExercise} of ${pastKneeProfiles.length} past-knee profiles have past-knee excluded exercises (jumps, etc.)`);

if (countWithExplicitKneeContraindication > 0) {
  console.error(`✗ FAIL: Expected 0 explicitly knee-contraindicated exercises (K1 mutant killer)`);
  process.exit(1);
}

if (countWithPastKneeExcludedExercise > 0) {
  console.error(`✗ FAIL: Expected 0 past-knee excluded exercises (Mutant 10 killer: jumps, etc.)`);
  process.exit(1);
}

if (countWithKneeRiskOutsideSquat > 0) {
  console.error(`✗ FAIL: Expected 0 knee-risk lifts outside squat slot`);
  process.exit(1);
}

console.log(`✓ PASS: All past-knee profiles are knee-safe outside squat slot, have no explicit knee contraindications, and no past-knee excluded exercises`);
process.exit(0);
