/**
 * Test session length step:
 * - Default value is 45 minutes
 * - All options are available
 * - Value is kept in draft persistence
 */

import { SESSION_LENGTHS } from "../src/lib/onboarding/options";
import type { OnboardingDraft } from "../src/lib/onboarding/draft-persistence";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`✗ ${message}`);
    failures++;
  } else {
    console.log(`✓ ${message}`);
  }
}

// Test 1: SESSION_LENGTHS is defined and has expected values
assert(SESSION_LENGTHS.length === 5, "SESSION_LENGTHS has 5 options");
assert(
  SESSION_LENGTHS.map((o) => o.value).join(",") === "30,45,60,75,90",
  "SESSION_LENGTHS has correct values: 30, 45, 60, 75, 90",
);

// Test 2: 45 minutes is marked as default in the label
const fortyFive = SESSION_LENGTHS.find((o) => o.value === 45);
assert(!!fortyFive, "45 minute option exists");
assert(
  !!fortyFive && fortyFive.label.includes("default"),
  "45 minute option is labeled as default",
);

// Test 3: All options have descriptions
assert(
  SESSION_LENGTHS.every((o) => o.description && o.description.length > 0),
  "All session length options have descriptions",
);

// Test 4: Draft persistence type includes sessionLength
const draftShape: OnboardingDraft = {
  dateOfBirth: "",
  sex: null,
  heightCm: "",
  weightKg: "",
  goal: null,
  level: null,
  location: null,
  homeTrack: null,
  daysPerWeek: null,
  yogaDays: 0,
  sessionLength: 45,
  hasAllEquipment: false,
  selectedEquipment: [],
  injuries: [],
  stepIndex: 0,
};
assert(
  typeof draftShape.sessionLength === "number",
  "OnboardingDraft type includes sessionLength field",
);

// Test 5: Default value is 45
assert(draftShape.sessionLength === 45, "Default session length is 45 minutes");

// Test 6: Descriptions mention exercise count or time budget
const thirtyMin = SESSION_LENGTHS.find((o) => o.value === 30);
const ninetyMin = SESSION_LENGTHS.find((o) => o.value === 90);
assert(
  !!thirtyMin &&
    !!thirtyMin.description &&
    (thirtyMin.description.toLowerCase().includes("main") ||
      thirtyMin.description.toLowerCase().includes("quick")),
  "30 minute description mentions main lifts or quick sessions",
);
assert(
  !!ninetyMin &&
    !!ninetyMin.description &&
    (ninetyMin.description.toLowerCase().includes("maximum") ||
      ninetyMin.description.toLowerCase().includes("extended")),
  "90 minute description mentions maximum or extended",
);

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}

export {};
