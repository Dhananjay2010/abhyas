#!/usr/bin/env tsx
/**
 * No-equipment sweep test: verify that without equipment, behavior is identical to main.
 * 
 * Compares at least 50k cases across all mechanics, feels, miss counts, deload states,
 * and on/off-grid weights against main's evaluateProgression.
 * 
 * Loads main's version by writing `git show origin/main:src/lib/program/progression.ts`
 * to a temp module at test time.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";

const MECHANICS: Array<"compound" | "isolation"> = ["compound", "isolation"];
const PATTERNS: Array<"horizontal_press" | "vertical_pull" | "squat" | "hinge" | "biceps"> = [
  "horizontal_press",
  "vertical_pull",
  "squat",
  "hinge",
  "biceps",
];
const FEELS: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const MISS_COUNTS = [0, 1, 2, 3];
const DELOADS = [false, true];

// Weights: on-grid (2.5 kg multiples) and off-grid
const WEIGHTS: number[] = [];
for (let w = 0; w <= 200; w += 2.5) {
  WEIGHTS.push(w);
  if (w > 0 && w < 200) {
    WEIGHTS.push(w + 1.25); // off-grid
  }
}

let mainEvaluateProgression: typeof evaluateProgression;

// Load main's version
try {
  const mainSource = execSync("git show origin/main:src/lib/program/progression.ts", { encoding: "utf-8" });
  const tempFile = path.join("/tmp", `progression-main-${Date.now()}.ts`);
  fs.writeFileSync(tempFile, mainSource);
  
  // Dynamic import
  const mainModule = await import(tempFile);
  mainEvaluateProgression = mainModule.evaluateProgression;
  
  // Clean up
  fs.unlinkSync(tempFile);
  console.log("✓ Loaded main's evaluateProgression");
} catch (error) {
  console.error("Failed to load main's version. Ensure git history is available.");
  console.error(error);
  process.exit(1);
}

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

let caseCount = 0;
let diffCount = 0;

console.log("\n=== No-Equipment Sweep ===");
console.log("Comparing against main's evaluateProgression...\n");

for (const mechanic of MECHANICS) {
  for (const pattern of PATTERNS) {
    for (const feel of FEELS) {
      for (const missCount of MISS_COUNTS) {
        for (const isDeload of DELOADS) {
          for (const weight of WEIGHTS) {
            if (weight === 0 && missCount > 0) continue; // Skip bodyweight misses for simplicity
            
            const meta: ExerciseMeta = {
              mechanic,
              metric: "reps",
              movementPattern: pattern,
              isBodyweight: weight === 0,
              progressionChain: weight === 0 ? "push" : null,
              progressionRank: weight === 0 ? 1 : null,
            };
            
            const state = fresh({
              currentWorkingWeightKg: weight === 0 ? null : weight,
              consecutiveFailures: missCount,
            });
            
            // Missed sets (10 reps out of 12 target)
            const loggedSets = sets(4, 10, weight === 0 ? null : weight);
            
            const input = {
              sets: loggedSets,
              plannedSets: 4,
              repsMin: 8,
              repsMax: 12,
              feel,
              meta,
              state,
              isDeload,
              // NO equipment info
              equipmentIds: undefined,
              unit: undefined,
            };
            
            const branchResult = evaluateProgression(input);
            const mainResult = mainEvaluateProgression(input);
            
            caseCount++;
            
            // Compare key fields
            const weightMatch = branchResult.nextWorkingWeightKg === mainResult.nextWorkingWeightKg;
            const repsMatch = branchResult.nextTargetReps === mainResult.nextTargetReps;
            const failuresMatch = branchResult.consecutiveFailures === mainResult.consecutiveFailures;
            const outcomeMatch = branchResult.outcome === mainResult.outcome;
            
            if (!weightMatch || !repsMatch || !failuresMatch || !outcomeMatch) {
              diffCount++;
              console.log(`DIFF: mechanic=${mechanic} pattern=${pattern} feel=${feel} missCount=${missCount} deload=${isDeload} weight=${weight}`);
              console.log(`  Main:   ${JSON.stringify({ nextWorkingWeightKg: mainResult.nextWorkingWeightKg, nextTargetReps: mainResult.nextTargetReps, consecutiveFailures: mainResult.consecutiveFailures, outcome: mainResult.outcome })}`);
              console.log(`  Branch: ${JSON.stringify({ nextWorkingWeightKg: branchResult.nextWorkingWeightKg, nextTargetReps: branchResult.nextTargetReps, consecutiveFailures: branchResult.consecutiveFailures, outcome: branchResult.outcome })}`);
            }
            
            if (caseCount % 10000 === 0) {
              process.stdout.write(`\r  Tested ${caseCount} cases, ${diffCount} differences...`);
            }
          }
        }
      }
    }
  }
}

console.log(`\n\n=== Results ===`);
console.log(`Total cases tested: ${caseCount}`);
console.log(`Differences found: ${diffCount}`);

if (diffCount > 0) {
  console.error(`\n❌ FAIL: Found ${diffCount} differences from main (expected 0)`);
  process.exit(1);
}

console.log(`\n✅ PASS: All ${caseCount} no-equipment cases match main exactly`);
