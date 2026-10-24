/**
 * Behavior test for Mutant E: swap uses the old isBodyweight check
 * 
 * Test that swappedEntryFields correctly determines isBodyweight from equipment_ids
 * using isBodyweightEquipment(), not just checking equipment_ids.length === 0
 */
import { swappedEntryFields } from "../src/lib/session/swap";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nswappedEntryFields: pull-up with equipment is bodyweight");

// Pull-ups use pull_up_bar equipment, should be bodyweight
const result1 = swappedEntryFields({
  equipmentIds: ["pull_up_bar"],
  workingWeightKg: null,
  suggestedWeightKg: null,
});

check("isBodyweight is true for pull_up_bar", result1.isBodyweight === true,
  `got ${result1.isBodyweight}, equipment_ids.length = 1 but should detect pull_up_bar`);

console.log("\nswappedEntryFields: dip with equipment is bodyweight");

const result2 = swappedEntryFields({
  equipmentIds: ["dip_bars"],
  workingWeightKg: null,
  suggestedWeightKg: null,
});

check("isBodyweight true for dip_bars", result2.isBodyweight === true,
  `got ${result2.isBodyweight}`);

console.log("\nswappedEntryFields: empty equipment is bodyweight");

const result3 = swappedEntryFields({
  equipmentIds: [],
  workingWeightKg: null,
  suggestedWeightKg: null,
});

check("isBodyweight true for empty equipment", result3.isBodyweight === true,
  `got ${result3.isBodyweight}`);

console.log("\nswappedEntryFields: cable exercise is NOT bodyweight");

const result4 = swappedEntryFields({
  equipmentIds: ["cable_machine"],
  workingWeightKg: 50,
  suggestedWeightKg: 52.5,
});

check("isBodyweight false for cable", result4.isBodyweight === false,
  `got ${result4.isBodyweight}`);
check("working weight preserved", result4.workingWeightKg === 50);

console.log("\nswappedEntryFields: bench with dumbbells is NOT bodyweight");

const result5 = swappedEntryFields({
  equipmentIds: ["flat_bench", "dumbbells"],
  workingWeightKg: 25,
  suggestedWeightKg: 27.5,
});

check("isBodyweight false for bench+dumbbells", result5.isBodyweight === false,
  `got ${result5.isBodyweight}, mixed equipment should not be bodyweight`);

if (failures > 0) {
  console.log(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED\n");
}
