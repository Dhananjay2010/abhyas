#!/usr/bin/env npx tsx
/**
 * Reproduce the "before" state from main 613330ac.
 * Uses dynamic require to import from /tmp/main worktree.
 */

import { readFileSync } from "fs";

// Dynamic require from /tmp/main
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateProgram } = require("/tmp/main/src/lib/program/generate");
const catalogue = JSON.parse(
  readFileSync("/tmp/main/scripts/fixtures/catalogue.json", "utf-8")
);

// QA profile pk: muscle_gain, intermediate, weights, 4 days, 60 min, all equipment, past knee
const pkInput = {
  userId: "b6b86f30-b85a-4b81-afa1-8766d5ca231c",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 36,
  bmi: 25,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 60,
  catalogue,
};

// QA profile pkb: same but beginner
const pkbInput = {
  ...pkInput,
  level: "beginner",
};

console.log("=== BEFORE (main 613330ac) ===\n");

console.log("pk (intermediate, past knee):");
const pkResult = generateProgram(pkInput);
const pkLower = pkResult.days.find((d: {focus?: string}) => d.focus === "lower");
if (pkLower) {
  console.log(`Day ${(pkLower as {dayIndex: number}).dayIndex + 1} (Lower):`);
  (pkLower as {exercises: unknown[]}).exercises.forEach((ex: unknown) => {
    const exTyped = ex as {exerciseId: string; name: string; orderIndex: number; targetSets: number; targetRepsMin: number; targetRepsMax: number};
    const exData = catalogue.find((e: {id: string; contraindicated_regions?: string[]}) => e.id === exTyped.exerciseId);
    const kneeTag = exData?.contraindicated_regions?.includes("knee") ? " [K]" : "";
    console.log(`  ${exTyped.orderIndex}: ${exTyped.name}${kneeTag} ${exTyped.targetSets}×${exTyped.targetRepsMin}-${exTyped.targetRepsMax}`);
  });
}

console.log("\npkb (beginner, past knee):");
const pkbResult = generateProgram(pkbInput);
const pkbLower = pkbResult.days.find((d: {focus?: string}) => d.focus === "lower");
if (pkbLower) {
  console.log(`Day ${(pkbLower as {dayIndex: number}).dayIndex + 1} (Lower):`);
  (pkbLower as {exercises: unknown[]}).exercises.forEach((ex: unknown) => {
    const exTyped = ex as {exerciseId: string; name: string; orderIndex: number; targetSets: number; targetRepsMin: number; targetRepsMax: number};
    const exData = catalogue.find((e: {id: string; contraindicated_regions?: string[]}) => e.id === exTyped.exerciseId);
    const kneeTag = exData?.contraindicated_regions?.includes("knee") ? " [K]" : "";
    console.log(`  ${exTyped.orderIndex}: ${exTyped.name}${kneeTag} ${exTyped.targetSets}×${exTyped.targetRepsMin}-${exTyped.targetRepsMax}`);
  });
}
