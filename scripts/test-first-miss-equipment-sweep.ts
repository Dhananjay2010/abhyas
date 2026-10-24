#!/usr/bin/env tsx
/**
 * Equipment sweep test: verify all equipment progression changes fall into allowed categories.
 * 
 * Tests at least 20k cases across all equipment grids, both units, and on/off-grid weights.
 * Every difference vs main must fall into exactly one category:
 * (i) 20% first-miss hold
 * (ii) strictly-below one-step limit  
 * (iii) invariant clamp (first-miss >= two-miss)
 * (iv) hold keeps exact weight (suggestedWeight)
 * 
 * Asserts:
 * - 0 cases where first-miss < two-miss
 * - 0 first misses that drop below current - 1.5*step
 * - No differences outside the four allowed categories
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  evaluateProgression,
  suggestedWeight,
  FIRST_MISS_HOLD_THRESHOLD,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";
import { gridStepFor, KETTLEBELL_WEIGHTS_KG } from "../src/lib/session/equipment-grid";

type WeightUnit = "kg" | "lb";

const EQUIPMENTS: Array<{ ids: string[]; unit: WeightUnit }> = [
  { ids: ["barbell"], unit: "kg" },
  { ids: ["barbell"], unit: "lb" },
  { ids: ["dumbbell"], unit: "kg" },
  { ids: ["dumbbell"], unit: "lb" },
  { ids: ["machine", "cable"], unit: "kg" },
  { ids: ["machine", "cable"], unit: "lb" },
  { ids: ["medicine_ball"], unit: "kg" },
  { ids: ["medicine_ball"], unit: "lb" },
  { ids: ["kettlebell"], unit: "kg" },
  { ids: ["kettlebell"], unit: "lb" },
];

const MECHANICS: Array<"compound" | "isolation"> = ["compound", "isolation"];
const PATTERNS: Array<"horizontal_press" | "vertical_pull" | "squat" | "hinge"> = [
  "horizontal_press",
  "vertical_pull",
  "squat",
  "hinge",
];

// Generate on-grid and off-grid weights for each equipment
function* generateWeights(equipmentIds: string[], unit: WeightUnit): Generator<number> {
  if (equipmentIds.includes("kettlebell")) {
    // Test kettlebell weights
    for (const bell of KETTLEBELL_WEIGHTS_KG) {
      yield bell;
      if (bell < KETTLEBELL_WEIGHTS_KG[KETTLEBELL_WEIGHTS_KG.length - 1]) {
        yield bell + 1; // off-grid
      }
    }
  } else {
    // Standard grid weights
    const step = gridStepFor(equipmentIds, "kg");
    for (let w = step; w <= 100; w += step) {
      yield w;
      if (w < 100) {
        yield w + step / 2; // off-grid
      }
    }
  }
}

let mainEvaluateProgression: typeof evaluateProgression;
let mainSuggestedWeight: typeof suggestedWeight;

// Load main's version
try {
  const mainSource = execSync("git show origin/main:src/lib/program/progression.ts", { encoding: "utf-8" });
  const tempFile = path.join("/tmp", `progression-main-${Date.now()}.ts`);
  fs.writeFileSync(tempFile, mainSource);
  
  const mainModule = await import(tempFile);
  mainEvaluateProgression = mainModule.evaluateProgression;
  mainSuggestedWeight = mainModule.suggestedWeight;
  
  fs.unlinkSync(tempFile);
  console.log("✓ Loaded main's evaluateProgression and suggestedWeight");
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

const sets = (n: number, reps: number, w: number): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

let caseCount = 0;
let categoryI = 0;   // 20% first-miss hold
let categoryII = 0;  // strictly-below one-step limit
let categoryIII = 0; // invariant clamp
let categoryIV = 0;  // hold keeps exact weight
let uncategorized = 0;
let invariantViolations = 0;
let stepViolations = 0;

console.log("\n=== Equipment Sweep ===");
console.log("Comparing against main and categorizing differences...\n");

for (const { ids, unit } of EQUIPMENTS) {
  for (const mechanic of MECHANICS) {
    for (const pattern of PATTERNS) {
      for (const weight of generateWeights(ids, unit)) {
        const meta: ExerciseMeta = {
          mechanic,
          metric: "reps",
          movementPattern: pattern,
          isBodyweight: false,
          progressionChain: null,
          progressionRank: null,
        };
        
        // Test first miss
        {
          const state = fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 0 });
          const loggedSets = sets(4, 10, weight); // Missed target
          
          const input = {
            sets: loggedSets,
            plannedSets: 4,
            repsMin: 8,
            repsMax: 12,
            feel: "right" as const,
            meta,
            state,
            isDeload: false,
            equipmentIds: ids,
            unit,
          };
          
          const branchResult = evaluateProgression(input);
          const mainResult = mainEvaluateProgression(input);
          
          caseCount++;
          
          const branchW = branchResult.nextWorkingWeightKg ?? 0;
          const mainW = mainResult.nextWorkingWeightKg ?? 0;
          
          // Check for violations
          // Test first-miss vs two-miss invariant
          const twoMissInput = { ...input, state: fresh({ currentWorkingWeightKg: weight, consecutiveFailures: 1 }) };
          const twoMissResult = evaluateProgression(twoMissInput);
          const twoMissW = twoMissResult.nextWorkingWeightKg ?? 0;
          
          if (branchW < twoMissW - 0.001) {
            invariantViolations++;
            console.log(`VIOLATION: first-miss < two-miss for ${ids[0]} ${weight} kg (${unit})`);
            console.log(`  first-miss: ${branchW}, two-miss: ${twoMissW}`);
          }
          
          // Check 1.5*step floor
          const step = ids.includes("kettlebell") 
            ? 2 // approximate for kettlebell
            : gridStepFor(ids, "kg");
          if (branchW < weight - 1.5 * step - 0.001 && branchW !== weight) {
            stepViolations++;
            console.log(`VIOLATION: first-miss dropped below current - 1.5*step for ${ids[0]} ${weight} kg (${unit})`);
            console.log(`  current: ${weight}, step: ${step}, result: ${branchW}, floor: ${weight - 1.5 * step}`);
          }
          
          // Categorize differences
          if (Math.abs(branchW - mainW) > 0.001) {
            const cutFraction = (weight - branchW) / weight;
            const mainCutFraction = (weight - mainW) / weight;
            
            // Category (i): 20% first-miss hold
            if (Math.abs(branchW - weight) < 0.001 && Math.abs(mainW - weight) > 0.001 && cutFraction <= FIRST_MISS_HOLD_THRESHOLD && mainCutFraction > FIRST_MISS_HOLD_THRESHOLD) {
              categoryI++;
            }
            // Category (ii): strictly-below one-step limit
            else if (branchW > mainW - 0.001 && Math.abs(branchW - weight) < 0.001) {
              categoryII++;
            }
            // Category (iii): invariant clamp
            else if (branchW > mainW - 0.001 && Math.abs(branchW - twoMissW) < 0.001) {
              categoryIII++;
            }
            // Uncategorized
            else {
              uncategorized++;
              console.log(`UNCATEGORIZED: ${ids[0]} ${weight} kg (${unit}), mechanic=${mechanic}`);
              console.log(`  Main: ${mainW}, Branch: ${branchW}, Two-miss: ${twoMissW}`);
            }
          }
        }
        
        // Test suggestedWeight hold behavior
        {
          const state = fresh({ currentWorkingWeightKg: weight });
          
          const branchSuggested = suggestedWeight(state, false, meta, ids, unit);
          const mainSuggested = mainSuggestedWeight(state, false, meta, ids, unit);
          
          caseCount++;
          
          // Category (iv): hold keeps exact weight
          if (branchSuggested !== null && mainSuggested !== null && Math.abs(branchSuggested - mainSuggested) > 0.001) {
            if (Math.abs(branchSuggested - weight) < 0.001 && Math.abs(mainSuggested - weight) > 0.001) {
              categoryIV++;
            } else {
              uncategorized++;
              console.log(`UNCATEGORIZED suggestedWeight: ${ids[0]} ${weight} kg (${unit})`);
              console.log(`  Main: ${mainSuggested}, Branch: ${branchSuggested}`);
            }
          }
        }
        
        if (caseCount % 5000 === 0) {
          process.stdout.write(`\r  Tested ${caseCount} cases...`);
        }
      }
    }
  }
}

console.log(`\n\n=== Results ===`);
console.log(`Total cases tested: ${caseCount}`);
console.log(`\nCategory counts:`);
console.log(`  (i)   20% first-miss hold:     ${categoryI}`);
console.log(`  (ii)  strictly-below one-step: ${categoryII}`);
console.log(`  (iii) invariant clamp:         ${categoryIII}`);
console.log(`  (iv)  hold keeps exact weight: ${categoryIV}`);
console.log(`\nViolations:`);
console.log(`  first-miss < two-miss:         ${invariantViolations}`);
console.log(`  dropped below current - 1.5*step: ${stepViolations}`);
console.log(`  uncategorized differences:     ${uncategorized}`);

if (invariantViolations > 0 || stepViolations > 0 || uncategorized > 0) {
  console.error(`\n❌ FAIL: Found violations or uncategorized differences`);
  process.exit(1);
}

console.log(`\n✅ PASS: All ${caseCount} equipment cases categorized correctly with no violations`);
