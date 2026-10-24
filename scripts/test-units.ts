/**
 * Unit conversion and formatting tests.
 *
 * Validates the foundation layer for imperial units support:
 * - Weight conversion (kg ↔ lb)
 * - Height conversion (cm ↔ ft/in)
 * - Rounding edge cases (0.5 lb increments, inch carry at 12)
 * - Round-trip stability (display → input → storage → display)
 * - Invalid input handling (zero, negative, null, NaN)
 *
 *   npm run test:units
 */
import {
  kgToLb,
  lbToKg,
  roundLbToHalf,
  cmToIn,
  inToCm,
  inchesToFeetAndInches,
  feetAndInchesToInches,
  formatWeight,
  formatHeight,
  parseWeight,
  parseHeight,
  weightLabel,
  heightLabel,
  getUnitsPreference,
} from "../src/lib/units";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function approxEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

console.log("\n1. Weight conversion: kg ↔ lb");
{
  check("70 kg to lb", approxEqual(kgToLb(70), 154.32), `got ${kgToLb(70).toFixed(2)}`);
  check("154.32 lb to kg", approxEqual(lbToKg(154.32), 70), `got ${lbToKg(154.32).toFixed(2)}`);
  check("100 kg to lb", approxEqual(kgToLb(100), 220.46), `got ${kgToLb(100).toFixed(2)}`);
  check("0 kg is 0 lb", kgToLb(0) === 0);
  check("0 lb is 0 kg", lbToKg(0) === 0);
  check("negative kg returns 0", kgToLb(-10) === 0);
  check("negative lb returns 0", lbToKg(-10) === 0);
  check("null kg returns 0", kgToLb(null) === 0);
  check("undefined lb returns 0", lbToKg(undefined) === 0);
  check("NaN kg returns 0", kgToLb(NaN) === 0);
}

console.log("\n2. Pound rounding to nearest 0.5 lb");
{
  check("154.0 → 154.0", roundLbToHalf(154.0) === 154.0);
  check("154.2 → 154.0", roundLbToHalf(154.2) === 154.0);
  check("154.3 → 154.5", roundLbToHalf(154.3) === 154.5);
  check("154.5 → 154.5", roundLbToHalf(154.5) === 154.5);
  check("154.7 → 154.5", roundLbToHalf(154.7) === 154.5);
  check("154.8 → 155.0", roundLbToHalf(154.8) === 155.0);
  check("edge: 0.24 → 0", roundLbToHalf(0.24) === 0);
  check("edge: 0.25 → 0.5", roundLbToHalf(0.25) === 0.5);
  check("edge: 0.26 → 0.5", roundLbToHalf(0.26) === 0.5);
}

console.log("\n3. Height conversion: cm ↔ inches");
{
  check("175 cm to inches", approxEqual(cmToIn(175), 68.9), `got ${cmToIn(175).toFixed(2)}`);
  check("69 inches to cm", approxEqual(inToCm(69), 175.26), `got ${inToCm(69).toFixed(2)}`);
  check("0 cm is 0 inches", cmToIn(0) === 0);
  check("0 inches is 0 cm", inToCm(0) === 0);
  check("negative cm returns 0", cmToIn(-10) === 0);
  check("negative inches returns 0", inToCm(-10) === 0);
  check("null cm returns 0", cmToIn(null) === 0);
  check("undefined inches returns 0", inToCm(undefined) === 0);
}

console.log("\n4. Inches to feet and inches with proper carry");
{
  const ft69 = inchesToFeetAndInches(69);
  check("69 inches = 5'9\"", ft69.feet === 5 && ft69.inches === 9, `got ${ft69.feet}'${ft69.inches}"`);

  const ft71_6 = inchesToFeetAndInches(71.6);
  check("71.6 inches rounds to 6'0\" (carry)", ft71_6.feet === 6 && ft71_6.inches === 0,
    `got ${ft71_6.feet}'${ft71_6.inches}"`);

  const ft71_4 = inchesToFeetAndInches(71.4);
  check("71.4 inches rounds to 5'11\"", ft71_4.feet === 5 && ft71_4.inches === 11,
    `got ${ft71_4.feet}'${ft71_4.inches}"`);

  const ft60 = inchesToFeetAndInches(60);
  check("60 inches = 5'0\"", ft60.feet === 5 && ft60.inches === 0, `got ${ft60.feet}'${ft60.inches}"`);

  const ft0 = inchesToFeetAndInches(0);
  check("0 inches = 0'0\"", ft0.feet === 0 && ft0.inches === 0);

  const ftNeg = inchesToFeetAndInches(-10);
  check("negative inches returns 0'0\"", ftNeg.feet === 0 && ftNeg.inches === 0);
}

