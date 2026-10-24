/**
 * Behavioral test: Settings requireDob option rejects null DOB
 * 
 * After onboarding, DOB is required in Settings context.
 * The pure profile-update-logic validates this via requireDob: true.
 * 
 * This test validates the behavior by calling validateAndUpdateProfile directly.
 */

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${message}`);
    failed++;
  }
}

(async function runTest() {
  console.log("\n🧪 Settings requireDob null rejection test\n");

  const { validateAndUpdateProfile } = await import("@/app/settings/profile-update-logic");

  // Test 1: With requireDob: true (Settings context), null is rejected
  console.log("1️⃣  Settings context (requireDob: true) rejects null DOB\n");
  {
    let updateCalled = false;
    const result = await validateAndUpdateProfile(
      { date_of_birth: null },
      {
        updateProfile: async () => {
          updateCalled = true;
          return { ok: true };
        },
        getTodayIso: () => "2024-10-24",
        requireDob: true,
      }
    );

    check(!result.ok, "Null DOB rejected (ok: false)");
    check(result.ok === false && result.error === "Enter your full date of birth", 
      `Error message matches (got: ${result.ok === false ? result.error : "N/A"})`);
    check(!updateCalled, "updateProfile spy NOT called");
  }

  // Test 2: With requireDob: false (onboarding context), null is allowed
  console.log("\n2️⃣  Onboarding context (requireDob: false) allows null DOB\n");
  {
    let updateCalled = false;
    let capturedPatch: unknown = null;
    const result = await validateAndUpdateProfile(
      { date_of_birth: null },
      {
        updateProfile: async (patch) => {
          updateCalled = true;
          capturedPatch = patch;
          return { ok: true };
        },
        getTodayIso: () => "2024-10-24",
        requireDob: false,
      }
    );

    check(result.ok, "Null DOB allowed (ok: true)");
    check(updateCalled, "updateProfile spy called");
    check(
      capturedPatch !== null && typeof capturedPatch === "object" && "date_of_birth" in capturedPatch,
      `Patch passed to updateProfile (got: ${JSON.stringify(capturedPatch)})`
    );
  }

  // Test 3: With requireDob: undefined (default, onboarding context), null is allowed
  console.log("\n3️⃣  Default context (requireDob: undefined) allows null DOB\n");
  {
    let updateCalled = false;
    const result = await validateAndUpdateProfile(
      { date_of_birth: null },
      {
        updateProfile: async () => {
          updateCalled = true;
          return { ok: true };
        },
        getTodayIso: () => "2024-10-24",
        // requireDob not specified (undefined)
      }
    );

    check(result.ok, "Null DOB allowed (ok: true)");
    check(updateCalled, "updateProfile spy called");
  }

  // Test 4: Valid DOB passes in all contexts
  console.log("\n4️⃣  Valid DOB '1990-05-15' passes with requireDob: true\n");
  {
    let updateCalled = false;
    const result = await validateAndUpdateProfile(
      { date_of_birth: "1990-05-15" },
      {
        updateProfile: async () => {
          updateCalled = true;
          return { ok: true };
        },
        getTodayIso: () => "2024-10-24",
        requireDob: true,
      }
    );

    check(result.ok, "Valid DOB accepted (ok: true)");
    check(updateCalled, "updateProfile spy called");
  }

  console.log(`\n✅ ${passed} passed, ❌ ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

export {};
