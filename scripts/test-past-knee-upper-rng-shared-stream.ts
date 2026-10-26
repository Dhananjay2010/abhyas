#!/usr/bin/env -S npx tsx
/**
 * Test: Shared RNG stream causes deterministic cross-day dependencies
 * 
 * This test proves that the RNG stream at generate.ts:936 is shared across all days
 * in a multi-day block. Earlier days' RNG draws (e.g. Lower day candidate filtering)
 * deterministically affect later days' tiebreaking (e.g. Upper accessory picks).
 * 
 * Strategy:
 * - Generate two programs with different Lower day candidate pools (one filtered)
 * - Same seed, same inputs, but different Lower exercise availability
 * - Verify that Upper/Push/Pull accessories differ between them
 * 
 * This is NOT a print-only test - it asserts behavioral differences.
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import type { ProgramInput } from "../src/lib/types";

console.log("Testing shared RNG stream cross-day dependencies...\n");

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

// Base input: 4-day program with Upper/Lower split
const baseInput: ProgramInput = {
  userId: "test-user-base",
  blockNumber: 1,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  goal: "muscle_gain",
  level: "intermediate",
  preferredSessionMinutes: 60,
  equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell"],
  catalogue,
  hasAllEquipment: false,
  primaryTrack: "weights",
  age: 36,
  bmi: 22.5,
  currentInjuryRegions: [],
  injuries: [],
  anyKneeInjury: false,
  anyHipInjury: false,
  anyLowerBackInjury: false,
  anyShoulderInjury: false,
  anyElbowInjury: false,
  anyWristInjury: false,
  anyNeckInjury: false,
  anyAnkleInjury: false,
};

// Generate with past-knee (filters Lower candidates differently)
const pastKneeInput: ProgramInput = {
  ...baseInput,
  userId: "test-user-past-knee",
  currentInjuryRegions: [],
  injuries: [{
    category: "knee",
    side: "both",
    severity: "recovered_from",
    specificName: "Patellar Tendinitis",
    specificUuid: "",
    notes: "",
  }],
  anyKneeInjury: true,
};

const seed = 42;
const programA = generateProgram(baseInput, seed);
const programB = generateProgram(pastKneeInput, seed);

console.log("Program A days:", programA.days.map(d => `${d.dayIndex}:${d.focus}`).join(", "));
console.log("Program B days:", programB.days.map(d => `${d.dayIndex}:${d.focus}`).join(", "));
console.log("");

// Find Upper/Push/Pull days in each program
function getAccessorySlots(program: typeof programA, dayFocus: "upper" | "lower" | "push" | "pull") {
  const day = program.days.find(d => d.focus === dayFocus);
  if (!day || day.dayType === "rest") return [];
  
  // Accessory slots are typically 3-6 (after compound lifts in slots 0-2)
  return day.exercises
    .filter(ex => ex.orderIndex >= 3)
    .map(ex => ({ name: ex.name, orderIndex: ex.orderIndex }));
}

const upperA = getAccessorySlots(programA, "upper");
const upperB = getAccessorySlots(programB, "upper");
const lowerA = getAccessorySlots(programA, "lower");
const lowerB = getAccessorySlots(programB, "lower");

console.log("Upper A:", upperA.map(s => s.name).join(", "));
console.log("Upper B:", upperB.map(s => s.name).join(", "));
console.log("Lower A:", lowerA.map(s => s.name).join(", "));
console.log("Lower B:", lowerB.map(s => s.name).join(", "));
console.log("");

// Check if any Upper accessories differ
let foundDifference = false;
const diffs: string[] = [];

function compareDays(dayName: string, slotsA: typeof upperA, slotsB: typeof upperB) {
  if (slotsA.length !== slotsB.length) {
    foundDifference = true;
    diffs.push(`${dayName}: different accessory counts (${slotsA.length} vs ${slotsB.length})`);
    return;
  }
  
  for (let i = 0; i < slotsA.length; i++) {
    if (slotsA[i].name !== slotsB[i].name) {
      foundDifference = true;
      diffs.push(`${dayName} slot ${slotsA[i].orderIndex}: ${slotsA[i].name} → ${slotsB[i].name}`);
    }
  }
}

compareDays("Upper", upperA, upperB);

if (!foundDifference) {
  console.error("❌ FAILED: No Upper day differences found despite different Lower filtering");
  console.error("This suggests the RNG stream is NOT shared across days.");
  process.exit(1);
}

console.log("✅ Shared RNG stream verified:");
console.log("Lower day filtering (past-knee) affects Upper day accessory picks\n");
console.log("Differences found:");
diffs.forEach(d => console.log(`  - ${d}`));

console.log("\n✅ PASSED: Shared RNG stream causes deterministic cross-day dependencies");
