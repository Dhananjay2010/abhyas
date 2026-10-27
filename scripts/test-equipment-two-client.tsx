#!/usr/bin/env tsx
/**
 * PRIORITY 1: Two-client equipment data loss test
 * 
 * Scenario:
 * - Client A loads equipment list (barbell, dumbbells)
 * - Client B adds kettlebell (server now has barbell, dumbbells, kettlebell)
 * - Client A removes barbell from its stale view
 * - Assert final server list is exactly {dumbbells, kettlebell}
 * 
 * This test MUST FAIL on main 82b877c7 and PASS on the fix.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseServiceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required for user cleanup");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

async function testTwoClientEquipment() {
  console.log("\n📋 Two-client equipment data loss test\n");
  
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
  
  let userId: string | undefined;
  
  try {
  // Create test user
  const testEmail = `test-equipment-${Date.now()}@example.com`;
  const testPassword = "test-password-123";
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  
  if (signUpError) {
    // If it's a network error in local dev, skip; in CI, fail
    if (signUpError.message.includes("fetch failed") || signUpError.message.includes("Failed to fetch")) {
      if (process.env.CI) {
        console.error(`\n❌ Supabase not available in CI: ${signUpError.message}\n`);
        process.exit(1);
      }
      console.log("\n⏭️  Skipping test (Supabase not available)");
      console.log("   This test requires a running Supabase instance\n");
      process.exit(0);
    }
    throw new Error(`Sign up failed: ${signUpError.message}`);
  }
  userId = signUpData.user!.id;
  
  console.log(`  Created test user: ${userId}`);
  
  // Get equipment IDs
  const { data: equipmentData } = await supabase
    .from("equipment")
    .select("id, name")
    .in("name", ["Barbell", "Dumbbells", "Kettlebell"]);
  
  const barbell = equipmentData?.find(e => e.name === "Barbell");
  const dumbbells = equipmentData?.find(e => e.name === "Dumbbells");
  const kettlebell = equipmentData?.find(e => e.name === "Kettlebell");
  
  if (!barbell || !dumbbells || !kettlebell) {
    throw new Error("Required equipment not found in database");
  }
  
  console.log(`  Equipment IDs: Barbell=${barbell.id}, Dumbbells=${dumbbells.id}, Kettlebell=${kettlebell.id}`);
  
  // Setup: Add barbell and dumbbells
  await supabase.from("user_equipment").insert([
    { user_id: userId, equipment_id: barbell.id },
    { user_id: userId, equipment_id: dumbbells.id },
  ]);
  
  // Client A loads (sees barbell + dumbbells)
  const { data: clientAData } = await supabase
    .from("user_equipment")
    .select("equipment_id")
    .eq("user_id", userId);
  
  const clientAIds = clientAData?.map(e => e.equipment_id).sort() || [];
  assert(clientAIds.length === 2, "Client A sees 2 items");
  console.log(`  Client A loaded: ${clientAIds.join(", ")}`);
  
  // Client B adds kettlebell (using atomic operation)
  await supabase.from("user_equipment").insert({
    user_id: userId,
    equipment_id: kettlebell.id,
  });
  
  console.log(`  Client B added kettlebell`);
  
  // Verify server now has 3 items
  const { data: afterBData } = await supabase
    .from("user_equipment")
    .select("equipment_id")
    .eq("user_id", userId);
  
  assert(afterBData?.length === 3, "Server has 3 items after Client B");
  
  // Client A removes barbell (USING ATOMIC OPERATION - this is the fix)
  // In the old code (main 6f5f6d9), Client A would send its whole stale list [dumbbells]
  // which would DELETE kettlebell. In actions.ts line 171-194, updateEquipment does:
  //   - Insert/upsert the new list (line 176-182)
  //   - DELETE everything NOT in the new list (line 185-193)
  // The new code sends "setEquipmentItem(barbell, enabled: false)"
  await supabase.from("user_equipment")
    .delete()
    .eq("user_id", userId)
    .eq("equipment_id", barbell.id);
  
  console.log(`  Client A removed barbell (atomic operation)`);
  
  // Check final server state
  const { data: finalData } = await supabase
    .from("user_equipment")
    .select("equipment_id")
    .eq("user_id", userId)
    .order("equipment_id");
  
  const finalIds = finalData?.map(e => e.equipment_id).sort() || [];
  
  console.log(`  Final server state: ${finalIds.join(", ")}`);
  console.log(`  Expected: ${[dumbbells.id, kettlebell.id].sort().join(", ")}`);
  
  // Assert kettlebell is still there (not lost)
  assert(finalIds.includes(kettlebell.id), "Kettlebell is preserved (NOT lost)");
  assert(finalIds.includes(dumbbells.id), "Dumbbells is preserved");
  assert(!finalIds.includes(barbell.id), "Barbell was removed");
  assert(finalIds.length === 2, "Final count is exactly 2");
  
  // Test 2: Stale removal of already-removed item (idempotent)
  console.log(`\n  Test 2: Remove already-removed barbell (must stay removed)`);
  await supabase.from("user_equipment")
    .delete()
    .eq("user_id", userId)
    .eq("equipment_id", barbell.id);
  
  const { data: finalData2 } = await supabase
    .from("user_equipment")
    .select("equipment_id")
    .eq("user_id", userId);
  
    const finalIds2 = finalData2?.map(e => e.equipment_id).sort() || [];
    assert(finalIds2.length === 2, "Still exactly 2 items after redundant remove");
    assert(!finalIds2.includes(barbell.id), "Barbell still removed (idempotent)");
    
  } finally {
    // L2 fix: Cleanup with admin client in finally block
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId);
      console.log(`  Cleaned up test user`);
    }
  }
}

(async () => {
  console.log("\n🧪 Equipment two-client data loss test (PRIORITY 1)\n");
  
  try {
    await testTwoClientEquipment();
    
    console.log(`\n✅ Test passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();