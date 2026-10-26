/**
 * S6/S7: Runner working weight line and prefill must use snapped values.
 * 
 * For a 62.5 kg prescription with imperial units:
 * - S6: Working weight line shows "137.5 lb" (snapped)
 * - S7: Prefill box value is 137.5 (snapped)
 * 
 * Without snapping, 62.5 kg → 137.7890... lb → shows 138 lb or raw float.
 */

import { snapPrescribedWeight, kgToLb, formatLoad, computeRunnerWeightPrefill } from "@/lib/units";

console.log("\n🧪 S6/S7: Runner working weight line and prefill snapped\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Test prescription: 62.5 kg for imperial user
const prescribedKg = 62.5;
const units = "imperial" as const;

// Expected: 62.5 kg → 137.7890 lb → snap to 137.5 lb
const rawLb = kgToLb(prescribedKg);
check("Raw conversion check", rawLb > 137.5 && rawLb < 138, `got ${rawLb} lb`);

// S6: Working weight line must be snapped
{
  const snappedKg = snapPrescribedWeight(prescribedKg, units);
  const formatted = formatLoad(snappedKg, units);
  
  check("S6: snappedKg is not null", snappedKg !== null);
  if (snappedKg !== null) {
    const displayLb = kgToLb(snappedKg);
    check("S6: snapped value is 137.5 lb", Math.abs(displayLb - 137.5) < 0.01, `got ${displayLb} lb`);
    check("S6: formatLoad shows '137.5 lb'", formatted === "137.5 lb", `got "${formatted}"`);
  }
}

// S7: Prefill box must be snapped
{
  const prefill = computeRunnerWeightPrefill(prescribedKg, units, false);
  const prefillNum = Number(prefill);
  
  check("S7: prefill is not empty", prefill !== "");
  check("S7: prefill is numeric", !isNaN(prefillNum));
  check("S7: prefill equals 137.5", prefillNum === 137.5, `got ${prefill}`);
}

// Additional test: 100 kg → 220.46 lb → snaps to 220 lb
{
  const prescribed100 = 100;
  const snappedKg = snapPrescribedWeight(prescribed100, units);
  const prefill = computeRunnerWeightPrefill(prescribed100, units, false);
  
  check("100 kg: snapped to 220 lb", snappedKg !== null && Math.abs(kgToLb(snappedKg) - 220) < 0.01);
  check("100 kg: prefill is 220", Number(prefill) === 220, `got ${prefill}`);
}

// Additional test: 57.5 kg → 126.77 lb → snaps to 126.5 lb
{
  const prescribed57_5 = 57.5;
  const snappedKg = snapPrescribedWeight(prescribed57_5, units);
  const prefill = computeRunnerWeightPrefill(prescribed57_5, units, false);
  
  check("57.5 kg: snapped to 126.5 lb", snappedKg !== null && Math.abs(kgToLb(snappedKg) - 126.5) < 0.01);
  check("57.5 kg: prefill is 126.5", Number(prefill) === 126.5, `got ${prefill}`);
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
