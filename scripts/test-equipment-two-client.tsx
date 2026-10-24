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
  
  // Create test user
  const testEmail = `test-equipment-${Date.now()}@example.com`;
  const testPassword = "test-password-123";
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  
  if (signUpError) throw new Error(`Sign up failed: ${signUpError.message}`);
  const userId = signUpData.user!.id;
  
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
  // In the old code, Client A would send its whole stale list [dumbbells]
  // In the new code, Client A sends "remove barbell"
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
  
  // Cleanup
  await supabase.auth.admin.deleteUser(userId);
  
  console.log(`  Cleaned up test user`);
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
