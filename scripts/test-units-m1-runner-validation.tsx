/**
 * M1 (MEDIUM): Runner validation enforces unit-specific maxima.
 * 
 * - Imperial: 999 lb max, message in lb
 * - Metric: 500 kg max, message in kg
 * - Validates display values converted to kg before checking
 */

import { validateSet } from "@/lib/session/validation";
import { displayToKg } from "@/lib/units";

console.log("\n🧪 M1: Runner validation enforces unit-specific maxima\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Runner validation flow: user types weight in display unit → convert to kg → validate

// Imperial: 600 lb ok
{
  const displayValue = 600;
  const weightKg = displayToKg(displayValue, "imperial");
  const error = validateSet(8, weightKg, undefined, "imperial");
  check("Imperial 600 lb: no error", error === null);
}

// Imperial: 1000 lb rejected with lb message
{
  const displayValue = 1000;
  const weightKg = displayToKg(displayValue, "imperial");
  const error = validateSet(8, weightKg, undefined, "imperial");
  check("Imperial 1000 lb: error message", error !== null);
  check("Imperial 1000 lb: message in lb", error?.includes("lb") ?? false, error ? `got: "${error}"` : "");
  check("Imperial 1000 lb: message is '999 lb or less'", error === "Weight should be 999 lb or less.");
}

// Imperial: 999 lb ok (boundary)
{
  const displayValue = 999;
  const weightKg = displayToKg(displayValue, "imperial");
  const error = validateSet(8, weightKg, undefined, "imperial");
  check("Imperial 999 lb: no error", error === null);
}

// Metric: 500 kg ok
{
  const displayValue = 500;
  const weightKg = displayToKg(displayValue, "metric");
  const error = validateSet(8, weightKg, undefined, "metric");
  check("Metric 500 kg: no error", error === null);
}

// Metric: 501 kg rejected with kg message
{
  const displayValue = 501;
  const weightKg = displayToKg(displayValue, "metric");
  const error = validateSet(8, weightKg, undefined, "metric");
  check("Metric 501 kg: error message", error !== null);
  check("Metric 501 kg: message in kg", error?.includes("kg") ?? false, error ? `got: "${error}"` : "");
  check("Metric 501 kg: message is '500 kg or less'", error === "Weight should be 500 kg or less.");
}

// Additional: prefilled >500 lb value should still validate correctly
{
  const prefilledKg = displayToKg(600, "imperial"); // Simulates a prefilled 600 lb
  const error = validateSet(8, prefilledKg, undefined, "imperial");
  check("Imperial prefilled 600 lb: no error", error === null);
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
