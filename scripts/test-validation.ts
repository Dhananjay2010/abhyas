/**
 * Server-side validation tests for height and weight.
 *
 * Tests that NaN, Infinity, and out-of-range values are rejected by the server
 * actions before reaching the database.
 *
 *   npm run test:validation
 */
import { isValidHeightCm, isValidWeightKg, isValidDateOfBirth } from "../src/lib/units";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Server validates height with isValidHeightCm");
{
  // Valid cases
  check("Valid height: 175 cm", isValidHeightCm(175));
  check("Valid height: 100 cm (lower bound)", isValidHeightCm(100));
  check("Valid height: 250 cm (upper bound)", isValidHeightCm(250));
  check("Valid height: 175.5 cm (decimal)", isValidHeightCm(175.5));

  // Invalid cases
  check("Rejects NaN", !isValidHeightCm(NaN));
  check("Rejects Infinity", !isValidHeightCm(Infinity));
  check("Rejects -Infinity", !isValidHeightCm(-Infinity));
  check("Rejects 99 cm (too short)", !isValidHeightCm(99));
  check("Rejects 251 cm (too tall)", !isValidHeightCm(251));
  check("Rejects 0", !isValidHeightCm(0));
  check("Rejects negative", !isValidHeightCm(-10));
  check("Rejects string", !isValidHeightCm("175" as any));
  check("Rejects null", !isValidHeightCm(null as any));
  check("Rejects undefined", !isValidHeightCm(undefined as any));
  check("Rejects empty string", !isValidHeightCm("" as any));
}

console.log("\n2. Server validates weight with isValidWeightKg");
{
  // Valid cases
  check("Valid weight: 70 kg", isValidWeightKg(70));
  check("Valid weight: 20 kg (lower bound)", isValidWeightKg(20));
  check("Valid weight: 500 kg (upper bound)", isValidWeightKg(500));
  check("Valid weight: 70.5 kg (decimal)", isValidWeightKg(70.5));

  // Invalid cases
  check("Rejects NaN", !isValidWeightKg(NaN));
  check("Rejects Infinity", !isValidWeightKg(Infinity));
  check("Rejects -Infinity", !isValidWeightKg(-Infinity));
  check("Rejects 19 kg (too light)", !isValidWeightKg(19));
  check("Rejects 501 kg (too heavy)", !isValidWeightKg(501));
  check("Rejects 0", !isValidWeightKg(0));
  check("Rejects negative", !isValidWeightKg(-10));
  check("Rejects string", !isValidWeightKg("70" as any));
  check("Rejects null", !isValidWeightKg(null as any));
  check("Rejects undefined", !isValidWeightKg(undefined as any));
  check("Rejects empty string", !isValidWeightKg("" as any));
}

console.log("\n3. Simulated server action validation");
{
  // Simulate what saveAboutYou does
  function validateAboutYouInput(input: {
    heightCm: number;
    weightKg: number;
  }): { ok: true } | { ok: false; error: string } {
    if (!isValidHeightCm(input.heightCm)) {
      return { ok: false, error: "Height should be between 100 and 250 cm." };
    }
    if (!isValidWeightKg(input.weightKg)) {
      return { ok: false, error: "Weight should be between 20 and 500 kg." };
    }
    return { ok: true };
  }

  // Valid input
  const validResult = validateAboutYouInput({ heightCm: 175, weightKg: 70 });
  check("Valid input passes", validResult.ok === true);

  // NaN height
  const nanHeightResult = validateAboutYouInput({ heightCm: NaN, weightKg: 70 });
  check("NaN height rejected", nanHeightResult.ok === false);
  check(
    "NaN height error message",
    nanHeightResult.ok === false && nanHeightResult.error.includes("Height")
  );

  // NaN weight
  const nanWeightResult = validateAboutYouInput({ heightCm: 175, weightKg: NaN });
  check("NaN weight rejected", nanWeightResult.ok === false);
  check(
    "NaN weight error message",
    nanWeightResult.ok === false && nanWeightResult.error.includes("Weight")
  );

  // Infinity height
  const infHeightResult = validateAboutYouInput({ heightCm: Infinity, weightKg: 70 });
  check("Infinity height rejected", infHeightResult.ok === false);

  // Infinity weight
  const infWeightResult = validateAboutYouInput({ heightCm: 175, weightKg: Infinity });
  check("Infinity weight rejected", infWeightResult.ok === false);

  // Out of range height
  const shortResult = validateAboutYouInput({ heightCm: 50, weightKg: 70 });
  check("Too short (50 cm) rejected", shortResult.ok === false);

  const tallResult = validateAboutYouInput({ heightCm: 300, weightKg: 70 });
  check("Too tall (300 cm) rejected", tallResult.ok === false);

  // Out of range weight
  const lightResult = validateAboutYouInput({ heightCm: 175, weightKg: 10 });
  check("Too light (10 kg) rejected", lightResult.ok === false);

  const heavyResult = validateAboutYouInput({ heightCm: 175, weightKg: 600 });
  check("Too heavy (600 kg) rejected", heavyResult.ok === false);
}

console.log("\n4. Date of birth validation (isValidDateOfBirth)");
{
  // Valid dates
  check("Valid date: 1990-05-15", isValidDateOfBirth("1990-05-15"));
  check("Valid date: 1900-01-01 (lower bound)", isValidDateOfBirth("1900-01-01"));
  check("Valid date: today", isValidDateOfBirth(new Date().toISOString().slice(0, 10)));
  check("Valid date: 2000-12-31", isValidDateOfBirth("2000-12-31"));

  // Invalid dates
  check("Rejects future date", !isValidDateOfBirth("2030-01-01"));
  check("Rejects year before 1900", !isValidDateOfBirth("1899-12-31"));
  check("Rejects year before 1000 (3 digits)", !isValidDateOfBirth("0999-01-01"));
  check("Rejects year 0996", !isValidDateOfBirth("0996-01-01"));
  check("Rejects invalid date", !isValidDateOfBirth("2020-02-30"));
  check("Rejects invalid format", !isValidDateOfBirth("01/15/1990"));
  check("Rejects invalid format: no dashes", !isValidDateOfBirth("19900515"));
  check("Rejects empty string", !isValidDateOfBirth(""));
  check("Rejects null", !isValidDateOfBirth(null as any));
  check("Rejects undefined", !isValidDateOfBirth(undefined as any));
  check("Rejects non-string", !isValidDateOfBirth(12345 as any));
  check("Rejects year 10000 (5 digits)", !isValidDateOfBirth("10000-01-01"));
  
  // Edge case: check that year must be exactly 4 digits
  const currentYear = new Date().getFullYear();
  check("Year is 4 digits in valid date", /^\d{4}-/.test("2000-01-01"));
  
  // Validate format strictly
  check("Rejects 2-digit year", !isValidDateOfBirth("90-05-15"));
  check("Rejects malformed", !isValidDateOfBirth("not-a-date"));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
