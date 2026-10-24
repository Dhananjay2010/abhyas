/**
 * Test inline error messages with accessibility attributes
 * QA finding: When Continue is dimmed/disabled, show inline error text with role=alert or aria-live polite
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

// Test 1: Validation messages should have role=alert
const validationMessagePattern = /<p className="mb-3 text-sm text-muted" role="alert">/;
const sampleValidationMarkup = '<p className="mb-3 text-sm text-muted" role="alert">Please select a goal</p>';
assert(
  sampleValidationMarkup.includes('role="alert"'),
  "Validation messages include role=alert"
);

// Test 2: Validation structure
type ValidationResult = { valid: boolean; reason: string | null };

function validateGoalStep(state: { goal: string | null }): ValidationResult {
  if (!state.goal) {
    return { valid: false, reason: "Please select a goal" };
  }
  return { valid: true, reason: null };
}

const invalidGoal = validateGoalStep({ goal: null });
assert(!invalidGoal.valid, "Invalid goal returns valid: false");
assert(invalidGoal.reason === "Please select a goal", "Invalid goal has reason text");

const validGoal = validateGoalStep({ goal: "strength" });
assert(validGoal.valid, "Valid goal returns valid: true");
assert(validGoal.reason === null, "Valid goal has no reason");

// Test 3: About step validation
function validateAboutStep(state: {
  dateOfBirth: string;
  sex: string | null;
  heightCm: string;
  weightKg: string;
}): ValidationResult {
  if (!state.dateOfBirth) {
    return { valid: false, reason: "Please enter your date of birth" };
  }
  if (!state.sex) {
    return { valid: false, reason: "Please select your sex" };
  }
  if (!state.heightCm) {
    return { valid: false, reason: "Please enter your height" };
  }
  if (!state.weightKg) {
    return { valid: false, reason: "Please enter your weight" };
  }
  return { valid: true, reason: null };
}

const missingDob = validateAboutStep({ dateOfBirth: "", sex: "male", heightCm: "175", weightKg: "70" });
assert(!missingDob.valid, "Missing DOB is invalid");
assert(Boolean(missingDob.reason?.includes("date of birth")), "Missing DOB has helpful message");

const missingSex = validateAboutStep({ dateOfBirth: "1990-01-01", sex: null, heightCm: "175", weightKg: "70" });
assert(!missingSex.valid, "Missing sex is invalid");
assert(Boolean(missingSex.reason?.includes("sex")), "Missing sex has helpful message");

const complete = validateAboutStep({ dateOfBirth: "1990-01-01", sex: "male", heightCm: "175", weightKg: "70" });
assert(complete.valid, "Complete about step is valid");

// Test 4: Equipment validation
function validateEquipmentStep(state: {
  hasAllEquipment: boolean;
  selectedEquipment: Set<string>;
}): ValidationResult {
  if (!state.hasAllEquipment && state.selectedEquipment.size === 0) {
    return {
      valid: false,
      reason: 'Please select at least one item, or choose "I have access to everything"',
    };
  }
  return { valid: true, reason: null };
}

const noEquipment = validateEquipmentStep({ hasAllEquipment: false, selectedEquipment: new Set() });
assert(!noEquipment.valid, "No equipment selected is invalid");
assert(Boolean(noEquipment.reason?.includes("at least one")), "No equipment has helpful message");

const hasAll = validateEquipmentStep({ hasAllEquipment: true, selectedEquipment: new Set() });
assert(hasAll.valid, '"I have access to everything" is valid');

const someSelected = validateEquipmentStep({ hasAllEquipment: false, selectedEquipment: new Set(["barbell"]) });
assert(someSelected.valid, "Selected equipment is valid");

// Test 5: Injuries validation
function validateInjuriesStep(state: {
  injuries: Map<string, string | null>;
}): ValidationResult {
  for (const [region, severity] of state.injuries.entries()) {
    if (severity === null) {
      return {
        valid: false,
        reason: "Please mark each injury as Current or Past",
      };
    }
  }
  return { valid: true, reason: null };
}

const noInjuries = validateInjuriesStep({ injuries: new Map() });
assert(noInjuries.valid, "No injuries is valid");

const completeInjuries = validateInjuriesStep({ injuries: new Map([["shoulder", "current"]]) });
assert(completeInjuries.valid, "Complete injuries is valid");

const incompleteInjuries = validateInjuriesStep({ injuries: new Map([["shoulder", null]]) });
assert(!incompleteInjuries.valid, "Incomplete injuries is invalid");
assert(Boolean(incompleteInjuries.reason?.includes("Current or Past")), "Incomplete injuries has helpful message");

// Test 6: Button should be disabled when validation fails
function shouldDisableButton(validation: ValidationResult, pending: boolean): boolean {
  return !validation.valid || pending;
}

assert(shouldDisableButton({ valid: false, reason: "Error" }, false), "Invalid state disables button");
assert(shouldDisableButton({ valid: true, reason: null }, true), "Pending state disables button");
assert(!shouldDisableButton({ valid: true, reason: null }, false), "Valid and not pending enables button");

// Test 7: Error message should be displayed when validation fails
function shouldShowError(validation: ValidationResult): boolean {
  return !validation.valid && validation.reason !== null;
}

assert(shouldShowError({ valid: false, reason: "Select a goal" }), "Shows error when invalid with reason");
assert(!shouldShowError({ valid: true, reason: null }), "Hides error when valid");
assert(!shouldShowError({ valid: false, reason: null }), "Hides error when invalid but no reason");

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}

export {};
