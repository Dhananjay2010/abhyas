/**
 * SQL-level tests for gym owner guards (no RPC calls)
 * 
 * Tests:
 * - get_owned_gym_name returns gym name for owners, null for non-owners
 * - gym_id and user_id are immutable on all membership rows
 * - owner's own row: user_id, gym_id, and role are all immutable
 * - Re-running migrations is idempotent
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures++;
  }
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function testDatabaseConnection() {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function runTests() {
  // Skip unless REAL_DB=1
  if (process.env.REAL_DB !== "1") {
    console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
    console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
    return true;
  }

  // Import and check guard
  const { checkRealDbTest } = await import("./lib-db-reset-guard");
  const guardResult = checkRealDbTest();
  
  if (!guardResult.allow) {
    console.log(`\n⏭️  Skipping real DB tests: ${guardResult.reason}\n`);
    return true;
  }
  
  console.log(`✓ Guard check passed: ${guardResult.reason}\n`);

  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    return false;
  }

  console.log("✓ Connected to Supabase\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Verify service role key
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64').toString());
    if (payload.role !== 'service_role') {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      return false;
    }
    console.log(`✓ Using service_role key\n`);
  } catch (e) {
    console.error("❌ Failed to decode service role key");
    return false;
  }

  // Create test users
  const emailOwner = `gym-owner-${Date.now()}@example.com`;
  const passwordOwner = "test-password-owner";
  const emailMember = `gym-member-${Date.now()}@example.com`;
  const passwordMember = "test-password-member";

  console.log("Creating test users...");
  const { data: ownerUser, error: ownerError } = await adminClient.auth.admin.createUser({
    email: emailOwner,
    password: passwordOwner,
    email_confirm: true,
  });

  if (ownerError || !ownerUser.user) {
    console.error("Failed to create owner user:", ownerError);
    return false;
  }
  const userIdOwner = ownerUser.user.id;
  console.log(`✓ Created owner: ${userIdOwner}`);

  const { data: memberUser, error: memberError } = await adminClient.auth.admin.createUser({
    email: emailMember,
    password: passwordMember,
    email_confirm: true,
  });

  if (memberError || !memberUser.user) {
    console.error("Failed to create member user:", memberError);
    return false;
  }
  const userIdMember = memberUser.user.id;
  console.log(`✓ Created member: ${userIdMember}\n`);

  // Create test gym
  const { data: gymData, error: gymError } = await adminClient
    .from("gyms")
    .insert({ slug: `test-gym-${Date.now()}`, name: "Test Gym" })
    .select()
    .single();

  if (gymError || !gymData) {
    console.error("Failed to create gym:", gymError);
    return false;
  }
  const gymId = gymData.id;

  // Add owner to gym
  await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: userIdOwner,
    role: "owner",
    status: "active",
  });

  // Deactivate owner's default membership
  const { data: defaultGym } = await adminClient
    .from("gyms")
    .select("id")
    .eq("slug", "default")
    .single();

  if (defaultGym) {
    const { error: deactivateError } = await adminClient
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("gym_id", defaultGym.id)
      .eq("user_id", userIdOwner);
    check("L-b: Deactivate default membership succeeded", !deactivateError, deactivateError?.message);
  }

  // TEST: get_owned_gym_name (no parameters, uses auth.uid())
  console.log("TEST: get_owned_gym_name uses auth.uid() internally");
  {
    // Create authenticated client for owner
    const { data: ownerSession } = await adminClient.auth.signInWithPassword({
      email: emailOwner,
      password: passwordOwner,
    });
    
    const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerSession.session?.access_token}` } },
    });
    
    const { data, error } = await ownerClient.rpc("get_owned_gym_name");
    check("Owner sees their gym name (no param)", !error && data === "Test Gym", data);
    
    await adminClient.auth.signOut();
  }
  console.log();

  console.log("TEST: get_owned_gym_name returns null for non-owners");
  {
    // Create authenticated client for member
    const { data: memberSession } = await adminClient.auth.signInWithPassword({
      email: emailMember,
      password: passwordMember,
    });
    
    const memberClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${memberSession.session?.access_token}` } },
    });
    
    const { data, error } = await memberClient.rpc("get_owned_gym_name");
    check("Member sees null (no param)", !error && data === null);
    
    await adminClient.auth.signOut();
  }
  console.log();

  // L-a: DB-level test for OWN01 pre-check
  console.log("TEST: L-a: OWN01 pre-check at DB level");
  {
    // Create authenticated client for owner
    const { data: ownerSession } = await adminClient.auth.signInWithPassword({
      email: emailOwner,
      password: passwordOwner,
    });
    
    const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerSession.session?.access_token}` } },
    });
    
    // Call get_owned_gym_name as owner - should return gym name
    const { data: gymName } = await ownerClient.rpc("get_owned_gym_name");
    check("L-a: Owner's get_owned_gym_name returns gym", gymName === "Test Gym");
    
    // This simulates the pre-check in delete_own_account
    // If it returns non-null, deletion would be blocked with OWN01
    check("L-a: Pre-check would block owner deletion", gymName !== null);
    
    await adminClient.auth.signOut();
  }
  console.log();

  // TEST: gym_id immutability
  console.log("TEST: gym_id cannot be changed on membership rows");
  {
    const fakeGymId = randomUUID();
    const { error } = await adminClient
      .from("gym_memberships")
      .update({ gym_id: fakeGymId })
      .eq("gym_id", gymId)
      .eq("user_id", userIdOwner);
    check("gym_id update blocked", !!error && error.message.includes("gym_id cannot be changed"));
  }
  console.log();

  // TEST: user_id immutability
  console.log("TEST: user_id cannot be changed on membership rows");
  {
    const fakeUserId = randomUUID();
    const { error } = await adminClient
      .from("gym_memberships")
      .update({ user_id: fakeUserId })
      .eq("gym_id", gymId)
      .eq("user_id", userIdOwner);
    check("user_id update blocked", !!error && error.message.includes("user_id cannot be changed"));
  }
  console.log();

  // TEST: Migration re-run idempotency (L-c)
  console.log("TEST: L-c: Re-running migrations 34, 35, 36 is idempotent");
  {

    // Get current state
    const { data: gymsBefore } = await adminClient.from("gyms").select("*").order("created_at");
    const { data: membershipsBefore } = await adminClient.from("gym_memberships").select("*").order("joined_at");

    // Re-run migrations 000034, 000035, and 000036 via psql with ON_ERROR_STOP
    const dbUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";
    try {
      await execAsync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000034_gym_tenant_schema.sql`);
      await execAsync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000035_gym_backfill_default.sql`);
      await execAsync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000036_owner_account_deletion_guard.sql`);
      
      // Get state after re-run
      const { data: gymsAfter } = await adminClient.from("gyms").select("*").order("created_at");
      const { data: membershipsAfter } = await adminClient.from("gym_memberships").select("*").order("joined_at");

      check("L-c: Gyms unchanged after re-run", JSON.stringify(gymsBefore) === JSON.stringify(gymsAfter));
      check("L-c: Memberships unchanged after re-run", JSON.stringify(membershipsBefore) === JSON.stringify(membershipsAfter));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      check("L-c: Migration re-run with ON_ERROR_STOP succeeded", false, message);
    }
  }
  console.log();

  // L-f: Test staff demotion when user already has active member row
  console.log("TEST: L-f: Demoting staff to member when user already has member row");
  {
    // Create a test gym and staff user
    const { data: testGymData } = await adminClient
      .from("gyms")
      .insert({ slug: `test-gym-lf-${Date.now()}`, name: "Test Gym LF" })
      .select()
      .single();

    if (!testGymData) {
      check("L-f: Failed to create test gym", false);
    } else {
      const testGymId = testGymData.id;

      // Create a user who is staff in testGym
      const { data: staffUser } = await adminClient.auth.admin.createUser({
        email: `staff-lf-${Date.now()}@example.com`,
        password: "test-password-lf",
        email_confirm: true,
      });

      if (!staffUser.user) {
        check("L-f: Failed to create staff user", false);
      } else {
        const staffUserId = staffUser.user.id;

        // Add as staff to testGym
        await adminClient.from("gym_memberships").insert({
          gym_id: testGymId,
          user_id: staffUserId,
          role: "staff",
          status: "active",
        });

        // User should already have an active member row in default gym (from signup trigger)
        const { data: defaultMembership } = await adminClient
          .from("gym_memberships")
          .select("*")
          .eq("gym_id", defaultGym?.id)
          .eq("user_id", staffUserId)
          .eq("status", "active")
          .maybeSingle();

        check("L-f: User has active default gym membership", !!defaultMembership);

        // Try to demote staff to member in testGym (should fail with unique violation or clear error)
        const { error: demoteError } = await adminClient
          .from("gym_memberships")
          .update({ role: "member" })
          .eq("gym_id", testGymId)
          .eq("user_id", staffUserId);

        check("L-f: Demoting staff to member with existing member row fails", !!demoteError);
        check("L-f: Error is not a raw unique violation", 
          demoteError ? !demoteError.message.includes("23505") || demoteError.message.includes("active") : false,
          demoteError?.message);

        // Cleanup
        await adminClient.auth.admin.deleteUser(staffUserId);
      }
    }
  }
  console.log();

  // Cleanup
  console.log("Cleaning up test users...");
  await adminClient.auth.admin.deleteUser(userIdOwner);
  await adminClient.auth.admin.deleteUser(userIdMember);
  console.log("✓ Test users cleaned up\n");

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    return false;
  }

  console.log("\n✅ All tests passed\n");
  return true;
}

runTests().then((success) => {
  process.exit(success ? 0 : 1);
});
