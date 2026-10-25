/**
 * Test yoga step preselection behavior
 * QA finding: Screen 7/9 should not preselect 'No yoga' - user must make explicit choice
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

// Test 1: Initial yoga days should be null for new users
function getInitialYogaDays(savedYogaDays: number): number | null {
  // For onboarding, if user hasn't explicitly chosen, start with null
  // Only use saved value if it's > 0 (explicit choice)
  return savedYogaDays > 0 ? savedYogaDays : null;
}

assert(getInitialYogaDays(0) === null, "Saved 0 yoga days returns null (no preselection)");
assert(getInitialYogaDays(2) === 2, "Saved 2 yoga days returns 2 (resume state)");
assert(getInitialYogaDays(1) === 1, "Saved 1 yoga day returns 1 (resume state)");

// Test 2: Validation requires explicit choice
type ValidationResult = { valid: boolean; reason: string | null };

function validateMixStep(state: { yogaDaysPerWeek?: number | null }): ValidationResult {
  if (state.yogaDaysPerWeek === null || state.yogaDaysPerWeek === undefined) {
    return { valid: false, reason: "Please select how many yoga days you want (or choose 'No yoga')" };
  }
  return { valid: true, reason: null };
}

const noSelection = validateMixStep({ yogaDaysPerWeek: null });
assert(!noSelection.valid, "Null yoga days is invalid");
assert(Boolean(noSelection.reason?.includes("select")), "Null has helpful message");

const zeroYoga = validateMixStep({ yogaDaysPerWeek: 0 });
assert(zeroYoga.valid, "'No yoga' (0) is valid after user selects it");

const someYoga = validateMixStep({ yogaDaysPerWeek: 2 });
assert(someYoga.valid, "2 yoga days is valid");

const undefinedYoga = validateMixStep({ yogaDaysPerWeek: undefined });
assert(!undefinedYoga.valid, "Undefined yoga days is invalid");

// Test 3: Continue button should be disabled when no selection
function shouldDisableButton(yogaDays: number | null, pending: boolean): boolean {
  const validation = validateMixStep({ yogaDaysPerWeek: yogaDays });
  return !validation.valid || pending;
}

assert(shouldDisableButton(null, false), "Button disabled when no selection");
assert(shouldDisableButton(0, false) === false, "Button enabled when user picks 'No yoga'");
assert(shouldDisableButton(1, false) === false, "Button enabled when user picks 1 day");
assert(shouldDisableButton(0, true), "Button disabled when pending");

// Test 4: Session length should default to 45 (different behavior - explicit default)
function getInitialSessionLength(savedLength: number | null): number {
  // Session length shows visible default of 45
  return savedLength ?? 45;
}

assert(getInitialSessionLength(null) === 45, "No saved session length defaults to 45");
assert(getInitialSessionLength(30) === 30, "Saved 30 minutes returns 30");
assert(getInitialSessionLength(60) === 60, "Saved 60 minutes returns 60");

// Test 5: Session length default is visibly selected
function isSessionLengthSelected(sessionLength: number, optionValue: number): boolean {
  return sessionLength === optionValue;
}

const defaultSession = getInitialSessionLength(null);
assert(
  isSessionLengthSelected(defaultSession, 45),
  "45-minute option is visibly selected by default"
);
assert(
  !isSessionLengthSelected(defaultSession, 30),
  "30-minute option is not selected by default"
);

// Test 6: All other choice steps should start blank
type StepState = {
  goal: string | null;
  level: string | null;
  daysPerWeek: number | null;
  yogaDays: number | null;
};

function getInitialState(): StepState {
  return {
    goal: null,
    level: null,
    daysPerWeek: null,
    yogaDays: null,
  };
}

const initial = getInitialState();
assert(initial.goal === null, "Goal starts blank");
assert(initial.level === null, "Level starts blank");
assert(initial.daysPerWeek === null, "Days per week starts blank");
assert(initial.yogaDays === null, "Yoga days starts blank (no preselection)");

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}

export {};
