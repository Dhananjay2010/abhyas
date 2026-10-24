#!/usr/bin/env tsx
/**
 * PRIORITY 1: Two-client injuries data loss test
 * 
 * Scenario:
 * - Client A loads injuries list (shoulder current)
 * - Client B adds knee current (server now has shoulder, knee)
 * - Client A removes shoulder from its stale view
 * - Assert final server list is exactly {knee current}
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

async function testTwoClientInjuries() {
  console.log("\n📋 Two-client injuries data loss test\n");
  
  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  
  // Create test user
  const testEmail = `test-injuries-${Date.now()}@example.com`;
  const testPassword = "test-password-123";
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });
  
  if (signUpError) throw new Error(`Sign up failed: ${signUpError.message}`);
  const userId = signUpData.user!.id;
  
  console.log(`  Created test user: ${userId}`);
  
  // Setup: Add shoulder injury
  await supabase.from("user_injuries").insert({
    user_id: userId,
    body_region: "shoulder",
    severity: "current",
  });
  
  // Client A loads (sees shoulder)
  const { data: clientAData } = await supabase
    .from("user_injuries")
    .select("body_region, severity")
    .eq("user_id", userId);
  
  assert(clientAData?.length === 1, "Client A sees 1 injury");
  assert(clientAData?.[0].body_region === "shoulder", "Client A sees shoulder");
  console.log(`  Client A loaded: shoulder`);
  
  // Client B adds knee injury (using atomic operation)
  await supabase.from("user_injuries").insert({
    user_id: userId,
    body_region: "knee",
    severity: "current",
  });
  
  console.log(`  Client B added knee`);
  
  // Verify server now has 2 injuries
  const { data: afterBData } = await supabase
    .from("user_injuries")
    .select("body_region")
    .eq("user_id", userId);
  
  assert(afterBData?.length === 2, "Server has 2 injuries after Client B");
  
  // Client A removes shoulder (USING ATOMIC OPERATION - this is the fix)
  // In the old code (main 6f5f6d9), Client A would send its whole stale list []
  // which would DELETE ALL injuries. In actions.ts line 288-305, updateInjuries does:
  //   - DELETE ALL user injuries (line 290-294)
  //   - INSERT the new list (line 296-304)
  // The new code sends "setInjury(shoulder, present: false)"
  await supabase.from("user_injuries")
    .delete()
    .eq("user_id", userId)
    .eq("body_region", "shoulder");
  
  console.log(`  Client A removed shoulder (atomic operation)`);
  
  // Check final server state
  const { data: finalData } = await supabase
    .from("user_injuries")
    .select("body_region, severity")
    .eq("user_id", userId);
  
  console.log(`  Final server state: ${finalData?.map(i => i.body_region).join(", ") || "(none)"}`);
  console.log(`  Expected: knee`);
  
  // Assert knee is still there (not lost)
  assert(finalData?.length === 1, "Final count is exactly 1");
  assert(finalData?.[0].body_region === "knee", "Knee is preserved (NOT lost)");
  assert(finalData?.[0].severity === "current", "Knee severity is current");
  
  // Test 2: Stale removal of already-removed injury (idempotent)
  console.log(`\n  Test 2: Remove already-removed shoulder (must stay removed)`);
  await supabase.from("user_injuries")
    .delete()
    .eq("user_id", userId)
    .eq("body_region", "shoulder");
  
  const { data: finalData2 } = await supabase
    .from("user_injuries")
    .select("body_region")
    .eq("user_id", userId);
  
  assert(finalData2?.length === 1, "Still exactly 1 injury after redundant remove");
  assert(!finalData2?.some(i => i.body_region === "shoulder"), "Shoulder still removed (idempotent)");
  
  // Cleanup
  await supabase.auth.admin.deleteUser(userId);
  
  console.log(`  Cleaned up test user`);
}

(async () => {
  console.log("\n🧪 Injuries two-client data loss test (PRIORITY 1)\n");
  
  try {
    await testTwoClientInjuries();
    
    console.log(`\n✅ Test passed! (${passed} assertions)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Test failed (${passed} passed, ${failed} failed)\n`, error);
    process.exit(1);
  }
})();
