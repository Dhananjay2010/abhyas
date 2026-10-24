/**
 * Pure tests for onboarding step validation functions.
 * No DB, no API, no side effects.
 */

import {
  validateAboutStep,
  validateGoalStep,
  validateLevelStep,
  validateTrackStep,
  validateDaysStep,
  validateMixStep,
  validateEquipmentStep,
  validateInjuriesStep,
} from "../src/lib/onboarding/step-validation";
import { INJURY_STATUS_COPY, INJURY_INTRO, INJURY_DISCLAIMER } from "../src/lib/onboarding/copy";
import type { Goal, Level, Track, BodyRegion, InjurySeverity } from "../src/lib/onboarding/options";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${(error as Error).message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// About Step Tests
test("validateAboutStep: valid state passes", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: "175",
    weightKg: "70",
  });
  assert(result.valid, "Expected valid to be true");
  assert(!result.reason, "Expected no reason");
});

test("validateAboutStep: missing dateOfBirth fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "",
    sex: "male",
    heightCm: "175",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason === "Please enter your date of birth", `Got reason: ${result.reason}`);
});

test("validateAboutStep: invalid date format fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "01/01/1990",
    sex: "male",
    heightCm: "175",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("format") ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: future date fails", () => {
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 1);
  const result = validateAboutStep({
    dateOfBirth: futureDate.toISOString().slice(0, 10),
    sex: "male",
    heightCm: "175",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert((result.reason?.includes("1900") && result.reason?.includes("today")) ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: missing sex fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: null,
    heightCm: "175",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("sex") ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: height below min fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: "99",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("100") ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: height above max fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: "251",
    weightKg: "70",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("250") ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: weight below min fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: "175",
    weightKg: "24",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("25") ?? false, `Got reason: ${result.reason}`);
});

test("validateAboutStep: weight above max fails", () => {
  const result = validateAboutStep({
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: "175",
    weightKg: "301",
  });
  assert(!result.valid, "Expected valid to be false");
  assert(result.reason?.includes("300") ?? false, `Got reason: ${result.reason}`);
});

// Goal Step Tests
test("validateGoalStep: valid goal passes", () => {
  const result = validateGoalStep({ goal: "strength" as Goal });
  assert(result.valid, "Expected valid to be true");
});

test("validateGoalStep: null goal fails", () => {
  const result = validateGoalStep({ goal: null });
  assert(!result.valid, "Expected valid to be false");
  const hasGoal = result.reason ? result.reason.includes("goal") : false;
  assert(hasGoal, `Got reason: ${result.reason}`);
});

// Level Step Tests
test("validateLevelStep: valid level passes", () => {
  const result = validateLevelStep({ level: "beginner" as Level });
  assert(result.valid, "Expected valid to be true");
});

test("validateLevelStep: null level fails", () => {
  const result = validateLevelStep({ level: null });
  assert(!result.valid, "Expected valid to be false");
  const hasLevel = result.reason ? result.reason.includes("level") : false;
  assert(hasLevel, `Got reason: ${result.reason}`);
});

// Track Step Tests
test("validateTrackStep: gym location passes", () => {
  const result = validateTrackStep({ location: "gym", homeTrack: null });
  assert(result.valid, "Expected valid to be true");
});

test("validateTrackStep: home with track passes", () => {
  const result = validateTrackStep({ location: "home", homeTrack: "calisthenics" as Track });
  assert(result.valid, "Expected valid to be true");
});

test("validateTrackStep: home without track fails", () => {
  const result = validateTrackStep({ location: "home", homeTrack: null });
  assert(!result.valid, "Expected valid to be false");
  const hasHome = result.reason ? result.reason.includes("home") : false;
  assert(hasHome, `Got reason: ${result.reason}`);
});

test("validateTrackStep: null location fails", () => {
  const result = validateTrackStep({ location: null, homeTrack: null });
  assert(!result.valid, "Expected valid to be false");
  const hasTrain = result.reason ? result.reason.includes("train") : false;
  assert(hasTrain, `Got reason: ${result.reason}`);
});

// Days Step Tests
test("validateDaysStep: valid days passes", () => {
  const result = validateDaysStep({ daysPerWeek: 4 });
  assert(result.valid, "Expected valid to be true");
});

