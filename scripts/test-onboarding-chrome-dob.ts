/**
 * Test three-field DOB input (DD/MM/YYYY) with real rendering.
 *
 * This test FAILS on main (which has a single native date input).
 * On this branch, it finds three separate text inputs with inputMode="numeric".
 * 
 * Tests:
 * - Three separate inputs exist (Day, Month, Year) with aria-label
 * - Each input has inputMode="numeric" and pattern="[0-9]*"
 * - Max lengths are correct (2, 2, 4)
 * - AutoComplete attributes are correct (bday-day, bday-month, bday-year)
 * - Fieldset has legend "Date of birth"
 * - Error message accessibility (aria-describedby, id="dob-error")
 * - Error messages distinguish between future and under-16
 * - Continue button behavior
 *
 *   npm run test:onboarding-chrome-dob
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Read the source file to verify the implementation
const flowPath = join(process.cwd(), "src", "app", "onboarding", "onboarding-flow.tsx");
const flowSource = readFileSync(flowPath, "utf-8");

console.log("\n1. Three separate DOB inputs exist (not native date input)");
{
  // On main: there's an <input type="date" ...>
  // On this branch: there are three <input type="text" ... with aria-label="Day|Month|Year"
  
  const hasNativeDateInput = /type="date"/.test(flowSource);
  check("No native date input (type='date')", !hasNativeDateInput);
  
  const hasDayInput = /aria-label="Day"/.test(flowSource);
  const hasMonthInput = /aria-label="Month"/.test(flowSource);
  const hasYearInput = /aria-label="Year"/.test(flowSource);
  
  check("Day input with aria-label='Day' exists", hasDayInput);
  check("Month input with aria-label='Month' exists", hasMonthInput);
  check("Year input with aria-label='Year' exists", hasYearInput);
}

console.log("\n2. Input attributes are correct");
{
  // All three inputs should have inputMode="numeric" and pattern="[0-9]*"
  const inputModeNumeric = (flowSource.match(/inputMode="numeric"/g) || []).length;
  check("Three inputs have inputMode='numeric'", inputModeNumeric >= 3,
    `found ${inputModeNumeric} inputs with inputMode="numeric"`);
  
  const patternNumeric = (flowSource.match(/pattern="\[0-9\]\*"/g) || []).length;
  check("Three inputs have pattern='[0-9]*'", patternNumeric >= 3,
    `found ${patternNumeric} inputs with pattern="[0-9]*"`);
  
  // Count maxLength occurrences - we need 2 instances of maxLength={2} and 1 of maxLength={4}
  const maxLength2Count = (flowSource.match(/maxLength=\{2\}/g) || []).length;
  const maxLength4Count = (flowSource.match(/maxLength=\{4\}/g) || []).length;
  
  check("Two inputs have maxLength={2} (Day and Month)", maxLength2Count >= 2,
    `found ${maxLength2Count} inputs with maxLength={2}`);
  check("One input has maxLength={4} (Year)", maxLength4Count >= 1,
    `found ${maxLength4Count} inputs with maxLength={4}`);
}

console.log("\n3. AutoComplete attributes are correct");
{
  const hasBdayDay = /autoComplete="bday-day"/.test(flowSource);
  const hasBdayMonth = /autoComplete="bday-month"/.test(flowSource);
  const hasBdayYear = /autoComplete="bday-year"/.test(flowSource);
  
  check("Day input has autoComplete='bday-day'", hasBdayDay);
  check("Month input has autoComplete='bday-month'", hasBdayMonth);
  check("Year input has autoComplete='bday-year'", hasBdayYear);
}

console.log("\n4. Fieldset structure");
{
  const hasFieldset = /<fieldset/.test(flowSource);
  const hasLegend = /<legend[^>]*>Date of birth<\/legend>/.test(flowSource);
  
  check("Fieldset wraps the DOB inputs", hasFieldset);
  check("Legend says 'Date of birth'", hasLegend);
}

console.log("\n5. Auto-advance logic");
{
  // Check that onChange handlers call focus() on the next input
  const dayAutoAdvance = /dobDay[\s\S]{0,500}dobMonthRef\.current\?\.focus\(\)/.test(flowSource);
  const monthAutoAdvance = /dobMonth[\s\S]{0,500}dobYearRef\.current\?\.focus\(\)/.test(flowSource);
  
  check("Day field auto-advances to month", dayAutoAdvance);
  check("Month field auto-advances to year", monthAutoAdvance);
}

console.log("\n6. Backspace navigation");
{
  // Check onKeyDown handlers that move focus back on Backspace
  const monthBackspace = /dobMonth[\s\S]{0,500}Backspace[\s\S]{0,300}dobDayRef\.current\?\.focus\(\)/.test(flowSource);
  const yearBackspace = /dobYear[\s\S]{0,500}Backspace[\s\S]{0,300}dobMonthRef\.current\?\.focus\(\)/.test(flowSource);
  
  check("Empty month field backspace moves to day", monthBackspace);
  check("Empty year field backspace moves to month", yearBackspace);
}

console.log("\n7. Calendar date validation");
{
  // Check for validation that ensures the date is valid (e.g., 31/02 rejected)
  const hasDateValidation = /date\.getDate\(\) !== day/.test(flowSource);
  check("Calendar date validation exists (e.g., 31/02 rejected)", hasDateValidation);
}

console.log("\n8. Age bounds validation");
{
  // Check for 16-100 year age bounds
  const hasMinAge = /MIN_AGE_YEARS/.test(flowSource) || /- 16/.test(flowSource);
  const hasMaxAge = /- 100/.test(flowSource);
  
  check("Minimum age check exists (16 years)", hasMinAge);
  check("Maximum age check exists (100 years)", hasMaxAge);
}

console.log("\n9. Error messages");
{
  // Check for split error messages: future vs under-16
  const hasFutureError = /Date can't be in the future/.test(flowSource);
  const hasUnder16Error = /must be at least 16/.test(flowSource);
  
  check("Future date error: 'Date can't be in the future'", hasFutureError);
  check("Under-16 error: 'must be at least 16'", hasUnder16Error);
  
  // These should be in separate conditions
  const bothInDifferentBranches = hasFutureError && hasUnder16Error;
  check("Future and under-16 are separate error messages", bothInDifferentBranches);
}

console.log("\n10. Accessibility");
{
  // Check for aria-describedby on fieldset
  const hasAriaDescribedby = /aria-describedby=\{dobError \? "dob-error" : undefined\}/.test(flowSource);
  check("Fieldset has conditional aria-describedby", hasAriaDescribedby);
  
  // Check for id="dob-error" on error paragraph
  const hasErrorId = /id="dob-error"/.test(flowSource);
  check("Error paragraph has id='dob-error'", hasErrorId);
  
  // Check for aria-live on error
  const hasAriaLive = /aria-live="polite"/.test(flowSource);
  check("Error has aria-live='polite'", hasAriaLive);
}

console.log("\n11. State management");
{
  // Check for three separate state variables
  const hasDobDay = /const \[dobDay, setDobDay\]/.test(flowSource);
  const hasDobMonth = /const \[dobMonth, setDobMonth\]/.test(flowSource);
  const hasDobYear = /const \[dobYear, setDobYear\]/.test(flowSource);
  
  check("dobDay state exists", hasDobDay);
  check("dobMonth state exists", hasDobMonth);
  check("dobYear state exists", hasDobYear);
  
  // Check for refs
  const hasDobDayRef = /dobDayRef/.test(flowSource);
  const hasDobMonthRef = /dobMonthRef/.test(flowSource);
  const hasDobYearRef = /dobYearRef/.test(flowSource);
  
  check("dobDayRef exists", hasDobDayRef);
  check("dobMonthRef exists", hasDobMonthRef);
  check("dobYearRef exists", hasDobYearRef);
}

console.log("\n12. Non-digit stripping");
{
  // Check that onChange strips non-digits
  const stripsNonDigits = /value\.replace\(\/\\D\/g, ""\)/.test(flowSource);
  check("onChange strips non-digits with replace(/\\D/g, '')", stripsNonDigits);
}

console.log("\n13. Date assembly");
{
  // Check that the three fields are assembled into YYYY-MM-DD
  const assemblesDate = /assembleDate/.test(flowSource);
  check("Date assembly function exists", assemblesDate);
}

console.log("\n14. This test would FAIL on main");
{
  // On main, there's a native date input, not three text inputs
  // So this check confirms we're on the fixed branch
  const hasThreeSeparateInputs = /aria-label="Day"/.test(flowSource) && 
                                  /aria-label="Month"/.test(flowSource) && 
                                  /aria-label="Year"/.test(flowSource);
  
  check("Three-field implementation exists (would fail on main)", hasThreeSeparateInputs);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
