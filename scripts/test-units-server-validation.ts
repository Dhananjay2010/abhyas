/**
 * Server-side validation: logSet and updateSet enforce unit-specific maxima.
 * 
 * Imperial: 999 lb ok, 1000/1050 lb rejected with lb message
 * Metric: 500 kg ok, 500.5 kg rejected with kg message
 */

import { validateSet } from "@/lib/session/validation";
import { validateWeightKg } from "@/lib/history/edit-validation";
import { displayToKg, lbToKg, type UnitsPreference } from "@/lib/units";

console.log("\n🧪 Server-side validation: unit-specific maxima\n");

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// ============================================================
// 1. validateSet (logSet action)
// ============================================================

// Imperial: 999 lb ok
{
  const kg999lb = lbToKg(999); // 453.14 kg
  const error = validateSet(8, kg999lb, undefined, "imperial");
  check("validateSet: imperial 999 lb ok", error === null);
}

// Imperial: 1000 lb rejected
{
  const kg1000lb = lbToKg(1000); // 453.59 kg
  const error = validateSet(8, kg1000lb, undefined, "imperial");
  check("validateSet: imperial 1000 lb rejected", error !== null);
  check("validateSet: imperial 1000 lb message in lb", error?.includes("lb") ?? false);
  check("validateSet: imperial 1000 lb message is '999 lb or less'", error === "Weight should be 999 lb or less.");
}

// Imperial: 1050 lb rejected
{
  const kg1050lb = lbToKg(1050); // 476.27 kg
  const error = validateSet(8, kg1050lb, undefined, "imperial");
  check("validateSet: imperial 1050 lb rejected", error !== null);
  check("validateSet: imperial 1050 lb message in lb", error?.includes("lb") ?? false);
}

// Metric: 500 kg ok
{
  const error = validateSet(8, 500, undefined, "metric");
  check("validateSet: metric 500 kg ok", error === null);
}

// Metric: 500.5 kg rejected
{
  const error = validateSet(8, 500.5, undefined, "metric");
  check("validateSet: metric 500.5 kg rejected", error !== null);
  check("validateSet: metric 500.5 kg message in kg", error?.includes("kg") ?? false);
  check("validateSet: metric 500.5 kg message is '500 kg or less'", error === "Weight should be 500 kg or less.");
}

// Metric: 501 kg rejected
{
  const error = validateSet(8, 501, undefined, "metric");
  check("validateSet: metric 501 kg rejected", error !== null);
  check("validateSet: metric 501 kg message in kg", error?.includes("kg") ?? false);
}

// ============================================================
// 2. validateWeightKg (updateSet action, History edit)
// ============================================================

// Imperial: 999 lb ok (uses displayToKg which rounds to 0.01 kg)
{
  const kg999lb = displayToKg(999, "imperial"); // 453.14 kg (rounded)
  const result = validateWeightKg(kg999lb, "imperial");
  check("validateWeightKg: imperial 999 lb ok", result.valid === true);
}

// Imperial: 1000 lb rejected
{
  const kg1000lb = displayToKg(1000, "imperial");
  const result = validateWeightKg(kg1000lb, "imperial");
  check("validateWeightKg: imperial 1000 lb rejected", result.valid === false);
  check("validateWeightKg: imperial 1000 lb message in lb", result.error?.includes("lb") ?? false);
  check("validateWeightKg: imperial 1000 lb message is '0 and 999 lb'", result.error === "Weight must be between 0 and 999 lb.");
}

// Imperial: 1050 lb rejected
{
  const kg1050lb = displayToKg(1050, "imperial");
  const result = validateWeightKg(kg1050lb, "imperial");
  check("validateWeightKg: imperial 1050 lb rejected", result.valid === false);
  check("validateWeightKg: imperial 1050 lb message in lb", result.error?.includes("lb") ?? false);
}

// Metric: 500 kg ok
{
  const result = validateWeightKg(500, "metric");
  check("validateWeightKg: metric 500 kg ok", result.valid === true);
}

// Metric: 500.5 kg rejected
{
  const result = validateWeightKg(500.5, "metric");
  check("validateWeightKg: metric 500.5 kg rejected", result.valid === false);
  check("validateWeightKg: metric 500.5 kg message in kg", result.error?.includes("kg") ?? false);
  check("validateWeightKg: metric 500.5 kg message is '0 and 500 kg'", result.error === "Weight must be between 0 and 500 kg.");
}

// Metric: 501 kg rejected
{
  const result = validateWeightKg(501, "metric");
  check("validateWeightKg: metric 501 kg rejected", result.valid === false);
  check("validateWeightKg: metric 501 kg message in kg", result.error?.includes("kg") ?? false);
}

// ============================================================
// 3. LOAD_LB_EPSILON test: 999 lb → 453.14 kg passes, 999.5 lb → 453.37 kg fails
// ============================================================

// validateSet: 453.14 kg (exactly 999 lb) should pass
{
  const kg999lb = lbToKg(999); // 453.14 kg
  const error = validateSet(8, kg999lb, undefined, "imperial");
  check("validateSet epsilon: 453.14 kg (999 lb) passes", error === null, `got kg=${kg999lb.toFixed(2)}`);
}

// validateSet: 453.37 kg (999.5 lb) should fail
{
  const kg999_5lb = lbToKg(999.5); // ~453.37 kg
  const error = validateSet(8, kg999_5lb, undefined, "imperial");
  check("validateSet epsilon: 453.37 kg (999.5 lb) fails", error !== null, `got kg=${kg999_5lb.toFixed(2)}`);
}

// validateWeightKg: 453.14 kg (999 lb) should pass
{
  const kg999lb = displayToKg(999, "imperial"); // Rounded to 453.14 kg
  const result = validateWeightKg(kg999lb, "imperial");
  check("validateWeightKg epsilon: 453.14 kg (999 lb) passes", result.valid === true, `got kg=${kg999lb.toFixed(2)}`);
}

// validateWeightKg: 453.37 kg (999.5 lb) should fail
{
  const kg999_5lb = displayToKg(999.5, "imperial"); // Rounded to 453.37 kg
  const result = validateWeightKg(kg999_5lb, "imperial");
  check("validateWeightKg epsilon: 453.37 kg (999.5 lb) fails", result.valid === false, `got kg=${kg999_5lb.toFixed(2)}`);
}

if (failures === 0) {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}
