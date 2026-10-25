/**
 * Test: Settings DOB validation
 * 
 * Validates that the profile-update-logic properly validates date_of_birth
 * when updating settings, rejecting invalid/future/under-16/over-100 dates.
 */

import { validateAndUpdateProfile, type Result } from "@/app/settings/profile-update-logic";
import type { Database } from "@/lib/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type Spy = { called: boolean; patch: ProfileUpdate | null };

function createSpies() {
  const updateSpy: Spy = { called: false, patch: null };
  return {
    updateProfile: async (patch: ProfileUpdate): Promise<Result> => {
      updateSpy.called = true;
      updateSpy.patch = patch;
      return { ok: true };
    },
    getTodayIso: () => "2026-10-24",
    updateSpy,
  };
}

async function main() {
  const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  // 1. Undefined date_of_birth: skip validation, call updateProfile
  tests.push({
    name: "undefined date_of_birth skips validation",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { preferred_session_minutes: 45 },
        { updateProfile, getTodayIso }
      );
      if (!result.ok) throw new Error(`Expected ok, got error: ${result.error}`);
      if (!updateSpy.called) throw new Error("updateProfile not called");
      if (updateSpy.patch?.date_of_birth !== undefined) {
        throw new Error("date_of_birth should not be in patch");
      }
    },
  });

  // 2. Null date_of_birth: allow (clearing the field)
  tests.push({
    name: "null date_of_birth is allowed",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: null },
        { updateProfile, getTodayIso }
      );
      if (!result.ok) throw new Error(`Expected ok, got error: ${result.error}`);
      if (!updateSpy.called) throw new Error("updateProfile not called");
      if (updateSpy.patch?.date_of_birth !== null) {
        throw new Error("date_of_birth should be null in patch");
      }
    },
  });

  // 3. Valid DOB (exactly 16 today): pass
  tests.push({
    name: "valid DOB (16 today) passes validation",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: "2010-10-24" }, // exactly 16 on 2026-10-24
        { updateProfile, getTodayIso }
      );
      if (!result.ok) throw new Error(`Expected ok, got error: ${result.error}`);
      if (!updateSpy.called) throw new Error("updateProfile not called");
    },
  });

  // 4. Under 16 (16 tomorrow): reject
  tests.push({
    name: "under 16 (16 tomorrow) is rejected",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: "2010-10-25" }, // 16 tomorrow on 2026-10-24
        { updateProfile, getTodayIso }
      );
      if (result.ok) throw new Error("Expected error for under-16, got ok");
      if (updateSpy.called) throw new Error("updateProfile should not be called");
      if (!result.error.toLowerCase().includes("16")) {
        throw new Error(`Expected error about 16, got: ${result.error}`);
      }
    },
  });

  // 5. Future date: reject
  tests.push({
    name: "future date is rejected",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: "2026-10-25" }, // tomorrow
        { updateProfile, getTodayIso }
      );
      if (result.ok) throw new Error("Expected error for future date, got ok");
      if (updateSpy.called) throw new Error("updateProfile should not be called");
      if (!result.error.toLowerCase().includes("future")) {
        throw new Error(`Expected error about future, got: ${result.error}`);
      }
    },
  });

  // 6. Over 100 years old: reject
  tests.push({
    name: "over 100 years old is rejected",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: "1926-10-23" }, // 100 years + 1 day
        { updateProfile, getTodayIso }
      );
      if (result.ok) throw new Error("Expected error for over 100, got ok");
      if (updateSpy.called) throw new Error("updateProfile should not be called");
      if (!result.error.toLowerCase().includes("check") && !result.error.toLowerCase().includes("date of birth")) {
        throw new Error(`Expected error about checking date, got: ${result.error}`);
      }
    },
  });

  // 7. Invalid date (31/02): reject
  tests.push({
    name: "invalid calendar date is rejected",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { date_of_birth: "1990-02-31" }, // invalid
        { updateProfile, getTodayIso }
      );
      if (result.ok) throw new Error("Expected error for invalid date, got ok");
      if (updateSpy.called) throw new Error("updateProfile should not be called");
      if (!result.error.toLowerCase().includes("valid")) {
        throw new Error(`Expected error about validity, got: ${result.error}`);
      }
    },
  });

  // 8. DOB with timezone change: both validated
  tests.push({
    name: "DOB and timezone both validated",
    fn: async () => {
      const { updateProfile, getTodayIso, updateSpy } = createSpies();
      const result = await validateAndUpdateProfile(
        { 
          date_of_birth: "1990-05-12",
          timezone: "America/New_York" 
        },
        { updateProfile, getTodayIso }
      );
      if (!result.ok) throw new Error(`Expected ok, got error: ${result.error}`);
      if (!updateSpy.called) throw new Error("updateProfile not called");
      if (updateSpy.patch?.date_of_birth !== "1990-05-12") {
        throw new Error("date_of_birth not in patch");
      }
      if (updateSpy.patch?.timezone !== "America/New_York") {
        throw new Error("timezone not in patch");
      }
    },
  });

  // Run all tests
  let passed = 0;
  let failed = 0;

  console.log("\n=== Settings DOB Validation Tests ===\n");

  for (const test of tests) {
    try {
      await test.fn();
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
