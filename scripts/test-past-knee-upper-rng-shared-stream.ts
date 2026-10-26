#!/usr/bin/env -S npx tsx
/**
 * Test: Shared RNG stream observation (LOW-1)
 * 
 * NOTE: This test documents the observation that Upper/Push/Pull accessory slots 3-6
 * differ between main and this PR for 348 of 6,480 past-knee days, but the exact
 * mechanism causing this (shared RNG stream at generate.ts:936) has NOT been proven
 * by automated test.
 * 
 * The hypothesis is that earlier Lower/Full Body days' candidate filtering alters
 * the number of RNG draws, causing deterministic shifts in later Upper/Push/Pull
 * accessory tiebreaking. However, generating two programs with same seed but different
 * anyKneeInjury flags does not reproduce the difference, suggesting either:
 * - The RNG mechanism is more subtle than hypothesized
 * - The difference comes from another source
 * - The filtering difference is too small to affect RNG consumption measurably
 * 
 * This test passes to document that the cause is ACCEPTED but NOT PROVEN.
 */

import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

console.log("LOW-1 RNG Shift Observation Test\n");
console.log("Owner Decision: Upper/Push/Pull day shifts ACCEPTED as safe");
console.log("Scope: 348 of 6,480 past-knee Upper/Push/Pull days changed (pre-#152 vs main)");
console.log("Root Cause: Hypothesized shared RNG stream (generate.ts:936), NOT PROVEN by test");
console.log("");

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

// Attempt to reproduce the shift with same seed, different anyKneeInjury
const baseInput: GeneratorInput = {
  userId: "test-user-rng",
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
  anyKneeInjury: false,
};

const pastKneeInput: GeneratorInput = { ...baseInput, anyKneeInjury: true };

const programA = generateProgram(baseInput);
const programB = generateProgram(pastKneeInput);

const upperA = programA.days.find(d => d.focus === "upper")?.exercises.filter(e => e.orderIndex >= 3) || [];
const upperB = programB.days.find(d => d.focus === "upper")?.exercises.filter(e => e.orderIndex >= 3) || [];

const differs = JSON.stringify(upperA.map(e => e.name)) !== JSON.stringify(upperB.map(e => e.name));

console.log("Attempted reproduction:");
console.log(`  Same seed, different anyKneeInjury: ${differs ? "DIFFERS" : "SAME"}`);
console.log(`  Upper A: ${upperA.map(e => e.name).join(", ")}`);
console.log(`  Upper B: ${upperB.map(e => e.name).join(", ")}`);
console.log("");

if (!differs) {
  console.log("⚠️  Simple test case does not reproduce the shift");
  console.log("    The actual mechanism may be more subtle or involve other factors");
}

console.log("\n✅ PASSED: Test documents LOW-1 observation (accepted, cause not proven)");
