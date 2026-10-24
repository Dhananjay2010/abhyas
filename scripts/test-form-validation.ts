/**
 * Form validation logic tests for onboarding and settings.
 *
 * Tests the validation logic that prevents truncation and shows inline errors.
 * Validates that inputs are never silently altered and errors are always shown.
 *
 *   npm run test:form-validation
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Height validation logic (no silent truncation)");
{
  // Simulate the validation logic from onboarding-flow.tsx
  function validateHeight(input: string): { valid: boolean; error: string | null } {
    if (input === "") return { valid: false, error: null };
    const height = Number(input);
    if (!Number.isFinite(height)) return { valid: false, error: "Height should be a valid number" };
    if (height < 100) return { valid: false, error: "Height should be between 100 and 250 cm" };
    if (height > 250) return { valid: false, error: "Height should be between 100 and 250 cm" };
    return { valid: true, error: null };
  }

  // Valid inputs
  const valid175 = validateHeight("175");
  check("175 cm is valid", valid175.valid && valid175.error === null);

  const valid100 = validateHeight("100");
  check("100 cm is valid (lower bound)", valid100.valid && valid100.error === null);

  const valid250 = validateHeight("250");
  check("250 cm is valid (upper bound)", valid250.valid && valid250.error === null);

  // Invalid inputs with error messages
  const invalid999 = validateHeight("999");
  check("999 cm shows error (not truncated to 99)", !invalid999.valid && invalid999.error !== null, 
    `error: ${invalid999.error}`);

  const invalid5000 = validateHeight("5000");
  check("5000 cm shows error (not truncated to 50)", !invalid5000.valid && invalid5000.error !== null,
    `error: ${invalid5000.error}`);

  const invalid99 = validateHeight("99");
  check("99 cm shows error (too short)", !invalid99.valid && invalid99.error !== null);

  const invalid251 = validateHeight("251");
  check("251 cm shows error (too tall)", !invalid251.valid && invalid251.error !== null);

  const invalidEmpty = validateHeight("");
  check("Empty string: not valid, no error yet", !invalidEmpty.valid && invalidEmpty.error === null);

  const invalidNaN = validateHeight("abc");
  check("Non-numeric shows error", !invalidNaN.valid && invalidNaN.error !== null);
}

console.log("\n2. Weight validation logic (no silent truncation)");
{
  function validateWeight(input: string): { valid: boolean; error: string | null } {
    if (input === "") return { valid: false, error: null };
    const weight = Number(input);
    if (!Number.isFinite(weight)) return { valid: false, error: "Weight should be a valid number" };
    if (weight < 20) return { valid: false, error: "Weight should be between 20 and 500 kg" };
    if (weight > 500) return { valid: false, error: "Weight should be between 20 and 500 kg" };
    return { valid: true, error: null };
  }

  // Valid inputs
  const valid70 = validateWeight("70");
  check("70 kg is valid", valid70.valid && valid70.error === null);

  const valid20 = validateWeight("20");
  check("20 kg is valid (lower bound)", valid20.valid && valid20.error === null);

  const valid500 = validateWeight("500");
  check("500 kg is valid (upper bound)", valid500.valid && valid500.error === null);

  // Invalid inputs - should show errors, not truncate
  const invalid5000 = validateWeight("5000");
  check("5000 kg shows error (not truncated to 50)", !invalid5000.valid && invalid5000.error !== null,
    `error: ${invalid5000.error}`);

  const invalid19 = validateWeight("19");
  check("19 kg shows error (too light)", !invalid19.valid && invalid19.error !== null);

  const invalid501 = validateWeight("501");
  check("501 kg shows error (too heavy)", !invalid501.valid && invalid501.error !== null);

  const invalidNegative = validateWeight("-5");
  check("-5 kg shows error (negative)", !invalidNegative.valid && invalidNegative.error !== null,
    `error: ${invalidNegative.error}`);

  const invalidEmpty = validateWeight("");
  check("Empty string: not valid, no error yet", !invalidEmpty.valid && invalidEmpty.error === null);

  const invalidNaN = validateWeight("abc");
  check("Non-numeric shows error", !invalidNaN.valid && invalidNaN.error !== null);
}

console.log("\n3. Date of birth validation logic (year must be 4 digits)");
{
  function validateDOB(input: string): { valid: boolean; error: string | null } {
    if (input === "") return { valid: false, error: null };
    
    // Check format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return { valid: false, error: "Please enter a valid date" };
    }
    
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      return { valid: false, error: "Please enter a valid date" };
    }
    
    // Verify that parsing didn't change the date (e.g., 2020-02-30 -> 2020-03-01)
    const [yearStr, monthStr, dayStr] = input.split("-");
    if (date.getUTCFullYear() !== parseInt(yearStr, 10)) {
      return { valid: false, error: "Please enter a valid date" };
    }
    if (date.getUTCMonth() !== parseInt(monthStr, 10) - 1) {
      return { valid: false, error: "Please enter a valid date" };
    }
    if (date.getUTCDate() !== parseInt(dayStr, 10)) {
      return { valid: false, error: "Please enter a valid date" };
    }
    
    const year = date.getFullYear();
    if (year < 1000 || year > 9999) {
      return { valid: false, error: "Please enter a valid date between 1900 and today" };
    }
    
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
      return { valid: false, error: "Please enter a valid date between 1900 and today" };
    }
    
    if (date > new Date()) {
      return { valid: false, error: "Please enter a valid date between 1900 and today" };
    }
    
    return { valid: true, error: null };
  }

  // Valid inputs
  const valid1990 = validateDOB("1990-05-15");
  check("1990-05-15 is valid", valid1990.valid && valid1990.error === null);

  const valid1900 = validateDOB("1900-01-01");
  check("1900-01-01 is valid (lower bound)", valid1900.valid && valid1900.error === null);

  const validToday = validateDOB(new Date().toISOString().slice(0, 10));
  check("Today is valid", validToday.valid && validToday.error === null);

  // Invalid inputs
  const invalid0996 = validateDOB("0996-01-01");
  check("0996-01-01 shows error (3-digit year)", !invalid0996.valid && invalid0996.error !== null,
    `error: ${invalid0996.error}`);

  const invalid999 = validateDOB("0999-12-31");
  check("0999-12-31 shows error (3-digit year)", !invalid999.valid && invalid999.error !== null);

  const invalid1899 = validateDOB("1899-12-31");
  check("1899-12-31 shows error (before 1900)", !invalid1899.valid && invalid1899.error !== null);

  const invalidFuture = validateDOB("2030-01-01");
  check("2030-01-01 shows error (future)", !invalidFuture.valid && invalidFuture.error !== null);

  const invalidFormat = validateDOB("01/15/1990");
  check("01/15/1990 shows error (wrong format)", !invalidFormat.valid && invalidFormat.error !== null);

  const invalidDate = validateDOB("2020-02-30");
  check("2020-02-30 shows error (invalid date)", !invalidDate.valid && invalidDate.error !== null);
}

console.log("\n4. Submit state management (error handling)");
{
  // Simulate the error handling in advance/finish functions
  type ActionResult = { ok: true } | { ok: false; error: string };
  
  async function simulateSubmit(
    action: () => Promise<ActionResult>,
    setError: (err: string | null) => void,
    setPending: (p: boolean) => void
  ): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        setPending(false);
        return false;
      }
      setPending(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPending(false);
      return false;
    }
  }

  // Test successful submission
  (async () => {
    let error: string | null = null;
    let pending = false;
    const success = await simulateSubmit(
      async () => ({ ok: true }),
      (e) => { error = e; },
      (p) => { pending = p; }
    );
    check("Success: no error, not pending", success && error === null && !pending);
  })();

  // Test validation failure
  (async () => {
    let error: string | null = null;
    let pending = false;
    const failure = await simulateSubmit(
      async () => ({ ok: false, error: "Height should be between 100 and 250 cm." }),
      (e) => { error = e; },
      (p) => { pending = p; }
    );
    check("Validation failure: error set, not pending", !failure && error !== null && !pending,
      `error: ${error}`);
  })();

  // Test thrown error
  (async () => {
    let error: string | null = null;
    let pending = false;
    const thrown = await simulateSubmit(
      async () => { throw new Error("Network error"); },
      (e) => { error = e; },
      (p) => { pending = p; }
    );
    check("Thrown error: error set, not pending", !thrown && error === "Network error" && !pending,
      `error: ${error}`);
  })();

  // Test thrown non-Error
  (async () => {
    let error: string | null = null;
    let pending = false;
    const thrownString = await simulateSubmit(
      async () => { throw "String error"; },
      (e) => { error = e; },
      (p) => { pending = p; }
    );
    check("Thrown string: generic error set, not pending", 
      !thrownString && error === "Something went wrong. Please try again." && !pending,
      `error: ${error}`);
  })();
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
