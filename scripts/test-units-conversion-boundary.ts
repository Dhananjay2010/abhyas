/**
 * Test units conversion at the save boundary.
 * 
 * Validates that user input in imperial units is correctly converted to kg/cm
 * for storage, and that stored values are correctly displayed in imperial.
 * 
 * npm run test:units-conversion-boundary
 */

import {
  parseWeight,
  parseHeight,
  formatWeight,
  formatHeight,
} from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function approxEqual(a: number, b: number, epsilon = 0.1): boolean {
  return Math.abs(a - b) < epsilon;
}

console.log("\n1. Imperial weight input converts to kg at save boundary");
{
  // User enters "154" lb, should convert to ~70 kg
  const kg = parseWeight("154", "imperial");
  check("154 lb converts to ~70 kg", kg !== null && approxEqual(kg, 70), `got ${kg?.toFixed(2)}`);

  // User enters "220.5" lb, should convert to ~100 kg
  const kg2 = parseWeight("220.5", "imperial");
  check("220.5 lb converts to ~100 kg", kg2 !== null && approxEqual(kg2, 100), `got ${kg2?.toFixed(2)}`);
}

console.log("\n2. Stored kg values display correctly in imperial");
{
  // 70 kg should display as "154.5 lb"
  const display = formatWeight(70, "imperial", true);
  check("70 kg displays as '154.5 lb'", display === "154.5 lb", `got '${display}'`);

  // 100 kg should display as "220.5 lb"
  const display2 = formatWeight(100, "imperial", true);
  check("100 kg displays as '220.5 lb'", display2 === "220.5 lb", `got '${display2}'`);
}

console.log("\n3. Imperial height input converts to cm at save boundary");
{
  // User enters "5'9\"", should convert to ~175 cm
  const cm = parseHeight("5'9\"", "imperial");
  check("5'9\" converts to ~175 cm", cm !== null && approxEqual(cm, 175, 1), `got ${cm}`);

  // User enters "6'0\"", should convert to ~183 cm
  const cm2 = parseHeight("6'0\"", "imperial");
  check("6'0\" converts to ~183 cm", cm2 !== null && approxEqual(cm2, 183, 1), `got ${cm2}`);
}

console.log("\n4. Stored cm values display correctly in imperial");
{
  // 175 cm should display as "5'9\""
  const display = formatHeight(175, "imperial");
  check("175 cm displays as '5'9\"'", display === `5'9"`, `got '${display}'`);

  // 183 cm should display as "6'0\""
  const display2 = formatHeight(183, "imperial");
  check("183 cm displays as '6'0\"'", display2 === `6'0"`, `got '${display2}'`);
}

console.log("\n5. Round-trip stability: weight");
{
  // Store 70 kg → display in imperial → parse back → should be ~70 kg
  const original = 70;
  const displayed = formatWeight(original, "imperial", false);
  const parsed = parseWeight(displayed, "imperial");
  check("70 kg → imperial display → parse → ~70 kg", 
    parsed !== null && approxEqual(parsed, original),
    `displayed='${displayed}', parsed=${parsed?.toFixed(2)}`);
}

console.log("\n6. Round-trip stability: height");
{
  // Store 175 cm → display in imperial → parse back → should be ~175 cm
  const original = 175;
  const displayed = formatHeight(original, "imperial");
  const parsed = parseHeight(displayed, "imperial");
  check("175 cm → imperial display → parse → ~175 cm",
    parsed !== null && approxEqual(parsed, original, 1),
    `displayed='${displayed}', parsed=${parsed}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
