/**
 * Test M2: Session-length step 'done' logic for onboarding.
 *
 * The session-length step should only count as 'done' once the user explicitly saves it.
 * A DB default value (e.g. 60) without explicit save means NOT done.
 * An explicit save means done.
 *
 * This test validates the logic that determines whether to skip or land on the
 * session-length step during onboarding, based on the presence of a saved value.
 *
 *   npm run test:session-length-step-done
 */

import { initialStepIndex, type InitialState } from "../src/app/onboarding/onboarding-flow";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. DB default value without explicit save means NOT done");
{
  // Before the migration: DB has default 60, but user never saved explicitly
  // After the migration: DB has NULL (no default)
  const profileWithNull: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    sessionMinutes: null, // No explicit save yet
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
  };
  
  const stepIndex = initialStepIndex(profileWithNull);
  check("NULL session_minutes lands on session-length step (index 6)", stepIndex === 6,
    `got index ${stepIndex}`);
}

console.log("\n2. Explicit save means done");
{
  const profileWithSaved: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    sessionMinutes: 45, // User explicitly saved 45
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
  };
  
  const stepIndex = initialStepIndex(profileWithSaved);
  check("Saved 45 skips session-length step (index 7)", stepIndex === 7,
    `got index ${stepIndex}`);
}

console.log("\n3. Any explicitly saved value means done");
{
  const values = [30, 45, 60, 75];
  for (const minutes of values) {
    const profile: InitialState = {
      displayName: "Test User",
      dateOfBirth: "1990-01-01",
      sex: "male",
      heightCm: 175,
      weightKg: 70,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      sessionMinutes: minutes,
      yogaDaysPerWeek: 0,
      disclaimerAccepted: true,
      hasAllEquipment: false,
      equipmentIds: [],
      injuries: [],
    };
    
    const stepIndex = initialStepIndex(profile);
    check(`Saved ${minutes} skips session-length step`, stepIndex === 7,
      `got index ${stepIndex}`);
  }
}

console.log("\n4. Reload without save must land on session-length step");
{
  // User opens /onboarding, sees session-length step, closes browser
  // Reopens /onboarding later - should still be on session-length step
  const profileAfterReload: InitialState = {
    displayName: "Test User",
    dateOfBirth: "1990-01-01",
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    sessionMinutes: null, // Still null after reload
    yogaDaysPerWeek: 0,
    disclaimerAccepted: true,
    hasAllEquipment: false,
    equipmentIds: [],
    injuries: [],
  };
  
  const stepIndex = initialStepIndex(profileAfterReload);
  check("Reload without save lands on session-length step (index 6)", stepIndex === 6,
    `got index ${stepIndex}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
