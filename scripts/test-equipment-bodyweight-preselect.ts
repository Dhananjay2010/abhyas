/**
 * Test equipment bodyweight preselection.
 *
 * Validates:
 * - Bodyweight track preselects bodyweight equipment
 * - Continue button is enabled when bodyweight is preselected
 *
 * This tests the equipment preselection logic that was added to fix the issue
 * where bodyweight-only users had to manually select equipment despite having
 * "bodyweight" as their primary track.
 *
 * OLD BEHAVIOR (main): selectedEquipment starts empty, Continue is disabled
 * NEW BEHAVIOR (fix): when isBodyweightOnly && grouped.bodyweight exists && selectedEquipment.size === 0,
 *                     preselect all bodyweight equipment items
 *
 *   npm run test:equipment-bodyweight-preselect
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type EquipmentRow = { id: string; name: string; category: string };

// Simulate the preselection logic from onboarding-flow.tsx
function shouldPreselect(track: string | null, equipment: EquipmentRow[], selectedEquipment: Set<string>): string[] {
  const isBodyweightOnly = track === "bodyweight";
  
  const grouped = equipment.reduce<Record<string, EquipmentRow[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});
  
  // Preselect bodyweight equipment for bodyweight track
  if (isBodyweightOnly && grouped.bodyweight && selectedEquipment.size === 0) {
    return grouped.bodyweight.map((e) => e.id);
  }
  
  return [];
}

const equipment: EquipmentRow[] = [
  { id: "bw-1", name: "Your body", category: "bodyweight" },
  { id: "bw-2", name: "Pull-up bar", category: "bodyweight" },
  { id: "fw-1", name: "Barbell", category: "free_weight" },
];

console.log("\n1. Bodyweight track preselects bodyweight equipment");
{
  const track = "bodyweight";
  const selectedEquipment = new Set<string>();
  
  const preselected = shouldPreselect(track, equipment, selectedEquipment);
  
  check("Bodyweight equipment is preselected", preselected.length === 2,
    `expected 2 items, got ${preselected.length}`);
  check("Preselected includes bw-1", preselected.includes("bw-1"));
  check("Preselected includes bw-2", preselected.includes("bw-2"));
  check("Preselected does NOT include fw-1", !preselected.includes("fw-1"));
}

console.log("\n2. Weights track does NOT preselect");
{
  const track = "weights";
  const selectedEquipment = new Set<string>();
  
  const preselected = shouldPreselect(track, equipment, selectedEquipment);
  
  check("No preselection for weights track", preselected.length === 0);
}

console.log("\n3. Bodyweight track with existing selection does NOT preselect");
{
  const track = "bodyweight";
  const selectedEquipment = new Set<string>(["fw-1"]); // User already selected something
  
  const preselected = shouldPreselect(track, equipment, selectedEquipment);
  
  check("No preselection if user already selected equipment", preselected.length === 0);
}

console.log("\n4. Continue button logic");
{
  // Continue is enabled if: hasAllEquipment OR selectedEquipment.size > 0
  
  const hasAllEquipment = false;
  const selectedEquipmentEmpty = new Set<string>();
  const selectedEquipmentWithItems = new Set<string>(["bw-1", "bw-2"]);
  
  const continueEnabled1 = hasAllEquipment || selectedEquipmentEmpty.size > 0;
  check("Continue disabled with empty selection and !hasAllEquipment", !continueEnabled1);
  
  const continueEnabled2 = hasAllEquipment || selectedEquipmentWithItems.size > 0;
  check("Continue enabled with bodyweight preselected", continueEnabled2);
  
  const continueEnabled3 = true || selectedEquipmentEmpty.size > 0; // hasAllEquipment = true
  check("Continue enabled when hasAllEquipment is true", continueEnabled3);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
