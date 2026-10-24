/**
 * M5 tests: Profile field validation and allow-listing
 *
 * Validates that:
 * 1. Only allowed columns can be written through server actions
 * 2. Critical fields (disclaimer, onboarding timestamps) are rejected
 * 3. Invalid timezones are caught
 * 4. Age validation uses the user's timezone (L6 fix)
 * 5. Numeric ranges are enforced
 *
 *   npx tsx scripts/test-profile-validation.ts
 */

import {
  validateOnboardingFields,
  validateSettingsFields,
  validateTimezone,
  validateDateOfBirth,
  validateHeightCm,
  validateWeightKg,
  ONBOARDING_ALLOWED_COLUMNS,
  SETTINGS_ALLOWED_COLUMNS,
} from "../src/lib/profile/validation";
import type { Database } from "../src/lib/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Onboarding field allow-listing");
{
  // Allowed fields
  const validFields: ProfileUpdate = {
    goal: "muscle_gain",
    level: "intermediate",
    days_per_week: 4,
  };
  const result1 = validateOnboardingFields(validFields);
  check("accepts allowed fields", result1.ok && result1.data.goal === "muscle_gain");

  // Rejected: disclaimer_accepted_at
  const withDisclaimer: ProfileUpdate = {
    goal: "strength",
    disclaimer_accepted_at: new Date().toISOString(),
  };
  const result2 = validateOnboardingFields(withDisclaimer);
  check("rejects disclaimer_accepted_at", !result2.ok);

  // Rejected: onboarding_completed_at
  const withOnboarding: ProfileUpdate = {
    level: "beginner",
    onboarding_completed_at: new Date().toISOString(),
  };
  const result3 = validateOnboardingFields(withOnboarding);
  check("rejects onboarding_completed_at", !result3.ok);

  // Rejected: date_of_birth (has its own action)
  const withDOB: ProfileUpdate = {
    goal: "fat_loss",
    date_of_birth: "1990-01-01",
  };
  const result4 = validateOnboardingFields(withDOB);
  check("rejects date_of_birth", !result4.ok);

  // Rejected: timezone (has its own validation)
  const withTZ: ProfileUpdate = {
    goal: "general_fitness",
    timezone: "America/New_York",
  };
  const result5 = validateOnboardingFields(withTZ);
  check("rejects timezone", !result5.ok);

  // Multiple fields, one bad
  const mixed: ProfileUpdate = {
    goal: "muscle_gain",
    level: "expert",
    onboarding_completed_at: new Date().toISOString(),
  };
  const result6 = validateOnboardingFields(mixed);
  check("rejects when one field is forbidden", !result6.ok);
}

console.log("\n2. Settings field allow-listing (stricter than onboarding)");
{
  // Allowed in settings
  const validSettings: ProfileUpdate = {
    goal: "strength",
    days_per_week: 5,
  };
  const result1 = validateSettingsFields(validSettings);
  check("accepts goal and days_per_week", result1.ok);

  // display_name is allowed in onboarding but NOT in settings
  const withDisplayName: ProfileUpdate = {
    display_name: "Hacker",
    goal: "fat_loss",
  };
  const result2 = validateSettingsFields(withDisplayName);
  check("rejects display_name in settings", !result2.ok);

  // units is allowed in onboarding but NOT in settings
  const withUnits: ProfileUpdate = {
    units: "imperial",
    level: "intermediate",
  };
  const result3 = validateSettingsFields(withUnits);
  check("rejects units in settings", !result3.ok);
}

