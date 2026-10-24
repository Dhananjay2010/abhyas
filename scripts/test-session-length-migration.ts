/**
 * Test migration 20261025000019_session_minutes_check.sql with real Postgres (PGlite).
 *
 * Validates:
 * - Value mapping (37→30, 38→45, 52→45, 53→60, 67→60, 68→75, 90→75, 20→30, null→null, 45→45, 60→60)
 * - Idempotency (running twice is safe)
 * - Constraint enforcement (50 rejected, null allowed)
 *
 *   npm run test:session-length-migration
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
  
  // Create profiles table with preferred_session_minutes
  await db.exec(`
    CREATE TABLE profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      preferred_session_minutes INTEGER
    );
  `);
  
  console.log("\n1. Insert test data");
  {
    await db.exec(`
      INSERT INTO profiles (id, preferred_session_minutes) VALUES
        ('00000000-0000-0000-0000-000000000001', 37),
        ('00000000-0000-0000-0000-000000000002', 38),
        ('00000000-0000-0000-0000-000000000003', 52),
        ('00000000-0000-0000-0000-000000000004', 53),
        ('00000000-0000-0000-0000-000000000005', 67),
        ('00000000-0000-0000-0000-000000000006', 68),
        ('00000000-0000-0000-0000-000000000007', 90),
        ('00000000-0000-0000-0000-000000000008', 20),
        ('00000000-0000-0000-0000-000000000009', NULL),
        ('00000000-0000-0000-0000-000000000010', 45),
        ('00000000-0000-0000-0000-000000000011', 60);
    `);
    
    const result = await db.query("SELECT COUNT(*) FROM profiles");
    const count = parseInt((result.rows[0] as { count: string }).count);
    check("11 profiles inserted", count === 11, `got ${count}`);
  }
  
  console.log("\n2. Apply migration 20261025000019_session_minutes_check.sql");
  {
    const migrationPath = join(process.cwd(), "supabase", "migrations", "20261025000019_session_minutes_check.sql");
    const migration = readFileSync(migrationPath, "utf-8");
    
    await db.exec(migration);
    check("Migration applied successfully", true);
  }
  
  console.log("\n3. Verify value mapping");
  {
    const result = await db.query(`
      SELECT id, preferred_session_minutes 
      FROM profiles 
      ORDER BY id
    `);
    
    const values = Object.fromEntries(
      result.rows.map((r) => [(r as { id: string }).id, (r as { preferred_session_minutes: number | null }).preferred_session_minutes])
    );
    
    check("37 → 30", values["00000000-0000-0000-0000-000000000001"] === 30);
    check("38 → 45", values["00000000-0000-0000-0000-000000000002"] === 45);
    check("52 → 45", values["00000000-0000-0000-0000-000000000003"] === 45);
    check("53 → 60", values["00000000-0000-0000-0000-000000000004"] === 60);
    check("67 → 60", values["00000000-0000-0000-0000-000000000005"] === 60);
    check("68 → 75", values["00000000-0000-0000-0000-000000000006"] === 75);
    check("90 → 75", values["00000000-0000-0000-0000-000000000007"] === 75);
    check("20 → 30", values["00000000-0000-0000-0000-000000000008"] === 30);
    check("NULL → NULL", values["00000000-0000-0000-0000-000000000009"] === null);
    check("45 → 45 (no change)", values["00000000-0000-0000-0000-000000000010"] === 45);
    check("60 → 60 (no change)", values["00000000-0000-0000-0000-000000000011"] === 60);
  }
  
  console.log("\n4. Test idempotency (run migration again)");
  {
    const migrationPath = join(process.cwd(), "supabase", "migrations", "20261025000019_session_minutes_check.sql");
    const migration = readFileSync(migrationPath, "utf-8");
    
    await db.exec(migration);
    check("Migration runs again without error", true);
    
    // Verify values unchanged
    const result = await db.query(`
      SELECT id, preferred_session_minutes 
      FROM profiles 
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `);
    
    check("37→30 still 30 after second run", (result.rows[0] as { preferred_session_minutes: number }).preferred_session_minutes === 30);
  }
  
  console.log("\n5. Test constraint enforcement");
  {
    // Try to insert invalid value (50)
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000099', 50)
      `);
      check("50 is rejected by constraint", false);
    } catch (error: unknown) {
      const isCheckViolation = (error as Error).message.includes("check constraint") || 
                               (error as Error).message.includes("session_minutes_check") ||
                               (error as Error).message.includes("violates");
      check("50 is rejected by constraint", isCheckViolation);
    }
    
    // Try to insert NULL (allowed)
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000098', NULL)
      `);
      check("NULL is allowed", true);
    } catch (error) {
      check("NULL is allowed", false);
    }
    
    // Try to insert valid value (30)
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000097', 30)
      `);
      check("30 is allowed", true);
    } catch (error) {
      check("30 is allowed", false);
    }
    
    // Try to insert valid value (75)
    try {
      await db.exec(`
        INSERT INTO profiles (id, preferred_session_minutes) 
        VALUES ('00000000-0000-0000-0000-000000000096', 75)
      `);
      check("75 is allowed", true);
    } catch (error) {
      check("75 is allowed", false);
    }
    
    // Try to update to invalid value (90)
    try {
      await db.exec(`
        UPDATE profiles 
        SET preferred_session_minutes = 90 
        WHERE id = '00000000-0000-0000-0000-000000000010'
      `);
      check("Update to 90 is rejected", false);
    } catch (error: unknown) {
      const isCheckViolation = (error as Error).message.includes("check constraint") || 
                               (error as Error).message.includes("session_minutes_check") ||
                               (error as Error).message.includes("violates");
      check("Update to 90 is rejected", isCheckViolation);
    }
  }
  
  console.log("\n6. Verify final state");
  {
    const result = await db.query(`
      SELECT preferred_session_minutes, COUNT(*) as count
      FROM profiles
      WHERE preferred_session_minutes IS NOT NULL
      GROUP BY preferred_session_minutes
      ORDER BY preferred_session_minutes
    `);
    
    const counts = Object.fromEntries(
      result.rows.map((r) => [(r as { preferred_session_minutes: number }).preferred_session_minutes, parseInt((r as { count: string }).count)])
    );
    
    check("Has 30-minute profiles", counts[30] >= 1);
    check("Has 45-minute profiles", counts[45] >= 1);
    check("Has 60-minute profiles", counts[60] >= 1);
    check("Has 75-minute profiles", counts[75] >= 1);
    check("No other values present", Object.keys(counts).every(k => [30, 45, 60, 75].includes(parseInt(k))));
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
