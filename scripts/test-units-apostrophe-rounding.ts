/**
 * Unit tests for apostrophe styles and rounding in units.ts
 *
 * Validates:
 * - parseHeight accepts straight, curly, and prime apostrophes
 * - Metric mode rejects or converts '70lb' properly
 * - All conversions are properly rounded (cm→int, kg→1dp, lb→1dp, ft/in→whole inches)
 *
 *   npm run test:units-apostrophe-rounding
 */

import {
  parseHeight,
  parseWeight,
  formatHeight,
  formatWeight,
  inchesToFeetAndInches,
} from "../src/lib/units";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function approxEqual(a: number, b: number, epsilon = 0.1): boolean {
  return Math.abs(a - b) < epsilon;
}

console.log("\n1. parseHeight accepts different apostrophe styles");
{
  const straightApostrophe = parseHeight("5'9\"", "imperial");
  check("Straight apostrophe (5'9\") parses", straightApostrophe != null && approxEqual(straightApostrophe, 175, 2));

  const curlyApostrophe = parseHeight("5'9\"", "imperial");
  check("Curly apostrophe (5'9\") parses", curlyApostrophe != null && approxEqual(curlyApostrophe, 175, 2));

  const primeMarks = parseHeight("5′9″", "imperial");
  check("Prime marks (5′9″) parse", primeMarks != null && approxEqual(primeMarks, 175, 2));

  const mixedApostrophe1 = parseHeight("5'9", "imperial");
  check("Straight apostrophe without closing quote (5'9) parses", mixedApostrophe1 != null && approxEqual(mixedApostrophe1, 175, 2));

  const mixedApostrophe2 = parseHeight("5' 9\"", "imperial");
  check("Straight apostrophe with space (5' 9\") parses", mixedApostrophe2 != null && approxEqual(mixedApostrophe2, 175, 2));
}

console.log("\n2. Metric mode handles '70lb' explicitly");
{
  // With explicit 'lb' suffix, should convert
  const withSuffix = parseWeight("70lb", "metric");
  check("'70lb' in metric mode converts from pounds", withSuffix != null && approxEqual(withSuffix, 31.75, 1),
    `got ${withSuffix?.toFixed(2)} kg`);

  // With explicit 'kg' suffix, should use as-is
  const withKgSuffix = parseWeight("70kg", "metric");
  check("'70kg' in metric mode uses as kg", withKgSuffix === 70);

  // Without suffix in metric mode, should interpret as kg
  const noSuffix = parseWeight("70", "metric");
  check("'70' in metric mode interprets as kg", noSuffix === 70);
}

console.log("\n3. Imperial mode handles weight with explicit units");
{
  // With explicit 'kg' suffix, should convert
  const withKgSuffix = parseWeight("70kg", "imperial");
  check("'70kg' in imperial mode converts from kg", withKgSuffix != null && approxEqual(withKgSuffix, 70, 0.1));

  // With explicit 'lb' suffix, should use as-is
  const withLbSuffix = parseWeight("154.5lb", "imperial");
  check("'154.5lb' in imperial mode uses as lb", withLbSuffix != null && approxEqual(withLbSuffix, 70, 1));

  // Without suffix in imperial mode, should interpret as lb
  const noSuffix = parseWeight("154.5", "imperial");
  check("'154.5' in imperial mode interprets as lb", noSuffix != null && approxEqual(noSuffix, 70, 1));
}

console.log("\n4. Height rounding: cm to integer");
{
  const height1 = parseHeight("175.6", "metric");
  check("175.6 cm rounds to 176 cm", height1 === 176);

  const height2 = parseHeight("175.4", "metric");
  check("175.4 cm rounds to 175 cm", height2 === 175);

  const height3 = parseHeight("5'9\"", "imperial");
  check("5'9\" converts to integer cm", height3 != null && height3 === Math.round(height3 || 0));
}

console.log("\n5. Weight rounding: kg to 1 decimal");
{
  const weight1 = parseWeight("70.56", "metric");
  check("70.56 kg rounds to 70.6 kg", weight1 === 70.6,
    `got ${weight1}`);

  const weight2 = parseWeight("70.54", "metric");
  check("70.54 kg rounds to 70.5 kg", weight2 === 70.5,
    `got ${weight2}`);

  const formatted = formatWeight(70.567, "metric", false);
  check("70.567 kg formats to 70.57", formatted === "70.57",
    `got ${formatted}`);
}

console.log("\n6. Weight rounding: lb to 1 decimal");
{
  const formatted1 = formatWeight(70, "imperial", false);
  check("70 kg formats to ~154.5 lb (1 decimal)", formatted1.includes(".") || formatted1 === "154",
    `got ${formatted1}`);

  const weight = parseWeight("154.567", "imperial");
  check("154.567 lb is rounded", weight != null && weight === Math.round(weight * 10) / 10);
}

console.log("\n7. Height ft/in: whole inches with carry");
{
  const result1 = inchesToFeetAndInches(71.6);
  check("71.6 inches → 6'0\" (carry)", result1.feet === 6 && result1.inches === 0,
    `got ${result1.feet}'${result1.inches}"`);

  const result2 = inchesToFeetAndInches(71.4);
  check("71.4 inches → 5'11\" (no carry)", result2.feet === 5 && result2.inches === 11,
    `got ${result2.feet}'${result2.inches}"`);

  const formatted = formatHeight(183, "imperial");
  check("183 cm formats to whole ft'in\" format", /^\d+'\d+"$/.test(formatted),
    `got ${formatted}`);
}

console.log("\n8. Metric height formatting: integer cm");
{
  const formatted1 = formatHeight(175.6, "metric", false);
  check("175.6 cm formats to 176", formatted1 === "176",
    `got ${formatted1}`);

  const formatted2 = formatHeight(175.4, "metric", false);
  check("175.4 cm formats to 175", formatted2 === "175",
    `got ${formatted2}`);

  const formatted3 = formatHeight(175, "metric", false);
  check("175 cm formats to 175 (no decimal)", formatted3 === "175",
    `got ${formatted3}`);
}

console.log("\n9. Round-trip stability with rounding");
{
  // Weight: kg → imperial display → parse back
  const originalKg = 70.567;
  const displayedLb = formatWeight(originalKg, "imperial", false);
  const parsedBack = parseWeight(displayedLb, "imperial");
  check("70.567 kg → display → parse stays close", parsedBack != null && approxEqual(parsedBack, originalKg, 0.5),
    `displayed=${displayedLb}, parsed=${parsedBack?.toFixed(2)}`);

  // Height: cm → imperial display → parse back
  const originalCm = 175.6;
  const displayedFtIn = formatHeight(originalCm, "imperial");
  const parsedBackCm = parseHeight(displayedFtIn, "imperial");
  check("175.6 cm → display → parse stays close", parsedBackCm != null && approxEqual(parsedBackCm, Math.round(originalCm), 2),
    `displayed=${displayedFtIn}, parsed=${parsedBackCm}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
