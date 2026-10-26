#!/usr/bin/env -S npx tsx
/**
 * Test: Past-knee Lower warmup can select ankle-rock from production warmup.ts
 * 
 * Requirements:
 * - For past-knee users on Lower days with excluded drills, the replacement pool
 *   can include ankle-rock from the kneeSafeLowerDrills list in warmup.ts:157
 * - Fallback logic at warmup.ts:218 also includes ankle-rock
 * 
 * Strategy:
 * - Generate a past-knee Lower program with limited equipment (bodyweight only)
 * - Check that ankle-rock can appear in the warmup mobility drills
 */

import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import type { ProgramInput } from "../src/lib/types";
import { readFileSync } from "node:fs";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const pastKneeInput: ProgramInput = {
  userId: "test-user-past-knee",
  blockNumber: 1,
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  goal: "general_fitness",
  level: "beginner",
  preferredSessionMinutes: 45,
  equipmentIds: [], // bodyweight only
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  injuries: [
    {
      category: "knee",
      side: "left",
      severity: "recovered_from",
      specificName: "Patellar Tendinitis",
      specificUuid: "",
      notes: "",
    },
  ],
  anyKneeInjury: true,
  anyHipInjury: false,
  anyLowerBackInjury: false,
  anyShoulderInjury: false,
  anyElbowInjury: false,
  anyWristInjury: false,
  anyNeckInjury: false,
  anyAnkleInjury: false,
};

console.log("Testing past-knee Lower warmup for ankle-rock...\n");

// Try multiple seeds to find a program with ankle-rock in warmup
let foundAnkleRock = false;
let exampleProgram = null;
let exampleSeed = 0;

for (let seed = 0; seed < 100; seed++) {
  const program = generateProgram(pastKneeInput, seed);
  
  // Find Lower day
  const lowerDay = program.weeks[0].entries.find(e => 
    e.focus === "lower_body" || 
    e.workouts[0]?.blocks[0]?.exercises.some(ex => 
      ["squat", "lunge", "hinge"].includes(ex.movement_pattern)
    )
  );
  
  if (!lowerDay) continue;
  
  // Check mobility drills in warmup
  const warmup = lowerDay.workouts[0]?.blocks.find(b => b.type === "warmup");
  const mobilityDrills = warmup?.drills?.filter(d => d.type === "mobility") || [];
  const haAnkleRock = mobilityDrills.some(d => d.slug === "ankle-rock");
  
  if (hasAnkleRock) {
    foundAnkleRock = true;
    exampleProgram = program;
    exampleSeed = seed;
    break;
  }
}

if (!foundAnkleRock) {
  console.error("❌ FAILED: ankle-rock not found in any past-knee Lower warmup across 100 seeds");
  process.exit(1);
}

// Print the example
const lowerDay = exampleProgram!.weeks[0].entries.find(e => 
  e.focus === "lower_body" ||
  e.workouts[0]?.blocks[0]?.exercises.some(ex => 
    ["squat", "lunge", "hinge"].includes(ex.movement_pattern)
  )
)!;

const warmup = lowerDay.workouts[0]?.blocks.find(b => b.type === "warmup")!;
const mobilityDrills = warmup.drills?.filter(d => d.type === "mobility") || [];

console.log(`✅ Found ankle-rock in seed ${exampleSeed}`);
console.log(`Day: ${lowerDay.label}`);
console.log(`Mobility drills:`);
mobilityDrills.forEach(d => {
  console.log(`  - ${d.slug} (${d.duration_seconds}s)`);
});
console.log("");
console.log("✅ PASSED: ankle-rock is accessible from production warmup.ts");