console.log("\n5. Feet and inches to total inches");
{
  check("5'9\" = 69 inches", feetAndInchesToInches(5, 9) === 69);
  check("6'0\" = 72 inches", feetAndInchesToInches(6, 0) === 72);
  check("5'11\" = 71 inches", feetAndInchesToInches(5, 11) === 71);
  check("0'0\" = 0 inches", feetAndInchesToInches(0, 0) === 0);
  check("negative feet returns 0", feetAndInchesToInches(-5, 9) === 0);
  check("negative inches returns 0", feetAndInchesToInches(5, -9) === 0);
}

console.log("\n6. Weight display formatting");
{
  check("metric: 70 kg", formatWeight(70, "metric") === "70 kg");
  check("metric: 70.5 kg shows decimal", formatWeight(70.5, "metric") === "70.5 kg");
  check("imperial: 70 kg → 154.5 lb", formatWeight(70, "imperial") === "154.5 lb");
  check("imperial: 100 kg → 220.5 lb", formatWeight(100, "imperial") === "220.5 lb");
  check("imperial: rounds to 0.5", formatWeight(69.9, "imperial") === "154 lb");
  check("metric without label", formatWeight(70, "metric", false) === "70");
  check("imperial without label", formatWeight(70, "imperial", false) === "154.5");
  check("null weight: em dash", formatWeight(null, "metric") === "—");
  check("undefined weight: em dash", formatWeight(undefined, "imperial") === "—");
  check("negative returns em dash", formatWeight(-10, "metric") === "—");
  check("zero returns em dash", formatWeight(0, "metric") === "—");
  check("custom empty value", formatWeight(null, "metric", true, "") === "");
  check("custom empty value: N/A", formatWeight(null, "imperial", true, "N/A") === "N/A");
}

console.log("\n7. Height display formatting");
{
  check("metric: 175 cm", formatHeight(175, "metric") === "175 cm");
  check("metric: 175.5 cm shows decimal", formatHeight(175.5, "metric") === "175.5 cm");
  check("imperial: 175 cm → 5'9\"", formatHeight(175, "imperial") === `5'9"`);
  check("imperial: 183 cm → 6'0\"", formatHeight(183, "imperial") === `6'0"`);
  check("imperial: 180 cm → 5'11\"", formatHeight(180, "imperial") === `5'11"`);
  check("metric without label", formatHeight(175, "metric", false) === "175");
  check("null height: em dash", formatHeight(null, "metric") === "—");
  check("undefined height: em dash", formatHeight(undefined, "imperial") === "—");
  check("negative returns em dash", formatHeight(-10, "imperial") === "—");
  check("zero returns em dash", formatHeight(0, "metric") === "—");
  check("custom empty value", formatHeight(null, "metric", true, "") === "");
}

console.log("\n8. Weight input parsing");
{
  const metric70 = parseWeight("70", "metric");
  check("metric: '70' → 70 kg", metric70 === 70);

  const metric70_5 = parseWeight("70.5", "metric");
  check("metric: '70.5' → 70.5 kg", metric70_5 === 70.5);

  const imperial154 = parseWeight("154.5", "imperial");
  check("imperial: '154.5' rounds and converts", imperial154 != null && approxEqual(imperial154, 70, 0.1),
    `got ${imperial154?.toFixed(2)}`);

  const imperial154_3 = parseWeight("154.3", "imperial");
  check("imperial: 154.3 rounds to 154.5 → same kg", imperial154_3 != null && approxEqual(imperial154_3, 70, 0.1));

  check("empty string returns null", parseWeight("", "metric") === null);
  check("null input returns null", parseWeight(null, "metric") === null);
  check("negative returns null", parseWeight("-10", "metric") === null);
  check("non-numeric returns null", parseWeight("abc", "metric") === null);
  check("number input works", parseWeight(70, "metric") === 70);

  // Strict parsing: reject trailing garbage
  check("trailing garbage rejected", parseWeight("70abc", "metric") === null);
  check("trailing text rejected", parseWeight("70 hello", "metric") === null);

  // Optional unit suffixes accepted
  check("'70kg' accepted", parseWeight("70kg", "metric") === 70);
  check("'70 kg' accepted", parseWeight("70 kg", "metric") === 70);
  check("'154.5 lb' accepted", parseWeight("154.5 lb", "imperial") != null);
  check("'154.5lb' accepted", parseWeight("154.5lb", "imperial") != null);
  check("'154.5 lbs' accepted", parseWeight("154.5 lbs", "imperial") != null);

  // Absurd values rejected
  check("0 kg rejected", parseWeight("0", "metric") === null);
  check("0.05 kg rejected (too small)", parseWeight("0.05", "metric") === null);
  check("501 kg rejected (too large)", parseWeight("501", "metric") === null);
  check("1200 lb rejected (~544 kg)", parseWeight("1200", "imperial") === null);
  check("0.1 kg accepted (edge)", parseWeight("0.1", "metric") === 0.1);
  check("500 kg accepted (edge)", parseWeight("500", "metric") === 500);
}

