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

for (const spec of pastKneeProfiles) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  
  for (const day of result.days) {
    if (day.dayType === "rest") continue;
    
    for (const ex of day.exercises) {
      const exData = catalogueById.get(ex.exerciseId);
      if (!exData) continue;
      
      // Check if it's a knee-risk lift outside slot 0 (squat slot)
      if (ex.orderIndex !== 0 && isKneeRiskForKneeUser(exData, true)) {
        countWithKneeRiskOutsideSquat++;
        console.log(`${spec.id} day ${day.dayIndex}: slot ${ex.orderIndex} has ${ex.name} [KNEE-RISK]`);
        break;  // Count profile once
      }
    }
    if (countWithKneeRiskOutsideSquat > 0) break;  // Move to next profile
  }
}

console.log(`\n${countWithKneeRiskOutsideSquat} of ${pastKneeProfiles.length} past-knee profiles have knee-risk lifts outside squat slot`);

if (countWithKneeRiskOutsideSquat > 0) {
  console.error(`✗ FAIL: Expected 0`);
  process.exit(1);
} else {
  console.log(`✓ PASS: All past-knee profiles are knee-safe outside squat slot`);
  process.exit(0);
}