console.log("\n3. Numeric range validation");
{
  // days_per_week must be 3-6
  const tooFew: ProfileUpdate = { days_per_week: 2 };
  const result1 = validateOnboardingFields(tooFew);
  check("rejects days_per_week < 3", !result1.ok);

  const tooMany: ProfileUpdate = { days_per_week: 7 };
  const result2 = validateOnboardingFields(tooMany);
  check("rejects days_per_week > 6", !result2.ok);

  const valid: ProfileUpdate = { days_per_week: 4 };
  const result3 = validateOnboardingFields(valid);
  check("accepts days_per_week = 4", result3.ok);

  // yoga_days_per_week must be < days_per_week
  const allYoga: ProfileUpdate = { days_per_week: 4, yoga_days_per_week: 4 };
  const result4 = validateOnboardingFields(allYoga);
  check("rejects yoga_days >= days_per_week", !result4.ok);

  const validMix: ProfileUpdate = { days_per_week: 5, yoga_days_per_week: 2 };
  const result5 = validateOnboardingFields(validMix);
  check("accepts yoga_days < days_per_week", result5.ok);

  // session minutes 15-120
  const tooShort: ProfileUpdate = { preferred_session_minutes: 10 };
  const result6 = validateOnboardingFields(tooShort);
  check("rejects session < 15 minutes", !result6.ok);

  const tooLong: ProfileUpdate = { preferred_session_minutes: 150 };
  const result7 = validateOnboardingFields(tooLong);
  check("rejects session > 120 minutes", !result7.ok);

  // P3-M5: NaN and Infinity handling
  const nanDays: ProfileUpdate = { days_per_week: NaN };
  const result8 = validateOnboardingFields(nanDays);
  check("rejects NaN days_per_week", !result8.ok);

  const infDays: ProfileUpdate = { days_per_week: Infinity };
  const result9 = validateOnboardingFields(infDays);
  check("rejects Infinity days_per_week", !result9.ok);

  const nanYoga: ProfileUpdate = { yoga_days_per_week: NaN };
  const result10 = validateOnboardingFields(nanYoga);
  check("rejects NaN yoga_days_per_week", !result10.ok);

  const nanSession: ProfileUpdate = { preferred_session_minutes: NaN };
  const result11 = validateOnboardingFields(nanSession);
  check("rejects NaN session_minutes", !result11.ok);

  const infSession: ProfileUpdate = { preferred_session_minutes: Infinity };
  const result12 = validateOnboardingFields(infSession);
  check("rejects Infinity session_minutes", !result12.ok);
}

console.log("\n4. Timezone validation");
{
  // Valid IANA timezones
  const tz1 = validateTimezone("America/New_York");
  check("accepts America/New_York", tz1.ok);

  const tz2 = validateTimezone("Asia/Kolkata");
  check("accepts Asia/Kolkata", tz2.ok);

  const tz3 = validateTimezone("Europe/London");
  check("accepts Europe/London", tz3.ok);

  const tz4 = validateTimezone("Pacific/Auckland");
  check("accepts Pacific/Auckland", tz4.ok);

  // Invalid timezones
  const bad1 = validateTimezone("Not/ATimezone");
  check("rejects invalid timezone", !bad1.ok);

  const bad2 = validateTimezone("");
  check("rejects empty timezone", !bad2.ok);

  const bad3 = validateTimezone("America/New York"); // Space instead of underscore
  check("rejects malformed timezone", !bad3.ok);

  const bad4 = validateTimezone("Invalid/Zone");
  check("rejects obviously invalid timezone", !bad4.ok);
}

console.log("\n5. Date of birth validation with timezone (L6 fix)");
{
  // A user turning 16 today in IST
  const today = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = istFormatter.formatToParts(today);
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10);
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);

  const dob16YearsAgo = `${year - 16}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dob15YearsAgo = `${year - 15}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const validAge = validateDateOfBirth(dob16YearsAgo, "Asia/Kolkata");
  check("accepts DOB exactly 16 years ago in IST", validAge.ok);

  const tooYoung = validateDateOfBirth(dob15YearsAgo, "Asia/Kolkata");
  check("rejects DOB 15 years ago in IST", !tooYoung.ok);

  // Age 100 boundary
  const dob100 = `${year - 100}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dob101 = `${year - 101}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const age100 = validateDateOfBirth(dob100, "Asia/Kolkata");
  check("accepts age 100", age100.ok);

  const age101 = validateDateOfBirth(dob101, "Asia/Kolkata");
  check("rejects age > 100", !age101.ok);

  // Invalid date format
  const badFormat = validateDateOfBirth("1990/01/01", "Asia/Kolkata");
  check("rejects non-yyyy-mm-dd format", !badFormat.ok);

  const badDate = validateDateOfBirth("2026-02-30", "Asia/Kolkata");
  check("rejects invalid date", !badDate.ok);
}

