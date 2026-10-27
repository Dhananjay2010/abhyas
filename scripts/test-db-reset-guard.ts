/**
 * Unit tests for database reset guard.
 * 
 * Tests all refuse/allow cases without actually resetting any databases.
 */

import { checkDbResetAllowed } from "./lib/db-reset-guard";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runTests() {
  console.log("🧪 Testing database reset guard\n");

  // Save original env
  const originalCI = process.env.CI;
  const originalAllowReset = process.env.ALLOW_DB_RESET;

  try {
    // TEST: CI=true always allows
    console.log("TEST: CI=true always allows reset");
    delete process.env.ALLOW_DB_RESET;
    process.env.CI = "true";
    const ciResult = checkDbResetAllowed();
    check("CI=true allows reset", ciResult.allowed);
    check("CI=true reason mentions CI", ciResult.reason.includes("CI"));
    console.log();

    // TEST: No CI, no ALLOW_DB_RESET refuses
    console.log("TEST: No CI, no ALLOW_DB_RESET refuses");
    delete process.env.CI;
    delete process.env.ALLOW_DB_RESET;
    const noFlagsResult = checkDbResetAllowed();
    check("No flags refuses reset", !noFlagsResult.allowed);
    check("Reason mentions ALLOW_DB_RESET", noFlagsResult.reason.includes("ALLOW_DB_RESET"));
    console.log();

    // TEST: ALLOW_DB_RESET=1 alone (with default config) refuses
    console.log("TEST: ALLOW_DB_RESET=1 with default config refuses");
    delete process.env.CI;
    process.env.ALLOW_DB_RESET = "1";
    const allowOnlyResult = checkDbResetAllowed();
    check("ALLOW_DB_RESET=1 alone refuses", !allowOnlyResult.allowed);
    check("Reason mentions default config", allowOnlyResult.reason.includes("default"));
    console.log();

    // TEST: ALLOW_DB_RESET=0 refuses (not "1")
    console.log("TEST: ALLOW_DB_RESET=0 refuses");
    delete process.env.CI;
    process.env.ALLOW_DB_RESET = "0";
    const allowZeroResult = checkDbResetAllowed();
    check("ALLOW_DB_RESET=0 refuses", !allowZeroResult.allowed);
    console.log();

    // TEST: ALLOW_DB_RESET=yes refuses (not "1")
    console.log("TEST: ALLOW_DB_RESET=yes refuses");
    delete process.env.CI;
    process.env.ALLOW_DB_RESET = "yes";
    const allowYesResult = checkDbResetAllowed();
    check("ALLOW_DB_RESET=yes refuses", !allowYesResult.allowed);
    console.log();

    // Note: We cannot easily test the "allow with non-default config" cases
    // without actually changing the Supabase config or mocking the file system.
    // The guard's logic is exercised through the real mutant scripts in CI.
    console.log("✅ Guard logic tests passed");
    console.log("   (Non-default config cases are tested in real CI runs)");
    console.log();

  } finally {
    // Restore original env
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
    
    if (originalAllowReset !== undefined) {
      process.env.ALLOW_DB_RESET = originalAllowReset;
    } else {
      delete process.env.ALLOW_DB_RESET;
    }
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All guard tests passed\n");
}

runTests();
