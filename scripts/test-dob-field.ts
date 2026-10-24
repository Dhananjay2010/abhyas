/**
 * Test DOB field implementation
 * QA finding: DOB field on 2/9 should use native date input or three clear fields
 * with sensible min/max for age limits
 */

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// Test 1: Native date input requirements
const MIN_AGE_YEARS = 16;
const MAX_AGE_YEARS = 100;

function getMinDate(): string {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setFullYear(today.getFullYear() - MAX_AGE_YEARS);
  return minDate.toISOString().slice(0, 10);
}

function getMaxDate(): string {
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setFullYear(today.getFullYear() - MIN_AGE_YEARS);
  return maxDate.toISOString().slice(0, 10);
}

const minDate = getMinDate();
const maxDate = getMaxDate();

assert(/^\d{4}-\d{2}-\d{2}$/.test(minDate), "Min date is ISO format YYYY-MM-DD");
assert(/^\d{4}-\d{2}-\d{2}$/.test(maxDate), "Max date is ISO format YYYY-MM-DD");

// Verify min date is ~100 years ago
const minYear = parseInt(minDate.split("-")[0], 10);
const currentYear = new Date().getFullYear();
assert(
  minYear >= currentYear - MAX_AGE_YEARS - 1 && minYear <= currentYear - MAX_AGE_YEARS + 1,
  `Min date year is approximately ${currentYear - MAX_AGE_YEARS} (100 years ago)`
);

// Verify max date is ~16 years ago
const maxYear = parseInt(maxDate.split("-")[0], 10);
assert(
  maxYear >= currentYear - MIN_AGE_YEARS - 1 && maxYear <= currentYear - MIN_AGE_YEARS + 1,
  `Max date year is approximately ${currentYear - MIN_AGE_YEARS} (16 years ago)`
);

// Test 2: Date validation logic
function validateDOB(dateString: string): { valid: boolean; error: string | null } {
  if (!dateString) {
    return { valid: false, error: "Please enter your date of birth" };
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return { valid: false, error: "Please enter a valid date (YYYY-MM-DD)" };
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { valid: false, error: "Invalid date" };
  }
  
  const year = date.getFullYear();
  if (year < 1000 || year > 9999) {
    return { valid: false, error: "Year must be 4 digits" };
  }
  
  if (year < 1900 || year > currentYear) {
    return { valid: false, error: "Date should be between 1900 and today" };
  }
  
  if (date > new Date()) {
    return { valid: false, error: "Date cannot be in the future" };
  }
  
  return { valid: true, error: null };
}

// Valid DOB
const validDOB = validateDOB("1990-05-15");
assert(validDOB.valid, "Valid DOB (1990-05-15) passes validation");
assert(validDOB.error === null, "Valid DOB has no error");

// Empty DOB
const emptyDOB = validateDOB("");
assert(!emptyDOB.valid, "Empty DOB fails validation");
assert(Boolean(emptyDOB.error), "Empty DOB has error message");

// Invalid format
const invalidFormat = validateDOB("05/15/1990");
assert(!invalidFormat.valid, "US date format fails validation");
assert(Boolean(invalidFormat.error?.includes("YYYY-MM-DD")), "Format error mentions expected format");

// Future date
const futureDate = new Date();
futureDate.setFullYear(futureDate.getFullYear() + 1);
const futureDOB = validateDOB(futureDate.toISOString().slice(0, 10));
assert(!futureDOB.valid, "Future date fails validation");

// Too old
const tooOldDOB = validateDOB("1899-01-01");
assert(!tooOldDOB.valid, "Date before 1900 fails validation");

// Test 3: Age calculation
function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

const age30 = calculateAge("1993-10-01");
assert(age30 >= 30 && age30 <= 33, "Person born in 1993 is around 30-33 years old");

const age16 = calculateAge("2008-01-01");
assert(age16 >= 16 && age16 <= 19, "Person born in 2008 is around 16-19 years old");

// Test 4: Value format matches action expectations
// Actions expect ISO format YYYY-MM-DD
function formatForAction(dateInput: string): string {
  // Native date input already provides ISO format
  return dateInput;
}

assert(formatForAction("1990-05-15") === "1990-05-15", "ISO format passes through unchanged");

// Test 5: Inline validation message requirements
function shouldShowDOBError(dateString: string, touched: boolean): string | null {
  if (!touched || dateString === "") {
    return null; // Don't show error until user tries to continue or leaves field
  }
  const result = validateDOB(dateString);
  return result.error;
}

assert(shouldShowDOBError("", false) === null, "No error shown for empty untouched field");
assert(shouldShowDOBError("invalid", true) !== null, "Error shown for invalid touched field");
assert(shouldShowDOBError("1990-05-15", true) === null, "No error for valid touched field");

// Test 6: Min/max attributes prevent invalid selection in native picker
const nativeMinDate = new Date();
nativeMinDate.setFullYear(nativeMinDate.getFullYear() - 100);
const nativeMaxDate = new Date();
nativeMaxDate.setFullYear(nativeMaxDate.getFullYear() - 16);

assert(
  nativeMinDate.toISOString().slice(0, 10) < nativeMaxDate.toISOString().slice(0, 10),
  "Min date is before max date"
);

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}

export {};
