/**
 * V6-V9: Server error messages must use the user's unit.
 * 
 * V6: logSet imperial message contains 'lb'
 * V7: updateSet imperial message contains 'lb'
 * V8: updateSet metric message contains 'kg'
 * V9: logSet metric message contains 'kg'
 */

import { validateSet } from "@/lib/session/validation";
import { validateWeightKg } from "@/lib/history/edit-validation";

console.log("\n🧪 V6-V9: Server error messages use correct units\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// V6: logSet imperial message contains 'lb'
{
  const error = validateSet(8, 1000, undefined, "imperial");
  check("V6: logSet imperial over-limit returns error", error !== null);
  check("V6: logSet imperial error contains 'lb'", error?.includes("lb") ?? false, error ? `got: "${error}"` : "");
  check("V6: logSet imperial error does not contain 'kg'", !(error?.includes("kg") ?? true), error ? `got: "${error}"` : "");
}

// V7: updateSet (validateWeightKg) imperial message contains 'lb'
{
  const result = validateWeightKg(1000, "imperial");
  check("V7: updateSet imperial over-limit returns error", result.valid === false);
  check("V7: updateSet imperial error contains 'lb'", result.error?.includes("lb") ?? false, result.error ? `got: "${result.error}"` : "");
  check("V7: updateSet imperial error does not contain 'kg'", !(result.error?.includes("kg") ?? true), result.error ? `got: "${result.error}"` : "");
}

// V8: updateSet (validateWeightKg) metric message contains 'kg'
{
  const result = validateWeightKg(501, "metric");
  check("V8: updateSet metric over-limit returns error", result.valid === false);
  check("V8: updateSet metric error contains 'kg'", result.error?.includes("kg") ?? false, result.error ? `got: "${result.error}"` : "");
  check("V8: updateSet metric error does not contain 'lb'", !(result.error?.includes("lb") ?? true), result.error ? `got: "${result.error}"` : "");
}

// V9: logSet metric message contains 'kg'
{
  const error = validateSet(8, 501, undefined, "metric");
  check("V9: logSet metric over-limit returns error", error !== null);
  check("V9: logSet metric error contains 'kg'", error?.includes("kg") ?? false, error ? `got: "${error}"` : "");
  check("V9: logSet metric error does not contain 'lb'", !(error?.includes("lb") ?? true), error ? `got: "${error}"` : "");
}

// Additional: negative weight errors also use correct unit
{
  const errorImperial = validateSet(8, -10, undefined, "imperial");
  check("Negative weight imperial: error contains 'negative'", errorImperial?.toLowerCase().includes("negative") ?? false);
  
  const errorMetric = validateSet(8, -10, undefined, "metric");
  check("Negative weight metric: error contains 'negative'", errorMetric?.toLowerCase().includes("negative") ?? false);
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
