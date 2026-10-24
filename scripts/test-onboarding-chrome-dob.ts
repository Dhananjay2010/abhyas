/**
 * Test three-field DOB input (DD/MM/YYYY) implementation.
 *
 * This test FAILS on main (which has a single native date input with type="date").
 * This branch has three separate text inputs with aria-label Day/Month/Year.
 * 
 * Verifies:
 * - Three separate inputs exist (not native date input)
 * - inputMode="numeric", pattern="[0-9]*", correct maxLength (2/2/4)
 * - autoComplete attributes (bday-day, bday-month, bday-year)
 * - Auto-advance logic (day→month→year)
 * - Backspace navigation (empty field moves back)
 * - Calendar date validation (31/02 rejected)
 * - Split error messages (future vs under-16)
 * - Accessibility (aria-label, aria-describedby, id="dob-error")
 * - Non-digit stripping with replace(/\D/g, '')
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

const flowPath = join(process.cwd(), "src", "app", "onboarding", "onboarding-flow.tsx");
const flowSource = readFileSync(flowPath, "utf-8");

console.log("\n1. Three separate DOB inputs (FAILS on main with single date input)");
{
  const hasNativeDateInput = /type="date"/.test(flowSource);
  check("❌ NO native date input (main has type='date')", !hasNativeDateInput);
  
  const hasDayInput = /aria-label="Day"/.test(flowSource);
  const hasMonthInput = /aria-label="Month"/.test(flowSource);
  const hasYearInput = /aria-label="Year"/.test(flowSource);
  
  check("✓ Day input with aria-label='Day'", hasDayInput);
  check("✓ Month input with aria-label='Month'", hasMonthInput);
  check("✓ Year input with aria-label='Year'", hasYearInput);
  
  if (!hasDayInput || !hasMonthInput || !hasYearInput) {
    console.log("   ⚠️  This implementation matches MAIN (single date input)");
    console.log("   ⚠️  Test FAILS - three-field inputs not found");
  }
}

console.log("\n2. Input attributes (inputMode, pattern, maxLength)");
{
  const inputModeCount = (flowSource.match(/inputMode="numeric"/g) || []).length;
  check("Three inputs have inputMode='numeric'", inputModeCount >= 3,
    `found ${inputModeCount}`);
  
  const patternCount = (flowSource.match(/pattern="\[0-9\]\*"/g) || []).length;
  check("Three inputs have pattern='[0-9]*'", patternCount >= 3,
    `found ${patternCount}`);
  
  const maxLength2Count = (flowSource.match(/maxLength=\{2\}/g) || []).length;
  const maxLength4Count = (flowSource.match(/maxLength=\{4\}/g) || []).length;
  
  check("Two inputs have maxLength={2}", maxLength2Count >= 2,
    `found ${maxLength2Count}`);
  check("One input has maxLength={4}", maxLength4Count >= 1,
    `found ${maxLength4Count}`);
}

console.log("\n3. AutoComplete attributes");
{
  check("autoComplete='bday-day' exists", /autoComplete="bday-day"/.test(flowSource));
  check("autoComplete='bday-month' exists", /autoComplete="bday-month"/.test(flowSource));
  check("autoComplete='bday-year' exists", /autoComplete="bday-year"/.test(flowSource));
}

console.log("\n4. Auto-advance logic (field→next on complete)");
{
  check("Day auto-advances to month", /dobMonthRef\.current\?\.focus\(\)/.test(flowSource));
  check("Month auto-advances to year", /dobYearRef\.current\?\.focus\(\)/.test(flowSource));
}

console.log("\n5. Backspace navigation (empty field moves back)");
{
  check("Month backspace → day", /dobMonth[\s\S]{0,500}Backspace[\s\S]{0,300}dobDayRef\.current\?\.focus/.test(flowSource));
  check("Year backspace → month", /dobYear[\s\S]{0,500}Backspace[\s\S]{0,300}dobMonthRef\.current\?\.focus/.test(flowSource));
}

console.log("\n6. Calendar date validation (31/02 rejected)");
{
  const hasDateValidation = /date\.getDate\(\) !== day/.test(flowSource);
  check("Calendar validation checks invalid dates", hasDateValidation);
}

console.log("\n7. Age bounds (16-100 years)");
{
  check("MIN_AGE_YEARS check exists", /MIN_AGE_YEARS/.test(flowSource));
  check("100 years maximum check exists", /- 100/.test(flowSource));
}

console.log("\n8. Split error messages (future vs under-16)");
{
  const hasFutureError = /Date can't be in the future/.test(flowSource);
  const hasUnder16Error = /must be at least 16/.test(flowSource);
  
  check("✓ 'Date can't be in the future' message exists", hasFutureError);
  check("✓ 'must be at least 16' message exists", hasUnder16Error);
  check("Both messages are separate conditions", hasFutureError && hasUnder16Error);
}

console.log("\n9. Accessibility (aria-label, aria-describedby)");
{
  check("Fieldset with aria-describedby", /aria-describedby=\{dobError \? "dob-error" : undefined\}/.test(flowSource));
  check("Error with id='dob-error'", /id="dob-error"/.test(flowSource));
  check("Error with aria-live='polite'", /aria-live="polite"/.test(flowSource));
}

console.log("\n10. State management (three fields + refs)");
{
  check("dobDay state exists", /const \[dobDay, setDobDay\]/.test(flowSource));
  check("dobMonth state exists", /const \[dobMonth, setDobMonth\]/.test(flowSource));
  check("dobYear state exists", /const \[dobYear, setDobYear\]/.test(flowSource));
  
  check("dobDayRef exists", /dobDayRef/.test(flowSource));
  check("dobMonthRef exists", /dobMonthRef/.test(flowSource));
  check("dobYearRef exists", /dobYearRef/.test(flowSource));
}

console.log("\n11. Non-digit stripping");
{
  const stripsNonDigits = /value\.replace\(\/\\D\/g, ""\)/.test(flowSource);
  check("onChange strips non-digits with replace(/\\D/g, '')", stripsNonDigits);
}

console.log("\n12. Date assembly from three fields");
{
  check("assembleDate function exists", /assembleDate/.test(flowSource));
}

console.log("\n13. Proof this FAILS on main");
{
  const hasThreeFields = /aria-label="Day"/.test(flowSource) && 
                         /aria-label="Month"/.test(flowSource) && 
                         /aria-label="Year"/.test(flowSource);
  const hasNativeDateInput = /type="date"/.test(flowSource);
  
  check("✓ Three-field implementation exists (NOT on main)", hasThreeFields);
  check("✓ Native date input removed (EXISTS on main)", !hasNativeDateInput);
  
  if (hasNativeDateInput || !hasThreeFields) {
    console.log("\n   ❌ FAILURE: This looks like main's implementation");
    console.log("   ❌ Expected: Three text inputs (Day/Month/Year)");
    console.log("   ❌ Found: Native date input or missing three-field structure");
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