test("validateDaysStep: null days fails", () => {
  const result = validateDaysStep({ daysPerWeek: null });
  assert(!result.valid, "Expected valid to be false");
  const hasDays = result.reason ? result.reason.includes("days") : false;
  assert(hasDays, `Got reason: ${result.reason}`);
});

// Mix Step Tests
test("validateMixStep: always valid (yoga optional)", () => {
  const result = validateMixStep({ yogaDaysPerWeek: 0 });
  assert(result.valid, "Expected valid to be true");
});

// Equipment Step Tests
test("validateEquipmentStep: has all equipment passes", () => {
  const result = validateEquipmentStep({
    hasAllEquipment: true,
    selectedEquipment: new Set(),
  });
  assert(result.valid, "Expected valid to be true");
});

test("validateEquipmentStep: selected equipment passes", () => {
  const result = validateEquipmentStep({
    hasAllEquipment: false,
    selectedEquipment: new Set(["barbell", "bench"]),
  });
  assert(result.valid, "Expected valid to be true");
});

test("validateEquipmentStep: no equipment selected fails", () => {
  const result = validateEquipmentStep({
    hasAllEquipment: false,
    selectedEquipment: new Set(),
  });
  assert(!result.valid, "Expected valid to be false");
  const hasEquipment = result.reason ? result.reason.includes("equipment") : false;
  assert(hasEquipment, `Got reason: ${result.reason}`);
});

// Injuries Step Tests
test("validateInjuriesStep: no injuries passes", () => {
  const result = validateInjuriesStep({ injuries: new Map() });
  assert(result.valid, "Expected valid to be true");
});

test("validateInjuriesStep: injuries with severity passes", () => {
  const injuries = new Map<BodyRegion, InjurySeverity | null>([
    ["knee" as BodyRegion, "current"],
    ["shoulder" as BodyRegion, "past"],
  ]);
  const result = validateInjuriesStep({ injuries });
  assert(result.valid, "Expected valid to be true");
});

test("validateInjuriesStep: injury without severity fails", () => {
  const injuries = new Map<BodyRegion, InjurySeverity | null>([
    ["knee" as BodyRegion, null],
  ]);
  const result = validateInjuriesStep({ injuries });
  assert(!result.valid, "Expected valid to be false");
  const hasCurrentOrPast = result.reason ? result.reason.includes("Current or Past") : false;
  assert(hasCurrentOrPast, `Got reason: ${result.reason}`);
});

// Injury Copy Tests
test("INJURY_STATUS_COPY.current matches spec", () => {
  const expected = "It hurts or limits you right now. We'll leave out exercises that load it.";
  assert(
    INJURY_STATUS_COPY.current === expected,
    `Expected "${expected}", got "${INJURY_STATUS_COPY.current}"`
  );
});

test("INJURY_STATUS_COPY.past matches spec", () => {
  const expected = "It's healed. We'll keep it in mind, but we won't avoid it.";
  assert(
    INJURY_STATUS_COPY.past === expected,
    `Expected "${expected}", got "${INJURY_STATUS_COPY.past}"`
  );
});

test("INJURY_INTRO matches spec", () => {
  const expected = "Tell us about any injuries so we can adjust your plan.";
  assert(INJURY_INTRO === expected, `Expected "${expected}", got "${INJURY_INTRO}"`);
});

test("INJURY_DISCLAIMER contains branding name and key phrases", () => {
  assert(INJURY_DISCLAIMER.includes("isn't medical advice"), "Must include 'isn't medical advice'");
  assert(
    INJURY_DISCLAIMER.includes("in pain, recently injured or had surgery"),
    "Must include injury conditions"
  );
  assert(INJURY_DISCLAIMER.includes("doctor or physiotherapist"), "Must mention professionals");
});

test("INJURY_DISCLAIMER has no rehab or safe wording", () => {
  assert(!INJURY_DISCLAIMER.toLowerCase().includes("rehab"), "Must not include 'rehab'");
  assert(
    !INJURY_DISCLAIMER.toLowerCase().includes("safe for your injury"),
    "Must not include 'safe for your injury'"
  );
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
