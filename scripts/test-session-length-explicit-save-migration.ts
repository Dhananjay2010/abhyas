/**
 * Test migration 20261025000021_session_length_explicit_save.sql with real Postgres (PGlite).
 *
 * M2 QA FIX PROOF: Before migration 000021, new profiles got DEFAULT 60.
 * After migration 000021, new profiles get NULL (no default).
 * This test proves the migration fixes the M2 bug.
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
  console.log("\n=== M2 BUG: WITHOUT migration 000021 ===");
  {
    const dbBefore = new PGlite();
    
    // Create profiles table with ORIGINAL schema (NOT NULL DEFAULT 60)
    await dbBefore.exec(`
      CREATE TABLE profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        preferred_session_minutes INTEGER NOT NULL DEFAULT 60,
        CHECK (preferred_session_minutes IS NULL OR preferred_session_minutes IN (30, 45, 60, 75))
      );
    `);
    
    console.log("\n1. Insert new profile WITHOUT specifying preferred_session_minutes");
    await dbBefore.exec(`
      INSERT INTO profiles (id) VALUES ('00000000-0000-0000-0000-000000000001')
    `);
    
    const result = await dbBefore.query(`
      SELECT preferred_session_minutes 
      FROM profiles 
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `);
    const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
    
    console.log(`   Got: ${value}`);
    check("BUG: New profile gets 60 (should be NULL)", value === 60, `got ${value}`);
    check("Expected NULL for M2 fix", value === null, `got ${value} (THIS SHOULD FAIL)`);
    
    await dbBefore.close();
  }
  
  console.log("\n=== M2 FIX: WITH migration 000021 ===");
  {
    const dbAfter = new PGlite();
    
    // Create profiles table with ORIGINAL schema first
    await dbAfter.exec(`
      CREATE TABLE profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        preferred_session_minutes INTEGER NOT NULL DEFAULT 60,
        CHECK (preferred_session_minutes IS NULL OR preferred_session_minutes IN (30, 45, 60, 75))
      );
    `);
    
    console.log("\n2. Apply migration 20261025000021_session_length_explicit_save.sql");
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261025000021_session_length_explicit_save.sql"
    );
    const migration = readFileSync(migrationPath, "utf-8");
    await dbAfter.exec(migration);
    check("Migration applied", true);
    
    console.log("\n3. Insert new profile WITHOUT specifying preferred_session_minutes");
    await dbAfter.exec(`
      INSERT INTO profiles (id) VALUES ('00000000-0000-0000-0000-000000000002')
    `);
    
    const result = await dbAfter.query(`
      SELECT preferred_session_minutes 
      FROM profiles 
      WHERE id = '00000000-0000-0000-0000-000000000002'
    `);
    const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
    
    console.log(`   Got: ${value}`);
    check("FIX: New profile gets NULL (not 60)", value === null, `got ${value}`);
    
    await dbAfter.close();
  }
  
  console.log("\n=== Additional migration tests ===");
  const db = new PGlite();
  
  // Create profiles table with original schema
  await db.exec(`
    CREATE TABLE profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      preferred_session_minutes INTEGER NOT NULL DEFAULT 60,
      CHECK (preferred_session_minutes IS NULL OR preferred_session_minutes IN (30, 45, 60, 75))
    );
  `);
  
  console.log("\n4. Insert test data before migration");
  {
    await db.exec(`
      INSERT INTO profiles (id, preferred_session_minutes) VALUES
        ('10000000-0000-0000-0000-000000000001', 30),
        ('10000000-0000-0000-0000-000000000002', 45),
        ('10000000-0000-0000-0000-000000000003', 60),
        ('10000000-0000-0000-0000-000000000004', 75);
    `);
    
    const result = await db.query("SELECT COUNT(*) FROM profiles");
    const count = parseInt((result.rows[0] as { count: string }).count);
    check("4 profiles inserted", count === 4, `got ${count}`);
  }
  
  console.log("\n5. Apply migration and verify existing values preserved");
  {
    const migrationPath = join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261025000021_session_length_explicit_save.sql"
    );
    const migration = readFileSync(migrationPath, "utf-8");
    await db.exec(migration);
    
    const result = await db.query(`
      SELECT id, preferred_session_minutes 
      FROM profiles 
      WHERE id IN (
        '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000004'
      )
      ORDER BY id
    `);
    
    const values = Object.fromEntries(
      result.rows.map((r) => [
        (r as { id: string }).id,
        (r as { preferred_session_minutes: number | null }).preferred_session_minutes
      ])
    );
    
    check("30 preserved", values["10000000-0000-0000-0000-000000000001"] === 30);
    check("45 preserved", values["10000000-0000-0000-0000-000000000002"] === 45);
    check("60 preserved", values["10000000-0000-0000-0000-000000000003"] === 60);
    check("75 preserved", values["10000000-0000-0000-0000-000000000004"] === 75);
  }
  
  console.log("\n6. Verify NULL is now allowed");
  {
    await db.exec(`
      INSERT INTO profiles (id, preferred_session_minutes) 
      VALUES ('10000000-0000-0000-0000-000000000005', NULL)
    `);
    
    const result = await db.query(`
      SELECT preferred_session_minutes 
      FROM profiles 
      WHERE id = '10000000-0000-0000-0000-000000000005'
    `);
    const value = (result.rows[0] as { preferred_session_minutes: number | null }).preferred_session_minutes;
    check("NULL value stored", value === null);
  }
  
  console.log("\n7. Verify check constraint still applies");
  {
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('10000000-0000-0000-0000-000000000099', 50)
      `);
      check("50 rejected", false);
    } catch (error: unknown) {
      const isCheckViolation = (error as Error).message.includes("check constraint") ||
                               (error as Error).message.includes("violates");
      check("50 rejected", isCheckViolation);
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
