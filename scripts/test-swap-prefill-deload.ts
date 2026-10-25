/**
 * Test that suggestedWeight respects equipmentIds for deload grid snapping.
 * 
 * This kills the SWAP mutant which changes:
 *   isBodyweight ? undefined : equipmentIds
 * to just:
 *   undefined
 * 
 * Uses kettlebell (4 kg grid) vs defensive fallback (2.5 kg).
 */

import { suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

const KETTLEBELL_SQUAT: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "squat",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("=== SWAP Mutant Test: equipmentIds in suggestedWeight deload ===\n");

// Test: 22 kg kettlebell, deload 70% = 15.4 kg
// With kettlebell grid (4 kg): rounds to 16 kg
// Without grid (defensive 2.5 kg): rounds to 15 kg

console.log("Test: 22 kg kettlebell squat, deload (70%)");
const withEquipment = suggestedWeight(
  { currentWorkingWeightKg: 22 },
  true, // isDeload
  KETTLEBELL_SQUAT,
  ["kettlebell"],
);

const withoutEquipment = suggestedWeight(
  { currentWorkingWeightKg: 22 },
  true, // isDeload
  KETTLEBELL_SQUAT,
  undefined, // No equipmentIds - uses defensive 2.5 kg
);

console.log(`  With equipmentIds=['kettlebell']: ${withEquipment} kg`);
console.log(`  Without equipmentIds: ${withoutEquipment} kg`);

if (withEquipment === withoutEquipment) {
  console.log(`\n❌ SWAP MUTANT SURVIVED: Both returned ${withEquipment} kg`);
  console.log("   The test must distinguish between passing equipmentIds and undefined.");
  process.exit(1);
}

console.log(`\n✅ SWAP MUTANT KILLED: Different results (${withEquipment} vs ${withoutEquipment} kg)`);
process.exit(0);

