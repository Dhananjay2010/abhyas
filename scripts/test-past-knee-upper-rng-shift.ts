#!/usr/bin/env npx tsx
/**
 * QA LOW-1: Investigate past-knee Upper/Push/Pull plan differences.
 * 
 * Theory: The past-knee filter in alternatives.ts happens BEFORE the RNG is called,
 * causing the RNG stream to shift for past-knee users compared to non-past-knee users.
 * This affects Upper/Push/Pull accessories even though past-knee exclusions are
 * lower-body focused.
 * 
 * This test compares Upper/Push/Pull plans between no-injury and past-knee users
 * to find differences caused by RNG stream shifts.
 */

import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput } from "../src/lib/program/generate";
import type { CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

const BASE_INPUT_TEMPLATE: Omit<GeneratorInput, "injuries" | "currentInjuryRegions" | "anyKneeInjury"> = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 6,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [
    "00000000-0000-4000-8000-000000000001", // barbell
    "00000000-0000-4000-8000-000000000002", // dumbbell
    "00000000-0000-4000-8000-000000000003", // flat_bench
    "00000000-0000-4000-8000-000000000004", // squat_rack
    "00000000-0000-4000-8000-000000000005", // pull_up_bar
    "00000000-0000-4000-8000-000000000006", // cable_machine
  ],
  catalogue,
  preferredSessionMinutes: 75,
};

console.log("=== QA LOW-1: Upper/Push/Pull Plan Comparison ===\n");

// Test configurations to try
const testConfigs = [
  {
    name: "6-day PPL, full gym",
    daysPerWeek: 6,
    equipmentIds: [
      "00000000-0000-4000-8000-000000000001", // barbell
      "00000000-0000-4000-8000-000000000002", // dumbbell
      "00000000-0000-4000-8000-000000000003", // flat_bench
      "00000000-0000-4000-8000-000000000004", // squat_rack
      "00000000-0000-4000-8000-000000000005", // pull_up_bar
      "00000000-0000-4000-8000-000000000006", // cable_machine
    ],
  },
  {
    name: "4-day Upper/Lower, full gym",
    daysPerWeek: 4,
    equipmentIds: [
      "00000000-0000-4000-8000-000000000001", // barbell
      "00000000-0000-4000-8000-000000000002", // dumbbell
      "00000000-0000-4000-8000-000000000003", // flat_bench
      "00000000-0000-4000-8000-000000000004", // squat_rack
      "00000000-0000-4000-8000-000000000005", // pull_up_bar
      "00000000-0000-4000-8000-000000000006", // cable_machine
    ],
  },
  {
    name: "3-day Full Body, dumbbells only",
    daysPerWeek: 3,
    equipmentIds: [
      "00000000-0000-4000-8000-000000000002", // dumbbell
      "00000000-0000-4000-8000-000000000003", // flat_bench
    ],
  },
  {
    name: "5-day split, full gym",
    daysPerWeek: 5,
    equipmentIds: [
      "00000000-0000-4000-8000-000000000001", // barbell
      "00000000-0000-4000-8000-000000000002", // dumbbell
      "00000000-0000-4000-8000-000000000003", // flat_bench
      "00000000-0000-4000-8000-000000000004", // squat_rack
      "00000000-0000-4000-8000-000000000005", // pull_up_bar
      "00000000-0000-4000-8000-000000000006", // cable_machine
    ],
  },
];

let totalUpperDays = 0;
let totalDifferingDays = 0;

for (const config of testConfigs) {
  console.log(`Testing: ${config.name}`);
  
  // Generate plan without injuries
  const noInjuryInput: GeneratorInput = {
    ...BASE_INPUT_TEMPLATE,
    daysPerWeek: config.daysPerWeek,
    equipmentIds: config.equipmentIds,
    hasAllEquipment: config.equipmentIds.length >= 6,
    catalogue,
    currentInjuryRegions: [],
    anyKneeInjury: false,
  };

  const noInjuryPlan = generateProgram(noInjuryInput);

  // Generate plan with past-knee injury
  const pastKneeInput: GeneratorInput = {
    ...BASE_INPUT_TEMPLATE,
    daysPerWeek: config.daysPerWeek,
    equipmentIds: config.equipmentIds,
    hasAllEquipment: config.equipmentIds.length >= 6,
    catalogue,
    currentInjuryRegions: [],
    anyKneeInjury: true,
  };

  const pastKneePlan = generateProgram(pastKneeInput);

  // Compare Upper/Push/Pull days
  const upperFocusList = ["upper", "push", "pull"];

  let configUpperDays = 0;
  let configDifferingDays = 0;

  for (let dayIndex = 0; dayIndex < noInjuryPlan.days.length; dayIndex++) {
    const noInjuryDay = noInjuryPlan.days[dayIndex];
    const pastKneeDay = pastKneePlan.days[dayIndex];
    
    if (!noInjuryDay || !pastKneeDay) continue;
    if (!upperFocusList.includes(noInjuryDay.focus)) continue;
    
    configUpperDays++;
    
    const noInjuryExercises = noInjuryDay.exercises.map(e => e.slug);
    const pastKneeExercises = pastKneeDay.exercises.map(e => e.slug);
    
    // Check if any exercises differ
    let hasDiff = false;
    for (let i = 0; i < Math.max(noInjuryExercises.length, pastKneeExercises.length); i++) {
      if (noInjuryExercises[i] !== pastKneeExercises[i]) {
        hasDiff = true;
        break;
      }
    }
    
    if (hasDiff) {
      configDifferingDays++;
    }
  }
  
  totalUpperDays += configUpperDays;
  totalDifferingDays += configDifferingDays;
  console.log(`  Upper/Push/Pull days: ${configUpperDays}, with differences: ${configDifferingDays}\n`);
}

console.log(`\n=== Summary ===`);
console.log(`Total Upper/Push/Pull days across all configs: ${totalUpperDays}`);
console.log(`Days with differences: ${totalDifferingDays}`);

if (totalDifferingDays > 0) {
  console.log(`\n⚠ RNG shift detected: ${totalDifferingDays} upper-body days differ between no-injury and past-knee users`);
  console.log(`This confirms QA LOW-1: the past-knee filter in alternatives.ts is called BEFORE`);
  console.log(`the RNG tiebreaker, causing the seeded random stream to shift.`);
} else {
  console.log(`\n✓ No RNG shift detected in Upper/Push/Pull accessories`);
}

console.log(`\n✓ Investigation complete`);

process.exit(0);
