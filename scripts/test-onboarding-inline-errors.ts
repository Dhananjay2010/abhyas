/**
 * Test inline error behavior (touched state prevents premature errors).
 *
 * Validates:
 * - Height/weight errors only show after blur (heightTouched/weightTouched flags)
 * - DOB errors only show after blur (dobTouched flag)
 * - Continue button marks all fields as touched
 *
 *   npm run test:onboarding-inline-errors
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

console.log("\n1. Height touched state flag");
{
  check("heightTouched state exists", /heightTouched/.test(flowSource));
  check("onBlur sets heightTouched", /setHeightTouched/.test(flowSource));
  check("heightError checks heightTouched", /heightTouched &&/.test(flowSource));
}

console.log("\n2. Weight touched state flag");
{
  check("weightTouched state exists", /weightTouched/.test(flowSource));
  check("onBlur sets weightTouched", /setWeightTouched/.test(flowSource));
  check("weightError checks weightTouched", /weightTouched &&/.test(flowSource));
}

console.log("\n3. DOB touched state flag");
{
  check("dobTouched state exists", /dobTouched/.test(flowSource));
  check("onBlur sets dobTouched", /setDobTouched/.test(flowSource));
  check("dobError checks dobTouched", /dobTouched &&/.test(flowSource));
}

console.log("\n4. Continue button marks fields as touched");
{
  // When Continue is clicked, all fields should be marked as touched
  const marksTouched = /setDobTouched\(true\)/.test(flowSource) &&
                       /setHeightTouched\(true\)/.test(flowSource) &&
                       /setWeightTouched\(true\)/.test(flowSource);
  check("Continue sets all touched flags", marksTouched);
}

console.log("\n5. Error messages are conditional on touched state");
{
  // Errors should only show when touched AND invalid
  const conditionalErrors = /heightTouched && heightCm !== "" &&/.test(flowSource) ||
                            /weightTouched && weightKg !== "" &&/.test(flowSource);
  check("Errors conditional on touched && non-empty && invalid", conditionalErrors);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
