/**
 * Injury Regions Test (PR #73 Run 20)
 * 
 * Verifies that injury region filtering works correctly:
 * - Exercises contraindicated for current injuries are excluded
 * - anyKneeInjury flag properly excludes high-impact and unsafe exercises
 */

import { readFileSync } from "node:fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

console.log("Injury Regions Test");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const byId = new Map(catalogue.map(e => [e.id, e]));

// Test: Current knee injury excludes knee-contraindicated exercises
const kneeInput: GeneratorInput = {
  userId: "test-knee-injury",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

const kneePlan = generateProgram(kneeInput);
const kneeContraindicated = kneePlan.days.flatMap(day =>
  day.exercises.filter(ex => {
    const e = byId.get(ex.exerciseId);
    return e?.contraindicated_regions.includes("knee");
  })
);

check(
  "Current knee injury: no knee-contraindicated exercises",
  kneeContraindicated.length === 0,
  kneeContraindicated.length > 0
    ? `Found ${kneeContraindicated.length} knee-contraindicated exercises`
    : undefined
);

// Test: Current shoulder injury excludes shoulder-contraindicated exercises
const shoulderInput: GeneratorInput = {
  userId: "test-shoulder-injury",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["shoulder"],
  anyKneeInjury: false,
  preferredSessionMinutes: 60,
  catalogue,
};

const shoulderPlan = generateProgram(shoulderInput);
const shoulderContraindicated = shoulderPlan.days.flatMap(day =>
  day.exercises.filter(ex => {
    const e = byId.get(ex.exerciseId);
    return e?.contraindicated_regions.includes("shoulder");
  })
);

check(
  "Current shoulder injury: no shoulder-contraindicated exercises",
  shoulderContraindicated.length === 0,
  shoulderContraindicated.length > 0
    ? `Found ${shoulderContraindicated.length} shoulder-contraindicated exercises`
    : undefined
);

console.log("");
console.log("─".repeat(60));

if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log("PASSED: All injury region checks passed");
  process.exit(0);
}
