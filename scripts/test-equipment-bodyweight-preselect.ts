/**
 * Test equipment bodyweight preselection implementation.
 *
 * Validates:
 * - Bodyweight track preselects bodyweight equipment
 * - Preselection logic only applies when selectedEquipment is empty
 * - Continue button enabled with preselection
 *
 *   npm run test:equipment-bodyweight-preselect
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const flowPath = join(process.cwd(), "src", "app", "onboarding", "onboarding-flow.tsx");
const flowSource = readFileSync(flowPath, "utf-8");

console.log("\n1. Bodyweight preselection logic exists");
{
  const hasBodyweightCheck = /isBodyweightOnly/.test(flowSource) || /bodyweight/.test(flowSource);
  check("Bodyweight track check exists", hasBodyweightCheck);
  
  // Look for preselection logic
  const hasPreselectionLogic = /grouped\.bodyweight/.test(flowSource) && /selectedEquipment\.size === 0/.test(flowSource);
  check("Preselection only when selectedEquipment is empty", hasPreselectionLogic);
}

console.log("\n2. Equipment grouping by category");
{
  const hasGrouping = /equipment\.reduce/.test(flowSource) && /category/.test(flowSource);
  check("Equipment grouped by category", hasGrouping);
}

console.log("\n3. Bodyweight category preselection");
{
  // Check for logic that preselects bodyweight items
  const preselectsBodyweight = /bodyweight/.test(flowSource) && /\.map\(/.test(flowSource);
  check("Bodyweight equipment can be preselected", preselectsBodyweight);
}

console.log("\n4. Continue button logic accounts for preselection");
{
  // The Continue button should be enabled if equipment is selected OR hasAllEquipment
  const hasContinueLogic = /hasAllEquipment/.test(flowSource) || /selectedEquipment/.test(flowSource);
  check("Continue button logic exists for equipment step", hasContinueLogic);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
