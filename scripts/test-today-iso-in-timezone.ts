/**
 * Test: getTodayIsoInTimezone with fixed instants
 * 
 * Tests the pure timezone-aware date formatter with injected Date instances.
 * Proves that the old UTC approach fails at timezone boundaries.
 */

import { getTodayIsoInTimezone } from "@/lib/dates/today-iso";

async function main() {
  console.log("\n=== getTodayIsoInTimezone Tests ===\n");

  // Test 1: At 2026-10-24T20:00:00Z, it's Oct 25 in IST but Oct 24 in UTC
  console.log("1. Fixed instant: 2026-10-24T20:00:00Z");
  {
    const instant = new Date("2026-10-24T20:00:00Z");
    
    const istDate = getTodayIsoInTimezone("Asia/Kolkata", instant);
    if (istDate !== "2026-10-25") {
      console.log(`   ❌ FAIL: Expected '2026-10-25' for Asia/Kolkata, got '${istDate}'`);
      process.exit(1);
    }
    console.log(`   ✅ PASS: Asia/Kolkata returns '2026-10-25'`);
    
    const utcDate = getTodayIsoInTimezone("UTC", instant);
    if (utcDate !== "2026-10-24") {
      console.log(`   ❌ FAIL: Expected '2026-10-24' for UTC, got '${utcDate}'`);
      process.exit(1);
    }
    console.log(`   ✅ PASS: UTC returns '2026-10-24'`);
  }

  // Test 2: Just before midnight in IST (still Oct 24)
  console.log("\n2. Fixed instant: 2026-10-24T18:29:59Z (23:59:59 IST)");
  {
    const instant = new Date("2026-10-24T18:29:59Z");
    
    const istDate = getTodayIsoInTimezone("Asia/Kolkata", instant);
    if (istDate !== "2026-10-24") {
      console.log(`   ❌ FAIL: Expected '2026-10-24' for Asia/Kolkata, got '${istDate}'`);
      process.exit(1);
    }
    console.log(`   ✅ PASS: Asia/Kolkata returns '2026-10-24' (23:59:59 IST)`);
  }

  // Test 3: null timezone falls back to branding default
  console.log("\n3. null timezone falls back to branding default");
  {
    const instant = new Date("2026-10-24T20:00:00Z");
    const result = getTodayIsoInTimezone(null, instant);
    
    // Should not throw and should return a valid ISO date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
      console.log(`   ❌ FAIL: Expected YYYY-MM-DD format, got '${result}'`);
      process.exit(1);
    }
    console.log(`   ✅ PASS: null timezone returns valid ISO date '${result}'`);
  }

  // Test 4: Invalid timezone falls back to branding default
  console.log("\n4. Invalid timezone falls back to branding default");
  {
    const instant = new Date("2026-10-24T20:00:00Z");
    const result = getTodayIsoInTimezone("Invalid/Zone", instant);
    
    // Should not throw and should return a valid ISO date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
      console.log(`   ❌ FAIL: Expected YYYY-MM-DD format, got '${result}'`);
      process.exit(1);
    }
    console.log(`   ✅ PASS: Invalid timezone returns valid ISO date '${result}'`);
  }

  // Test 5: OLD UTC APPROACH FAILS
  console.log("\n5. REGRESSION: Old UTC approach fails for IST user at midnight boundary");
  {
    const instant = new Date("2026-10-24T20:00:00Z");
    
    // Old approach: new Date().toISOString().slice(0, 10)
    const oldUtcApproach = instant.toISOString().slice(0, 10);
    
    console.log(`   OLD UTC approach: instant.toISOString().slice(0, 10) = '${oldUtcApproach}'`);
    console.log(`   IST user expects: '2026-10-25' (it's 01:30 AM IST)`);
    console.log(`   NEW approach: getTodayIsoInTimezone('Asia/Kolkata', instant) = '${getTodayIsoInTimezone("Asia/Kolkata", instant)}'`);
    
    if (oldUtcApproach === "2026-10-25") {
      console.log(`   ❌ FAIL: Old approach should return '2026-10-24', got '${oldUtcApproach}'`);
      process.exit(1);
    }
    
    const newApproach = getTodayIsoInTimezone("Asia/Kolkata", instant);
    if (newApproach !== "2026-10-25") {
      console.log(`   ❌ FAIL: New approach should return '2026-10-25', got '${newApproach}'`);
      process.exit(1);
    }
    
    console.log(`   ✅ PASS: Old UTC approach returns '${oldUtcApproach}' (WRONG for IST)`);
    console.log(`   ✅ PASS: New approach returns '${newApproach}' (CORRECT for IST)`);
    console.log(`   This proves the bug: IST user between 00:00-05:30 gets wrong date with old code`);
  }

  console.log("\n✅ All getTodayIsoInTimezone tests passed\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
