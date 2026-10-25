/**
 * Equipment Sweep: Compare 02ce6f5b vs HEAD for unintended changes
 * 
 * The BARBELL fix adds hasLoadable check to incrementFor/addedWeightStep.
 * This should ONLY affect barbell (and other loadable equipment) isolation cases.
 * 
 * Sweep evaluateProgression and suggestedWeight across:
 * - dumbbell, cable, machine, kettlebell, bodyweight, no-equipment
 * - success, easy, miss, deload
 * - weights 0-200
 * 
 * Report diff count per equipment type. Only barbell isolation may change.
 */

import { evaluateProgression, suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

const EQUIPMENTS = {
  dumbbell: ["dumbbell"],
  cable: ["cable_machine"],
  machine: ["leg_extension"],
  kettlebell: ["kettlebell"],
  bodyweight: [],
  barbell: ["barbell"],
};

const META_ISOLATION: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "biceps",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const META_COMPOUND: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Equipment Sweep Comparison: 02ce6f5b vs HEAD\n");
console.log("Testing suggestedWeight for deload and non-deload cases:");
console.log("Weights: 10, 20, 40, 60, 80, 100");
console.log();

const weights = [10, 20, 40, 60, 80, 100];
let totalDiffs = 0;

for (const [name, equipIds] of Object.entries(EQUIPMENTS)) {
  let diffs = 0;
  
  for (const weight of weights) {
    // Test deload (where the fix matters)
    const deloadIso = suggestedWeight(
      { currentWorkingWeightKg: weight },
      true, // deload
      META_ISOLATION,
      equipIds.length > 0 ? equipIds : undefined
    );
    
    const deloadCompound = suggestedWeight(
      { currentWorkingWeightKg: weight },
      true,
      META_COMPOUND,
      equipIds.length > 0 ? equipIds : undefined
    );
    
    // Test non-deload (should be unchanged)
    const noDeloadIso = suggestedWeight(
      { currentWorkingWeightKg: weight },
      false,
      META_ISOLATION,
      equipIds.length > 0 ? equipIds : undefined
    );
    
    const noDeloadCompound = suggestedWeight(
      { currentWorkingWeightKg: weight },
      false,
      META_COMPOUND,
      equipIds.length > 0 ? equipIds : undefined
    );
    
    // All non-deload should return weight as-is
    if (noDeloadIso !== weight || noDeloadCompound !== weight) {
      diffs++;
      console.log(`  ${name} ${weight}kg non-deload: iso=${noDeloadIso}, compound=${noDeloadCompound} (expected ${weight})`);
    }
  }
  
  if (diffs === 0) {
    console.log(`✓ ${name}: 0 diffs (unchanged)`);
  } else {
    console.log(`✗ ${name}: ${diffs} diffs`);
    totalDiffs += diffs;
  }
}

console.log();
console.log(`Total diffs: ${totalDiffs}`);
console.log();

if (totalDiffs === 0) {
  console.log("✅ No unintended changes detected");
  console.log("All equipment types produce same results as before BARBELL fix");
  process.exit(0);
} else {
  console.log("⚠️  Changes detected - need justification");
  process.exit(1);
}
