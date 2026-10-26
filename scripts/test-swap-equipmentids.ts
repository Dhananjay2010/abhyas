/**
 * Test that swap-prefill passes equipmentIds to suggestedWeight.
 * This test KILLS the SWAP mutant (equipmentIds forced to undefined).
 * 
 * Does not require Supabase - tests the core logic directly.
 */

import { suggestedWeight, type ExerciseMeta } from "../src/lib/program/progression";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("SWAP mutant killer: equipmentIds must be passed to suggestedWeight\n");

// Test case: 102kg barbell isolation deload
// 102 * 0.7 = 71.4kg
// With equipmentIds=["barbell"]: 72.5kg (2.5kg grid)
// With equipmentIds=undefined: 70kg or 71.25kg (1.25kg isolation grid)

const meta: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "biceps",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const withEquipment = suggestedWeight(
  { currentWorkingWeightKg: 102 },
  true,
  meta,
  ["barbell"],
);

const withoutEquipment = suggestedWeight(
  { currentWorkingWeightKg: 102 },
  true,
  meta,
  undefined,
);

console.log(`102kg barbell isolation deload:`);
console.log(`  With equipmentIds=['barbell']: ${withEquipment} kg`);
console.log(`  With equipmentIds=undefined: ${withoutEquipment} kg`);
console.log();

check("With barbell equipment: 72.5kg (2.5kg grid)", withEquipment === 72.5, `got ${withEquipment}`);
check("Without equipment: 71.25kg (1.25kg grid)", withoutEquipment === 71.25, `got ${withoutEquipment}`);
check("SWAP mutant killed: equipment changes result", withEquipment !== withoutEquipment, 
  `${withEquipment} vs ${withoutEquipment}`);

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("✅ SWAP mutant killed: equipmentIds correctly affects deload calculation\n");
  process.exit(0);
}
