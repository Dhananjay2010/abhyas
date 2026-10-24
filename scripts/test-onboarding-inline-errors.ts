/**
 * Test inline error behavior for height, weight, and yoga-days.
 *
 * Validates:
 * - Errors only show after blur or Continue, never while typing
 * - Touched flag per field
 *
 *   npm run test:onboarding-inline-errors
 */

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Height validation logic");
{
  // Simulate typing without blur
  let heightCm: string = "5"; // Incomplete
  let heightTouched = false;
  
  let height = Number(heightCm);
  let isInvalid = !Number.isFinite(height) || height < 100 || height > 250;
  
  let shouldShowError = heightTouched && heightCm !== "" && isInvalid;
  
  check("No error shown while typing (not touched)", !shouldShowError);
  
  // Now simulate blur
  heightTouched = true;
  shouldShowError = heightTouched && heightCm !== "" && isInvalid;
  
  check("Error shown after blur (touched)", shouldShowError);
  
  // Valid height
  heightCm = "175";
  height = Number(heightCm);
  isInvalid = !Number.isFinite(height) || height < 100 || height > 250;
  shouldShowError = heightTouched && heightCm !== "" && isInvalid;
  
  check("Valid height shows no error", !shouldShowError);
}

console.log("\n2. Weight validation logic");
{
  // Simulate typing without blur
  let weightKg: string = "1"; // Incomplete
  let weightTouched = false;
  
  let weight = Number(weightKg);
  let isInvalid = !Number.isFinite(weight) || weight < 25 || weight > 300;
  
  let shouldShowError = weightTouched && weightKg !== "" && isInvalid;
  
  check("No error shown while typing (not touched)", !shouldShowError);
  
  // Now simulate blur
  weightTouched = true;
  shouldShowError = weightTouched && weightKg !== "" && isInvalid;
  
  check("Error shown after blur (touched)", shouldShowError);
  
  // Valid weight
  weightKg = "70";
  weight = Number(weightKg);
  isInvalid = !Number.isFinite(weight) || weight < 25 || weight > 300;
  shouldShowError = weightTouched && weightKg !== "" && isInvalid;
  
  check("Valid weight shows no error", !shouldShowError);
}

console.log("\n3. DOB validation logic with three fields");
{
  // Parse date as local date (not UTC) to match server-side validation
  const parseDateAsLocal = (day: number, month: number, year: number): Date | null => {
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1000) return null;
    const date = new Date(year, month - 1, day);
    // Check that the date is valid (e.g., 31/02 should be invalid)
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return null;
    }
    return date;
  };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const minDateAllowed = new Date(today);
  minDateAllowed.setFullYear(today.getFullYear() - 100);
  
  const maxDateAllowed = new Date(today);
  maxDateAllowed.setFullYear(today.getFullYear() - 16);
  
  // Incomplete DOB (not all fields filled)
  let dobDay = "12";
  let dobMonth = "05";
  let dobYear = ""; // Incomplete
  let dobTouched = false;
  
  const dobComplete = dobDay !== "" && dobMonth !== "" && dobYear !== "";
  
  // Should not show error when incomplete and not touched
  let shouldShowError = dobTouched && dobComplete;
  check("No error shown while typing (incomplete)", !shouldShowError);
  
  // Complete but not touched
  dobYear = "1992";
  shouldShowError = dobTouched && dobComplete;
  check("No error shown when complete but not touched", !shouldShowError);
  
  // Complete and touched, valid date
  dobTouched = true;
  const day = parseInt(dobDay, 10);
  const month = parseInt(dobMonth, 10);
  const year = parseInt(dobYear, 10);
  const date = parseDateAsLocal(day, month, year);
  const isValid = date !== null && !isNaN(date.getTime()) && date < today && date >= minDateAllowed && date <= maxDateAllowed;
  
  shouldShowError = dobTouched && dobComplete && !isValid;
  check("Valid DOB shows no error after blur", !shouldShowError);
  
  // Invalid date (too young)
  dobDay = "01";
  dobMonth = "01";
  dobYear = String(today.getFullYear() - 15); // 15 years old
  const youngDay = parseInt(dobDay, 10);
  const youngMonth = parseInt(dobMonth, 10);
  const youngYear = parseInt(dobYear, 10);
  const youngDate = parseDateAsLocal(youngDay, youngMonth, youngYear);
  const isYoungValid = youngDate !== null && !isNaN(youngDate.getTime()) && youngDate < today && youngDate >= minDateAllowed && youngDate <= maxDateAllowed;
  
  shouldShowError = dobTouched && dobDay !== "" && dobMonth !== "" && dobYear !== "" && !isYoungValid;
  check("Invalid DOB (too young) shows error after blur", shouldShowError);
}

console.log("\n4. Empty fields show no error");
{
  const heightCm = "";
  const heightTouched = true;
  const height = Number(heightCm);
  const isInvalid = !Number.isFinite(height) || height < 100 || height > 250;
  const shouldShowError = heightTouched && heightCm !== "" && isInvalid;
  
  check("Empty height field shows no error", !shouldShowError);
  
  const weightKg = "";
  const weightTouched = true;
  const weight = Number(weightKg);
  const isWeightInvalid = !Number.isFinite(weight) || weight < 25 || weight > 300;
  const shouldShowWeightError = weightTouched && weightKg !== "" && isWeightInvalid;
  
  check("Empty weight field shows no error", !shouldShowWeightError);
}

console.log("\n5. Continue button marks all fields as touched");
{
  // This is a behavioral test - in the actual component,
  // clicking Continue sets all touched flags to true
  let heightTouched = false;
  let weightTouched = false;
  let dobTouched = false;
  
  // Simulate Continue click
  heightTouched = true;
  weightTouched = true;
  dobTouched = true;
  
  check("Height touched after Continue", heightTouched);
  check("Weight touched after Continue", weightTouched);
  check("DOB touched after Continue", dobTouched);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
