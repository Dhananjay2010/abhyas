/**
 * Unit tests for dob.ts helpers.
 * 
 * Covers calendar validation, leap years, timezone neutrality, and age bounds.
 * Run with: TZ=Asia/Kolkata tsx scripts/test-dob-logic.ts && TZ=America/Los_Angeles tsx scripts/test-dob-logic.ts
 */

import { parseDobParts, validateDob, getDobErrorMessage } from "../src/lib/onboarding/dob";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

console.log(`\n🧪 Testing dob helpers (TZ=${process.env.TZ || "system default"})\n`);

// parseDobParts: 31/02 is invalid
assert(parseDobParts("31", "02", "2023") === null, "31/02/2023 should be invalid");

// parseDobParts: 29/02 valid only in leap years
assert(parseDobParts("29", "02", "2024") === "2024-02-29", "29/02/2024 should be valid (leap year)");
assert(parseDobParts("29", "02", "2023") === null, "29/02/2023 should be invalid (not a leap year)");
assert(parseDobParts("29", "02", "1900") === null, "29/02/1900 should be invalid (not a leap year)");
assert(parseDobParts("29", "02", "2000") === "2000-02-29", "29/02/2000 should be valid (leap year)");

// parseDobParts: various valid and invalid dates
assert(parseDobParts("01", "01", "2000") === "2000-01-01", "01/01/2000 should be valid");
assert(parseDobParts("31", "12", "1999") === "1999-12-31", "31/12/1999 should be valid");
assert(parseDobParts("32", "01", "2000") === null, "32/01/2000 should be invalid");
assert(parseDobParts("01", "13", "2000") === null, "01/13/2000 should be invalid");
assert(parseDobParts("0", "1", "2000") === null, "0/1/2000 should be invalid (day < 1)");

// validateDob: exactly 16 today accepted, 16 tomorrow rejected
const today = new Date();
today.setHours(0, 0, 0, 0);
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const exactly16YearsAgo = new Date(today);
exactly16YearsAgo.setFullYear(today.getFullYear() - 16);
const exactly16Iso = `${exactly16YearsAgo.getFullYear()}-${String(exactly16YearsAgo.getMonth() + 1).padStart(2, '0')}-${String(exactly16YearsAgo.getDate()).padStart(2, '0')}`;
assert(validateDob(exactly16Iso, todayIso) === null, "Exactly 16 years ago should be accepted");

const sixteenTomorrow = new Date(exactly16YearsAgo);
sixteenTomorrow.setDate(sixteenTomorrow.getDate() + 1);
const sixteenTomorrowIso = `${sixteenTomorrow.getFullYear()}-${String(sixteenTomorrow.getMonth() + 1).padStart(2, '0')}-${String(sixteenTomorrow.getDate()).padStart(2, '0')}`;
assert(validateDob(sixteenTomorrowIso, todayIso) === "under16", "16 years tomorrow (15y364d) should be rejected");

// validateDob: over 100 rejected
const over100YearsAgo = new Date(today);
over100YearsAgo.setFullYear(today.getFullYear() - 101);
const over100Iso = `${over100YearsAgo.getFullYear()}-${String(over100YearsAgo.getMonth() + 1).padStart(2, '0')}-${String(over100YearsAgo.getDate()).padStart(2, '0')}`;
assert(validateDob(over100Iso, todayIso) === "over100", "Over 100 years ago should be rejected");

const exactly100YearsAgo = new Date(today);
exactly100YearsAgo.setFullYear(today.getFullYear() - 100);
const exactly100Iso = `${exactly100YearsAgo.getFullYear()}-${String(exactly100YearsAgo.getMonth() + 1).padStart(2, '0')}-${String(exactly100YearsAgo.getDate()).padStart(2, '0')}`;
assert(validateDob(exactly100Iso, todayIso) === null, "Exactly 100 years ago should be accepted");

// validateDob: future date returns 'future'
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
assert(validateDob(tomorrowIso, todayIso) === "future", "Tomorrow should return 'future'");
assert(validateDob(todayIso, todayIso) === "future", "Today should return 'future' (must be before today)");

// validateDob: invalid dates
assert(validateDob("2023-02-31", todayIso) === "invalid", "2023-02-31 should be invalid");
assert(validateDob("not-a-date", todayIso) === "invalid", "Non-date string should be invalid");
assert(validateDob("", todayIso) === "invalid", "Empty string should be invalid");

// getDobErrorMessage
assert(getDobErrorMessage("future") === "Date can't be in the future", "future error message");
assert(getDobErrorMessage("under16") === "You must be at least 16 years old", "under16 error message");
assert(getDobErrorMessage("over100") === "Please check your date of birth", "over100 error message");
assert(getDobErrorMessage("invalid") === "Please enter a valid date", "invalid error message");

// Timezone neutrality: same inputs should produce same outputs regardless of TZ
// This is tested implicitly by running this file under different TZ values
// The key is that Date construction uses local time, not UTC

console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
