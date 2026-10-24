/**
 * Test: Settings DOB UI integration
 * 
 * Validates that the Settings page includes date_of_birth in the SettingsState
 * and that the form displays a DOB field that saves on blur.
 */

import fs from "fs";
import path from "path";

function readFile(filePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf-8");
}

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const tests: Array<{ name: string; fn: () => void }> = [];

  // 1. SettingsState type includes dateOfBirth
  tests.push({
    name: "SettingsState type includes dateOfBirth",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /export type SettingsState = \{[\s\S]*?dateOfBirth: string \| null;/m.test(form),
        "SettingsState must include 'dateOfBirth: string | null'"
      );
    },
  });

  // 2. Settings page fetches date_of_birth from profile
  tests.push({
    name: "Settings page fetches date_of_birth",
    fn: () => {
      const page = readFile("src/app/settings/page.tsx");
      check(
        /dateOfBirth:\s*profile\.date_of_birth/.test(page),
        "Settings page must set dateOfBirth from profile.date_of_birth"
      );
    },
  });

  // 3. Settings form imports DobInput component
  tests.push({
    name: "Settings form imports DobInput",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /import.*\{.*DobInput.*\}.*from.*@\/components\/onboarding\/dob-input/.test(form),
        "Settings form must import DobInput from @/components/onboarding/dob-input"
      );
    },
  });

  // 4. Settings form imports DOB validation helpers
  tests.push({
    name: "Settings form imports validateDob and getDobErrorMessage",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /import.*\{.*validateDob.*getDobErrorMessage.*\}.*from.*@\/lib\/onboarding\/dob/.test(form),
        "Settings form must import validateDob and getDobErrorMessage"
      );
    },
  });

  // 5. Settings form renders DobInput component
  tests.push({
    name: "Settings form renders DobInput",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /<DobInput/.test(form),
        "Settings form must render <DobInput />"
      );
    },
  });

  // 6. DobInput receives dateOfBirth value from state
  tests.push({
    name: "DobInput receives value from state",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /<DobInput[\s\S]*?value=\{s\.dateOfBirth\}/.test(form),
        "DobInput must receive value={s.dateOfBirth}"
      );
    },
  });

  // 7. DobInput onChange updates state
  tests.push({
    name: "DobInput onChange updates state",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      check(
        /<DobInput[\s\S]*?onChange=\{[\s\S]*?setS\([\s\S]*?dateOfBirth: iso/.test(form),
        "DobInput onChange must update state with dateOfBirth: iso"
      );
    },
  });

  // 8. DobInput onBlur validates and saves
  tests.push({
    name: "DobInput onBlur validates and saves",
    fn: () => {
      const form = readFile("src/app/settings/settings-form.tsx");
      const hasOnBlur = /<DobInput[\s\S]*?onBlur=\{[\s\S]*?validateDob/.test(form);
      const callsUpdate = /<DobInput[\s\S]*?onBlur=\{[\s\S]*?updateProfileSettings[\s\S]*?date_of_birth/.test(form);
      check(
        hasOnBlur && callsUpdate,
        "DobInput onBlur must validate with validateDob and call updateProfileSettings({ date_of_birth: ... })"
      );
    },
  });

  // 9. profile-update-logic validates DOB
  tests.push({
    name: "profile-update-logic validates date_of_birth",
    fn: () => {
      const logic = readFile("src/app/settings/profile-update-logic.ts");
      check(
        /if \(patch\.date_of_birth !== undefined\)/.test(logic),
        "profile-update-logic must check if patch.date_of_birth !== undefined"
      );
      check(
        /validateDob\(/.test(logic),
        "profile-update-logic must call validateDob"
      );
      check(
        /getDobErrorMessage\(/.test(logic),
        "profile-update-logic must call getDobErrorMessage"
      );
    },
  });

  // 10. ProfileUpdateDeps includes getTodayIso
  tests.push({
    name: "ProfileUpdateDeps includes getTodayIso",
    fn: () => {
      const logic = readFile("src/app/settings/profile-update-logic.ts");
      check(
        /export interface ProfileUpdateDeps \{[\s\S]*?getTodayIso: \(\) => string/.test(logic),
        "ProfileUpdateDeps must include getTodayIso: () => string"
      );
    },
  });

  // 11. actions.ts provides getTodayIso to validateAndUpdateProfile
  tests.push({
    name: "actions.ts provides getTodayIso",
    fn: () => {
      const actions = readFile("src/app/settings/actions.ts");
      check(
        /validateAndUpdateProfile\([\s\S]*?getTodayIso:/.test(actions),
        "actions.ts must provide getTodayIso to validateAndUpdateProfile"
      );
    },
  });

  // Run all tests
  let passed = 0;
  let failed = 0;

  console.log("\n=== Settings DOB UI Integration Tests ===\n");

  for (const test of tests) {
    try {
      test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${test.name}`);
      console.log(`   ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n${passed === tests.length ? "✅" : "❌"} ${passed} passed, ${failed === 0 ? "✅" : "❌"} ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
