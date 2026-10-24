#!/usr/bin/env tsx
/**
 * Count: Deload prefill differences with real mechanic vs null
 * 
 * Measures the impact of passing real mechanic in page.tsx on deload weight calculations.
 * Before: mechanic was not selected, fell back to null.
 * After: mechanic is selected and passed, changing bodyweight isolation/accessory deload prefills.
 */

import { suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

const MECHANICS: Array<"compound" | "isolation" | null> = ["compound", "isolation", null];
const PATTERNS = ["squat", "hinge", "vertical_press", "horizontal_press", "vertical_pull", "horizontal_pull", "biceps", "triceps", "other"] as const;
const METRICS = ["reps", "seconds"] as const;

// 27 mechanics × 10 patterns × 2 metrics × 2 bodyweight × 9 weights = 4,860
const WEIGHTS = [5, 10, 15, 20, 25, 30, 40, 50, 60];
const BODYWEIGHT_STATUS = [true, false] as const;

let totalCases = 0;
let differingCases = 0;

for (const mechanic of MECHANICS) {
  for (const pattern of PATTERNS) {
    for (const metric of METRICS) {
      for (const isBodyweight of BODYWEIGHT_STATUS) {
        for (const weight of WEIGHTS) {
          totalCases++;
          
          const meta: ExerciseMeta = {
            mechanic,
            movementPattern: pattern,
            metric,
            isBodyweight,
            progressionChain: null,
            progressionRank: null,
          };
          
          const metaWithNull: ExerciseMeta = {
            ...meta,
            mechanic: null,
          };
          
          const withMechanic = suggestedWeight(
            { currentWorkingWeightKg: weight },
            true, // deload
            meta,
          );
          
          const withNull = suggestedWeight(
            { currentWorkingWeightKg: weight },
            true, // deload
            metaWithNull,
          );
          
          if (withMechanic !== withNull) {
            differingCases++;
          }
        }
      }
    }
  }
}

console.log(`Total deload prefill cases tested: ${totalCases.toLocaleString()}`);
console.log(`Cases where real mechanic differs from null: ${differingCases.toLocaleString()}`);
console.log(`Percentage: ${((differingCases / totalCases) * 100).toFixed(1)}%`);

// Show a specific example
const EXAMPLE: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "hinge",
  metric: "reps",
  isBodyweight: true,
  progressionChain: null,
  progressionRank: null,
};

const exampleWithMechanic = suggestedWeight(
  { currentWorkingWeightKg: 20 },
  true,
  EXAMPLE,
);

const exampleWithNull = suggestedWeight(
  { currentWorkingWeightKg: 20 },
  true,
  { ...EXAMPLE, mechanic: null },
);

console.log(`\nExample: Bodyweight isolation hinge at 20 kg (deload):`);
console.log(`  With mechanic='isolation': ${exampleWithMechanic} kg`);
console.log(`  With mechanic=null: ${exampleWithNull} kg`);