console.log("\n9. Height input parsing");
{
  const metric175 = parseHeight("175", "metric");
  check("metric: '175' → 175 cm", metric175 === 175);

  const metric175_5 = parseHeight("175.5", "metric");
  check("metric: '175.5' → 175.5 cm", metric175_5 === 175.5);

  const imperial5_9 = parseHeight("5'9\"", "imperial");
  check("imperial: 5'9\" parses", imperial5_9 != null && approxEqual(imperial5_9, 175, 1),
    `got ${imperial5_9?.toFixed(1)}`);

  const imperial5_9_noQuote = parseHeight("5'9", "imperial");
  check("imperial: 5'9 (no closing quote) parses", imperial5_9_noQuote != null && approxEqual(imperial5_9_noQuote, 175, 1));

  const imperial5_9_space = parseHeight("5' 9\"", "imperial");
  check("imperial: '5' 9\"' (with space) parses", imperial5_9_space != null && approxEqual(imperial5_9_space, 175, 1));

  const imperial5_9_dash = parseHeight("5-9", "imperial");
  check("imperial: '5-9' (dash separator) parses", imperial5_9_dash != null && approxEqual(imperial5_9_dash, 175, 1));

  const imperialSeparate = parseHeight(5, "imperial", 9);
  check("imperial: separate inputs (5, 9) parse", imperialSeparate != null && approxEqual(imperialSeparate, 175, 1));

  const imperial69 = parseHeight("69 inches", "imperial");
  check("imperial: '69 inches' as total inches parses", imperial69 != null && approxEqual(imperial69, 175, 1));

  check("empty string returns null", parseHeight("", "metric") === null);
  check("null input returns null", parseHeight(null, "metric") === null);
  check("negative returns null", parseHeight("-10", "metric") === null);
  check("invalid format returns null", parseHeight("abc", "imperial") === null);

  // Strict parsing: reject trailing garbage
  check("metric: trailing garbage rejected", parseHeight("175abc", "metric") === null);
  check("imperial: trailing garbage rejected", parseHeight("69abc", "imperial") === null);

  // Optional unit suffixes accepted
  check("'175cm' accepted", parseHeight("175cm", "metric") === 175);
  check("'175 cm' accepted", parseHeight("175 cm", "metric") === 175);
  check("'69 in' accepted", parseHeight("69 in", "imperial") != null);

  // Reject inches >= 12 in split form
  check("5'12\" rejected (inches >= 12)", parseHeight("5'12\"", "imperial") === null);
  check("5'13\" rejected", parseHeight("5'13\"", "imperial") === null);
  check("5-12 rejected", parseHeight("5-12", "imperial") === null);
  check("separate (5, 12) rejected", parseHeight(5, "imperial", 12) === null);
  check("separate (5, 11) accepted", parseHeight(5, "imperial", 11) != null);

  // Absurd values rejected
  check("metric: 49 cm rejected (too short)", parseHeight("49", "metric") === null);
  check("metric: 273 cm rejected (too tall)", parseHeight("273", "metric") === null);
  check("metric: 50 cm accepted (edge)", parseHeight("50", "metric") === 50);
  check("metric: 272 cm accepted (edge)", parseHeight("272", "metric") === 272);
  check("imperial: 1'6\" (~46 cm) rejected", parseHeight("1'6\"", "imperial") === null);
  check("imperial: 9'0\" (~274 cm) rejected", parseHeight("9'0\"", "imperial") === null);
}

