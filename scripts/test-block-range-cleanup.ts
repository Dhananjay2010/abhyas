#!/usr/bin/env tsx

/**
 * Test Item E: Verify that test-block-range-db-followup.ts cleanup works
 * even when the test body throws an error.
 * 
 * This test forces an error during test execution and verifies that
 * all test data is properly cleaned up.
 */

import { strict as assert } from "assert";
import { Pool } from "pg";
import { spawn } from "child_process";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  if (process.env.CI) {
    console.error("\n❌ DATABASE_URL not set in CI environment\n");
    process.exit(1);
  }
  console.log("\n⏭️  Skipping DB tests (DATABASE_URL not set)");
  console.log("   Set DATABASE_URL=***localhost/abhyas_test to run\n");
  process.exit(0);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Test Item E: Cleanup Verification on Error");
  console.log("═══════════════════════════════════════════════════════\n");

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Step 1: Run the followup test with FORCE_TEST_ERROR to make it throw
    console.log("Step 1: Running test-block-range-db-followup with forced error...\n");

    const testProcess = spawn("tsx", ["scripts/test-block-range-db-followup.ts"], {
      env: { ...process.env, FORCE_TEST_ERROR: "1" },
      stdio: "inherit",
    });

    await new Promise<void>((resolve, reject) => {
      testProcess.on("close", (code) => {
        if (code === 0) {
          // Should not succeed when forcing error
          reject(new Error("Test did not fail as expected when FORCE_TEST_ERROR=1"));
        } else {
          console.log(`\nTest failed as expected (exit code ${code})\n`);
          resolve();
        }
      });
      testProcess.on("error", reject);
    });

    // Step 2: Query and assert 0 rows remain for test emails
    console.log("Step 2: Verifying all test data was cleaned up...\n");

    const testEmails = [
      "test-m1@local.test",
      "test-m2@local.test",
      "test-a@local.test",
      "test-b@local.test",
      "test-rows1@local.test",
    ];

    const { rows: remainingUsers } = await pool.query(
      `SELECT id, email FROM auth.users WHERE email = ANY($1)`,
      [testEmails]
    );

    console.log(`Remaining test users: ${remainingUsers.length}`);
    if (remainingUsers.length > 0) {
      remainingUsers.forEach((u) => console.log(`  - ${u.email} (${u.id})`));
    }

    assert.equal(remainingUsers.length, 0, "All test users should be cleaned up");

    // Check for any orphaned programs, profiles, settings
    const { rows: remainingPrograms } = await pool.query(
      `SELECT COUNT(*) as count FROM programs WHERE user_id IN (
        SELECT id FROM auth.users WHERE email = ANY($1)
      )`,
      [testEmails]
    );

    const { rows: remainingProfiles } = await pool.query(
      `SELECT COUNT(*) as count FROM profiles WHERE id IN (
        SELECT id FROM auth.users WHERE email = ANY($1)
      )`,
      [testEmails]
    );

    const { rows: remainingSettings } = await pool.query(
      `SELECT COUNT(*) as count FROM user_settings WHERE user_id IN (
        SELECT id FROM auth.users WHERE email = ANY($1)
      )`,
      [testEmails]
    );

    console.log(`\nOrphaned data check:`);
    console.log(`  Programs: ${remainingPrograms[0].count}`);
    console.log(`  Profiles: ${remainingProfiles[0].count}`);
    console.log(`  Settings: ${remainingSettings[0].count}`);

    assert.equal(remainingPrograms[0].count, "0", "No orphaned programs");
    assert.equal(remainingProfiles[0].count, "0", "No orphaned profiles");
    assert.equal(remainingSettings[0].count, "0", "No orphaned settings");

    console.log("\n✅ All test data properly cleaned up even after error!\n");
    console.log("═══════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
