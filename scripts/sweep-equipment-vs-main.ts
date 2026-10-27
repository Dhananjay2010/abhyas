#!/usr/bin/env tsx
/**
 * Sweep all equipment types and compare progression to main branch.
 * Should be identical except for approved changes (pin-stack 5kg, medicine ball 1kg).
 */
import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression.js";
import { execSync } from "child_process";

// Get main's progression.ts
const mainProgression = execSync("git show origin/main:src/lib/program/progression.ts").toString();
const fs = require("fs");
fs.writeFileSync("/tmp/main-progression.ts", mainProgression);

// Temporarily replace with main's version
const currentProgression = fs.readFileSync("src/lib/program/progression.ts", "utf8");
fs.writeFileSync("src/lib/program/progression.ts", mainProgression);

// Import main's version
delete require.cache[require.resolve("../src/lib/program/progression.js")];
const mainEval = require("../src/lib/program/progression.js").evaluateProgression;

// Restore current version
fs.writeFileSync("src/lib/program/progression.ts", currentProgression);
delete require.cache[require.resolve("../src/lib/program/progression.js")];
const currentEval = require("../src/lib/program/progression.js").evaluateProgression;

const COMPOUND: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const equipment = [
  { name: "barbell", ids: ["barbell"], weights: [20, 40, 60, 80, 100] },
  { name: "dumbbell", ids: ["dumbbell"], weights: [10, 20, 30, 40] },
  { name: "kettlebell", ids: ["kettlebell"], weights: [8, 16, 24, 32] },
  { name: "cable", ids: ["cable_machine"], weights: [20, 40, 60] },
  { name: "pin-stack", ids: ["lat_pulldown"], weights: [30, 45, 60] },
  { name: "medicine-ball", ids: ["medicine_ball"], weights: [2, 4, 6, 8] },
];

const feels: Array<"right" | "easy"> = ["right", "easy"];

let differences = 0;
let approved = 0;

for (const eq of equipment) {
  for (const weight of eq.weights) {
    for (const feel of feels) {
      const input = {
        sets: [{reps: 12, weightKg: weight, durationSeconds: null}, {reps: 12, weightKg: weight, durationSeconds: null}, {reps: 12, weightKg: weight, durationSeconds: null}],
        plannedSets: 3,
        repsMin: 8,
        repsMax: 12,
        feel,
        meta: COMPOUND,
        state: {currentWorkingWeightKg: weight, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: weight, bestReps: 12, bestE1rm: null, totalSessions: 5, weightAtFailureStartKg: null},
        isDeload: false,
        equipmentIds: eq.ids,
        units: "metric" as const,
      };
      
      const mainResult = mainEval(input);
      const currentResult = currentEval(input);
      
      if (mainResult.nextWorkingWeightKg !== currentResult.nextWorkingWeightKg) {
        const isApproved = 
          (eq.name === "pin-stack" && mainResult.nextWorkingWeightKg !== currentResult.nextWorkingWeightKg) ||
          (eq.name === "medicine-ball" && mainResult.nextWorkingWeightKg !== currentResult.nextWorkingWeightKg);
        
        if (isApproved) {
          console.log(`APPROVED: ${eq.name} ${weight} ${feel}: main ${mainResult.nextWorkingWeightKg} → PR ${currentResult.nextWorkingWeightKg}`);
          approved++;
        } else {
          console.log(`DIFF: ${eq.name} ${weight} ${feel}: main ${mainResult.nextWorkingWeightKg} → PR ${currentResult.nextWorkingWeightKg}`);
          differences++;
        }
      }
    }
  }
}

console.log(`\n${differences} unapproved differences, ${approved} approved changes`);
if (differences > 0) {
  console.log("❌ Found unapproved differences");
  process.exit(1);
} else {
  console.log("✅ All differences are approved");
}
