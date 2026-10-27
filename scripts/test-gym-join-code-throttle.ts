/**
 * Test join code throttling: only misses count.
 * 
 * Verifies that successful preview/redeem operations do NOT increment the throttle counter,
 * and only failed attempts count toward the 10-per-15-min limit.
 * 
 * Run: REAL_DB=1 npm run test:gym-join-code-throttle
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { resetJoinCodeThrottle } from "../src/lib/rate-limit/join-code-throttle";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
  if (process.env.REAL_DB !== "1") {
    console.log("\n⏭️  Skipping throttle tests (REAL_DB=1 not set)\n");
    return true;
  }

  console.log("\n🧪 Testing join code throttle (only misses count)\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Create test user
  const emailTest = `throttle-test-${Date.now()}@example.com`;
  const { data: userData } = await adminClient.auth.admin.createUser({
    email: emailTest,
    password: "test-password-123",
    email_confirm: true,
  });
  const userId = userData.user?.id;
  if (!userId) {
    console.error("Failed to create test user");
    return false;
  }

  const { data: sessionData } = await adminClient.auth.signInWithPassword({
    email: emailTest,
    password: "test-password-123",
  });
  if (!sessionData.session) {
    console.error("Failed to sign in test user");
    return false;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
    },
  });

  // Reset throttle for this user
  await resetJoinCodeThrottle(userId);

  // Create a test gym and code
  const gymId = randomUUID();
  await adminClient.from("gyms").insert({
    id: gymId,
    slug: `throttle-gym-${Date.now()}`,
    name: "Throttle Test Gym",
  });

  await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: userId,
    role: "owner",
    status: "active",
  });

  const { data: codeData } = await userClient.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });

  const validCode = codeData?.[0]?.code;
  if (!validCode) {
    console.error("Failed to create test code");
    return false;
  }

  console.log("TEST: Successful operations do NOT count against throttle");
  
  // Preview valid code 5 times (should all succeed, none count)
  for (let i = 0; i < 5; i++) {
    const { data, error } = await userClient.rpc("preview_join_code", {
      p_code: validCode,
    });
    check(`Preview ${i + 1} succeeded`, !error && data && data.length > 0);
  }

  // Now try 10 invalid codes (these SHOULD count as misses)
  console.log("\nTEST: Failed attempts count as misses");
  let missCount = 0;
  for (let i = 0; i < 12; i++) {
    const { error } = await userClient.rpc("redeem_join_code", {
      p_code: "INVALID" + i,
    });
    
    if (error?.message === "Invalid code") {
      missCount++;
      check(`Miss ${missCount} recorded`, true);
    } else if (error?.message?.includes("Too many failed attempts")) {
      check(`Throttled after ${missCount} misses`, missCount === 10);
      break;
    }
  }

  check("Exactly 10 misses allowed before throttle", missCount === 10);

  // Clean up
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymId);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymId);
  await adminClient.from("gyms").delete().eq("id", gymId);
  await resetJoinCodeThrottle(userId);

  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} throttle test(s) failed\n`);
    return false;
  }

  console.log("\n✅ All throttle tests passed\n");
  return true;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
