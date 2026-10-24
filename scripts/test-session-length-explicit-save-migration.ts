/**
 * Test migration 20261025000021_session_length_explicit_save.sql with real Postgres (PGlite).
 *
 * Validates:
 * - Drops NOT NULL constraint on preferred_session_minutes
 * - Drops DEFAULT on preferred_session_minutes
 * - Existing non-null values are preserved
 * - NULL values are allowed after migration
 * - New rows can be inserted with NULL
 * - Check constraint from migration 000019 still applies (30, 45, 60, 75)
 * - Idempotency (running twice is safe)
 *
 *   npm run test:session-length-explicit-save-migration
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTest() {
  console.log("\nInitializing PGlite database...");
  const db = new PGlite();
  
  // Create profiles table with original schema (NOT NULL DEFAULT 60)
  await db.exec(`
    CREATE TABLE profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      preferred_session_minutes INTEGER NOT NULL DEFAULT 60,
      CHECK (preferred_session_minutes IS NULL OR preferred_session_minutes IN (30, 45, 60, 75))
    );
  `);
  
  console.log("\n1. Insert test data before migration");
  {
    await db.exec(`
      INSERT INTO profiles (id, preferred_session_minutes) VALUES
        ('00000000-0000-0000-0000-000000000001', 30),
        ('00000000-0000-0000-0000-000000000002', 45),
        ('00000000-0000-0000-0000-000000000003', 60),
        ('00000000-0000-0000-0000-000000000004', 75);
      
      -- Insert without specifying preferred_session_minutes (should get default 60)
      INSERT INTO profiles (id) VALUES
        ('00000000-0000-0000-0000-000000000005');
    `);
    
    const result = await db.query("SELECT COUNT(*) FROM profiles");
    const count = parseInt((result.rows[0] as { count: string }).count);
    check("5 profiles inserted", count === 5, `got ${count}`);
    
    // Verify the default was applied
    const defaultRow = await db.query(`
      SELECT preferred_session_minutes 
      FROM profiles 
      WHERE id = '00000000-0000-0000-0000-000000000005'
    `);
    const defaultValue = (defaultRow.rows[0] as { preferred_session_minutes: number }).preferred_session_minutes;
    check("Row without value got default 60", defaultValue === 60, `got ${defaultValue}`);
  }
  
  console.log("\n2. Apply migration 20261025000021_session_length_explicit_save.sql");
  {
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261025000021_session_length_explicit_save.sql"
    );
    const migration = readFileSync(migrationPath, "utf-8");
    
    await db.exec(migration);
    check("Migration applied successfully", true);
  }
  
  console.log("\n3. Verify existing values are preserved");
  {
    const result = await db.query(`
      SELECT id, preferred_session_minutes 
      FROM profiles 
      ORDER BY id
    `);
    
    const values = Object.fromEntries(
      result.rows.map((r) => [
        (r as { id: string }).id,
        (r as { preferred_session_minutes: number | null }).preferred_session_minutes
      ])
    );
    
    check("30 preserved", values["00000000-0000-0000-0000-000000000001"] === 30);
    check("45 preserved", values["00000000-0000-0000-0000-000000000002"] === 45);
    check("60 preserved", values["00000000-0000-0000-0000-000000000003"] === 60);
    check("75 preserved", values["00000000-0000-0000-0000-000000000004"] === 75);
    check("Default 60 preserved", values["00000000-0000-0000-0000-000000000005"] === 60);
  }
  
  console.log("\n4. Verify NULL is now allowed");
  {
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000006', NULL)
      `);
      check("NULL insertion allowed", true);
      
      const result = await db.query(`
        SELECT preferred_session_minutes 
        FROM profiles 
        WHERE id = '00000000-0000-0000-0000-000000000006'
      `);
      const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
      check("NULL value stored correctly", value === null);
    } catch (error) {
      check("NULL insertion allowed", false, (error as Error).message);
    }
  }
  
  console.log("\n5. Verify new rows without value get NULL (not default)");
  {
    try {
      await db.exec(`
        INSERT INTO profiles (id) 
        VALUES ('00000000-0000-0000-0000-000000000007')
      `);
      check("Row without value inserted", true);
      
      const result = await db.query(`
        SELECT preferred_session_minutes 
        FROM profiles 
        WHERE id = '00000000-0000-0000-0000-000000000007'
      `);
      const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
      check("Row without value has NULL (not 60)", value === null);
    } catch (error) {
      check("Row without value inserted", false, (error as Error).message);
    }
  }
  
  console.log("\n6. Verify check constraint still applies");
  {
    // Try to insert invalid value (50)
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000099', 50)
      `);
      check("50 is rejected by check constraint", false);
    } catch (error: unknown) {
      const isCheckViolation = (error as Error).message.includes("check constraint") ||
                               (error as Error).message.includes("violates");
      check("50 is rejected by check constraint", isCheckViolation);
    }
    
    // Valid values should still work
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000098', 45)
      `);
      check("45 is allowed", true);
    } catch (error) {
      check("45 is allowed", false, (error as Error).message);
    }
  }
  
  console.log("\n7. Test idempotency (run migration again)");
  {
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261025000021_session_length_explicit_save.sql"
    );
    const migration = readFileSync(migrationPath, "utf-8");
    
    try {
      await db.exec(migration);
      check("Migration runs again without error", true);
      
      // Verify a NULL value is still NULL
      const result = await db.query(`
        SELECT preferred_session_minutes 
        FROM profiles 
        WHERE id = '00000000-0000-0000-0000-000000000006'
      `);
      const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
      check("NULL still NULL after second run", value === null);
    } catch (error) {
      check("Migration runs again without error", false, (error as Error).message);
    }
  }
  
  await db.close();
}

runTest()
  .then(() => {
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error("\nTest failed with error:", error);
    process.exit(1);
  });

export {};