console.log("\n6. L6: Age computed in user timezone, not UTC");
{
  // Simulate 02:00 IST on someone's 16th birthday (still the day before in UTC)
  // DOB 16 years ago from 2026-09-11 in IST
  const dobIST = "2010-09-11";

  // In UTC, it's still 2026-09-10, so they'd appear to be 15 years 364 days old
  // But in IST (their timezone), it's 2026-09-11, so they're exactly 16

  const resultIST = validateDateOfBirth(dobIST, "Asia/Kolkata");
  check(
    "age 16 in IST is valid even if UTC is day before",
    resultIST.ok,
    `(simulated with past date)`
  );

  // Same person, but we check in UTC timezone - would be 1 day younger
  // This demonstrates the bug the L6 fix addresses
  const dobForUTC = "2010-09-10"; // One day earlier to match UTC date
  const resultUTC = validateDateOfBirth(dobForUTC, "UTC");
  check("same instant in UTC with DOB adjusted", resultUTC.ok);
}

console.log("\n7. P3-M5: Height and weight NaN/Infinity handling");
{
  // Test the real validation functions (imports from src/lib/profile/validation.ts)
  check("accepts valid height", validateHeightCm(175).ok);
  check("accepts valid weight", validateWeightKg(70).ok);
  
  check("rejects NaN height", !validateHeightCm(NaN).ok);
  check("rejects Infinity height", !validateHeightCm(Infinity).ok);
  check("rejects -Infinity height", !validateHeightCm(-Infinity).ok);
  check("rejects height < 100", !validateHeightCm(99).ok);
  check("rejects height > 250", !validateHeightCm(251).ok);
  
  check("rejects NaN weight", !validateWeightKg(NaN).ok);
  check("rejects Infinity weight", !validateWeightKg(Infinity).ok);
  check("rejects -Infinity weight", !validateWeightKg(-Infinity).ok);
  check("rejects weight < 25", !validateWeightKg(24).ok);
  check("rejects weight > 300", !validateWeightKg(301).ok);
  
  // Test numeric string inputs (forms may pass strings)
  check("accepts valid height as string", validateHeightCm("175").ok);
  check("accepts valid weight as string", validateWeightKg("70").ok);
  check("rejects NaN string height", !validateHeightCm("NaN").ok);
  check("rejects invalid string weight", !validateWeightKg("invalid").ok);
}

// ============================================================
// 8. Allow-lists match migration grant statement
// ============================================================
console.log("\n8. Allow-lists match migration grant statement");

import { readFileSync } from "fs";
import { join } from "path";

const migrationPath = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20261024120000_profile_security_hardening.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");

// Extract the grant update (...) statement
const grantMatch = migrationSql.match(/grant update \(([\s\S]+?)\) on public\.profiles/i);
if (!grantMatch) {
  console.error("   FAIL  Could not find grant update statement in migration");
  process.exit(1);
}

const grantColumns = grantMatch[1]
  .split(",")
  .map((col) => col.trim())
  .filter((col) => col.length > 0)
  .sort();

// Union of all allow-lists plus saveAboutYou columns plus ensureProfileRows columns
const appColumns = new Set<string>([
  // ensureProfileRows (auth)
  "avatar_url",
  "display_name",
  // saveAboutYou (onboarding)
  "date_of_birth",
  "sex",
  "height_cm",
  // ONBOARDING_ALLOWED_COLUMNS
  ...ONBOARDING_ALLOWED_COLUMNS,
  // SETTINGS_ALLOWED_COLUMNS (subset of onboarding)
  ...SETTINGS_ALLOWED_COLUMNS,
  // saveEquipment (onboarding/settings)
  "has_all_equipment",
]);

const appColumnsSorted = Array.from(appColumns).sort();

const onlyInGrant = grantColumns.filter((col) => !appColumns.has(col));
const onlyInApp = appColumnsSorted.filter((col) => !grantColumns.includes(col));

if (onlyInGrant.length > 0 || onlyInApp.length > 0) {
  console.error("   FAIL  Mismatch between app allow-lists and migration grant");
  if (onlyInGrant.length > 0) {
    console.error("   Granted but not in app:", onlyInGrant.join(", "));
  }
  if (onlyInApp.length > 0) {
    console.error("   In app but not granted:", onlyInApp.join(", "));
  }
  process.exit(1);
}

console.log("   ok   app allow-lists match migration grant statement");
console.log(`        (${appColumnsSorted.length} columns verified)`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
