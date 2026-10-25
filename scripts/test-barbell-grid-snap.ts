/**
 * Test incrementFor with barbell equipmentIds.
 * 
 * Kills the BARBELL mutant which removes the loadable equipment check from incrementFor.
 * 
 * For barbell isolation (e.g. calf raise), incrementFor must return 2.5 kg (barbell grid)
 * not 1.25 kg (isolation mechanic), because you cannot load 1.25 kg increments on a barbell.
 */

import { incrementFor, type ExerciseMeta } from "../src/lib/program/progression";

const BARBELL_CALF: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "calf",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

console.log("Test: incrementFor with barbell isolation (calf raise)");

const withEquipment = incrementFor(BARBELL_CALF, ["barbell"]);
console.log(`  With equipmentIds=['barbell']: ${withEquipment} kg`);

const withoutEquipment = incrementFor(BARBELL_CALF, undefined);
console.log(`  Without equipmentIds: ${withoutEquipment} kg`);

if (withEquipment !== 2.5) {
  console.log(`\n❌ FAIL: Expected 2.5 kg with barbell, got ${withEquipment}`);
  process.exit(1);
}

if (withoutEquipment !== 1.25) {
  console.log(`\n❌ FAIL: Expected 1.25 kg without equipment, got ${withoutEquipment}`);
  process.exit(1);
}

console.log(`\n✅ PASS: Barbell increments respect equipment grid (2.5 kg not 1.25 kg)`);
process.exit(0);