console.log("\n10. Round-trip stability: weight");
{
  // A stored kg value displayed and re-entered without change must parse back to the same value.
  // Imperial has some drift due to 0.5 lb rounding; we accept <0.1 kg difference.
  const originalKg = 70;
  const displayed = formatWeight(originalKg, "imperial", false);
  const parsed = parseWeight(displayed, "imperial");
  check("70 kg → display → parse → ~70 kg", parsed != null && approxEqual(parsed, originalKg, 0.1),
    `displayed=${displayed}, parsed=${parsed?.toFixed(2)}, drift=${parsed ? Math.abs(parsed - originalKg).toFixed(2) : 'N/A'} kg`);

  const originalKg2 = 82.5;
  const displayed2 = formatWeight(originalKg2, "imperial", false);
  const parsed2 = parseWeight(displayed2, "imperial");
  check("82.5 kg → display → parse → ~82.5 kg", parsed2 != null && approxEqual(parsed2, originalKg2, 0.1),
    `displayed=${displayed2}, parsed=${parsed2?.toFixed(2)}`);

  // Metric should be perfectly stable (no rounding)
  const metricKg = 70.5;
  const metricDisplay = formatWeight(metricKg, "metric", false);
  const metricParsed = parseWeight(metricDisplay, "metric");
  check("metric: 70.5 kg → display → parse → 70.5 kg", metricParsed === metricKg);
}

console.log("\n11. Round-trip stability: height");
{
  const originalCm = 175;
  const displayed = formatHeight(originalCm, "imperial");
  const parsed = parseHeight(displayed, "imperial");
  check("175 cm → display → parse → 175 cm", parsed != null && approxEqual(parsed, originalCm, 1),
    `displayed=${displayed}, parsed=${parsed?.toFixed(1)}`);

  const originalCm2 = 180;
  const displayed2 = formatHeight(originalCm2, "imperial");
  const parsed2 = parseHeight(displayed2, "imperial");
  check("180 cm → display → parse → 180 cm", parsed2 != null && approxEqual(parsed2, originalCm2, 1),
    `displayed=${displayed2}, parsed=${parsed2?.toFixed(1)}`);

  // Metric should be perfectly stable
  const metricCm = 175.5;
  const metricDisplay = formatHeight(metricCm, "metric", false);
  const metricParsed = parseHeight(metricDisplay, "metric");
  check("metric: 175.5 cm → display → parse → 175.5 cm", metricParsed === metricCm);
}

console.log("\n12. Inch carry at 12: edge cases");
{
  // 5'11.6" should become 6'0"
  const cm = inToCm(71.6);
  const displayed = formatHeight(cm, "imperial");
  check("71.6 inches (5'11.6\") displays as 6'0\"", displayed === `6'0"`, `got ${displayed}`);

  // 5'11.4" should stay 5'11"
  const cm2 = inToCm(71.4);
  const displayed2 = formatHeight(cm2, "imperial");
  check("71.4 inches (5'11.4\") displays as 5'11\"", displayed2 === `5'11"`, `got ${displayed2}`);

  // Exactly 5'12" should become 6'0"
  const cm3 = inToCm(72);
  const displayed3 = formatHeight(cm3, "imperial");
  check("72 inches (6'0\") displays as 6'0\"", displayed3 === `6'0"`, `got ${displayed3}`);
}

console.log("\n13. Unit labels");
{
  check("metric weight label", weightLabel("metric") === "kg");
  check("imperial weight label", weightLabel("imperial") === "lb");
  check("metric height label", heightLabel("metric") === "cm");
  check("imperial height label", heightLabel("imperial") === `ft'in"`);
}

console.log("\n14. Units preference accessor with safe default");
{
  check("'metric' returns metric", getUnitsPreference("metric") === "metric");
  check("'imperial' returns imperial", getUnitsPreference("imperial") === "imperial");
  check("null defaults to metric", getUnitsPreference(null) === "metric");
  check("undefined defaults to metric", getUnitsPreference(undefined) === "metric");
  check("invalid value defaults to metric", getUnitsPreference("invalid") === "metric");
  
  // With custom fallback (e.g. from gym branding)
  check("null with imperial fallback", getUnitsPreference(null, "imperial") === "imperial");
  check("undefined with imperial fallback", getUnitsPreference(undefined, "imperial") === "imperial");
  check("invalid with imperial fallback", getUnitsPreference("kg", "imperial") === "imperial");
  check("valid value ignores fallback", getUnitsPreference("metric", "imperial") === "metric");
  check("imperial value ignores metric fallback", getUnitsPreference("imperial", "metric") === "imperial");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
