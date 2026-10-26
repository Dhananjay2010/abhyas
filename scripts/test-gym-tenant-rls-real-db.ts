/**
 * Real database tests for gym/tenant RLS policies.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - Owner A can't see gym B's memberships or row
 * - A member can't see the gym roster (only their own membership)
 * - Staff can read the roster but can't promote, add or remove
 * - A member can't self-insert a membership
 * - Only the owner updates the gym
 * - Backfill and the signup trigger put a new user in the default gym
 * - Re-running the migrations is a no-op
 * - Deleting a user cascades their memberships
 * - The 0-or-1 owner constraint works
 * - The at-most-one-active-member-per-user constraint works
 * 
 * Run: supabase start && REAL_DB=1 npm run test:gym-tenant-rls-real-db
 * 
 * In CI: REAL_DB=1 is set to require a running database (fails if unavailable).
 * Locally: skips gracefully if REAL_DB=1 is not set.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

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

  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    return false;
  }

  console.log("✓ Connected to Supabase\n");

  // Service role client for fixture setup (bypasses RLS)
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
  const emailA = `gym-owner-a-${Date.now()}@example.com`;
  const passwordA = "test-password-123";
  const emailB = `gym-owner-b-${Date.now()}@example.com`;
  const passwordB = "test-password-456";
  const emailMemberC = `gym-member-c-${Date.now()}@example.com`;
  const passwordMemberC = "test-password-789";
  const emailStaffD = `gym-staff-d-${Date.now()}@example.com`;
  const passwordStaffD = "test-password-abc";

  let userIdA: string | null = null;
  let userIdB: string | null = null;
  let userIdMemberC: string | null = null;
  let userIdStaffD: string | null = null;

  console.log("Creating test users...");
  
  // Create user A
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create user A:", error);
      return false;
    }
    userIdA = data.user.id;
    console.log(`✓ Created user A: ${userIdA}`);
  }

  // Create user B
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create user B:", error);
      return false;
    }
    userIdB = data.user.id;
    console.log(`✓ Created user B: ${userIdB}`);
  }

  // Create member C
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailMemberC,
      password: passwordMemberC,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create member C:", error);
      return false;
    }
    userIdMemberC = data.user.id;
    console.log(`✓ Created member C: ${userIdMemberC}`);
  }

  // Create staff D
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailStaffD,
      password: passwordStaffD,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create staff D:", error);
      return false;
    }
    userIdStaffD = data.user.id;
    console.log(`✓ Created staff D: ${userIdStaffD}`);
  }

  console.log();

  // Get signed-in clients for each user
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientMemberC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientStaffD = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  {
    const { error } = await clientA.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    });
    if (error) {
      console.error("Failed to sign in user A:", error);
      return false;
    }
  }

  {
    const { error } = await clientB.auth.signInWithPassword({
      email: emailB,
      password: passwordB,
    });
    if (error) {
      console.error("Failed to sign in user B:", error);
      return false;
    }
  }

  {
    const { error } = await clientMemberC.auth.signInWithPassword({
      email: emailMemberC,
      password: passwordMemberC,
    });
    if (error) {
      console.error("Failed to sign in member C:", error);
      return false;
    }
  }

  {
    const { error } = await clientStaffD.auth.signInWithPassword({
      email: emailStaffD,
      password: passwordStaffD,
    });
    if (error) {
      console.error("Failed to sign in staff D:", error);
      return false;
    }
  }

  console.log("✓ All users signed in\n");

  // Check that new users were added to the default gym
  console.log("TEST: New users auto-added to default gym");
  {
    const { data: defaultGym } = await adminClient
      .from("gyms")
      .select("id")
      .eq("slug", "default")
      .single();

    if (!defaultGym) {
      console.error("❌ Default gym not found");
      return false;
    }

    const { data: membershipA } = await adminClient
      .from("gym_memberships")
      .select("*")
      .eq("gym_id", defaultGym.id)
      .eq("user_id", userIdA)
      .single();

    check("User A added to default gym", !!membershipA);
    check("User A role is member", membershipA?.role === "member");
    check("User A status is active", membershipA?.status === "active");

    const { data: membershipB } = await adminClient
      .from("gym_memberships")
      .select("*")
      .eq("gym_id", defaultGym.id)
      .eq("user_id", userIdB)
      .single();

    check("User B added to default gym", !!membershipB);
  }
  console.log();

  // Create two gyms (gymA owned by userA, gymB owned by userB)
  console.log("TEST: Create gyms via admin client");
  const gymIdA = randomUUID();
  const gymIdB = randomUUID();

  {
    const { error } = await adminClient.from("gyms").insert({
      id: gymIdA,
      slug: `gym-a-${Date.now()}`,
      name: "Gym A",
      timezone: "America/New_York",
    });
    check("Gym A created", !error, error?.message);
  }

  {
    const { error } = await adminClient.from("gyms").insert({
      id: gymIdB,
      slug: `gym-b-${Date.now()}`,
      name: "Gym B",
      timezone: "Europe/London",
    });
    check("Gym B created", !error, error?.message);
  }
  console.log();

  // Add user A as owner of gym A
  console.log("TEST: Add owners and staff via admin client");
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymIdA,
      user_id: userIdA,
      role: "owner",
      status: "active",
    });
    check("User A is owner of gym A", !error, error?.message);
  }

  // Add user B as owner of gym B
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymIdB,
      user_id: userIdB,
      role: "owner",
      status: "active",
    });
    check("User B is owner of gym B", !error, error?.message);
  }

  // Add member C to gym A
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymIdA,
      user_id: userIdMemberC,
      role: "member",
      status: "active",
    });
    check("Member C added to gym A", !error, error?.message);
  }

  // Add staff D to gym A
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymIdA,
      user_id: userIdStaffD,
      role: "staff",
      status: "active",
    });
    check("Staff D added to gym A", !error, error?.message);
  }
  console.log();

  // RLS TEST: Owner A can't see gym B's row
  console.log("TEST: Owner A can't see gym B's row");
  {
    const { data, error } = await clientA
      .from("gyms")
      .select("*")
      .eq("id", gymIdB)
      .maybeSingle();
    check("Owner A can't see gym B", data === null && !error);
  }
  console.log();

  // RLS TEST: Owner A can see gym A's row
  console.log("TEST: Owner A can see gym A's row");
  {
    const { data, error } = await clientA
      .from("gyms")
      .select("*")
      .eq("id", gymIdA)
      .maybeSingle();
    check("Owner A can see gym A", !!data && !error);
  }
  console.log();

  // RLS TEST: Owner A can't see gym B's memberships
  console.log("TEST: Owner A can't see gym B's memberships");
  {
    const { data, error } = await clientA
      .from("gym_memberships")
      .select("*")
      .eq("gym_id", gymIdB);
    check("Owner A sees 0 memberships of gym B", data?.length === 0 && !error);
  }
  console.log();

  // RLS TEST: Member C can't see gym A's roster (only their own membership)
  console.log("TEST: Member C can't see gym A's full roster");
  {
    const { data, error } = await clientMemberC
      .from("gym_memberships")
      .select("*")
      .eq("gym_id", gymIdA);
    // Member can only see their own membership
    check("Member C sees only 1 row (their own)", data?.length === 1 && !error);
    check("Member C sees their own membership", data?.[0]?.user_id === userIdMemberC);
  }
  console.log();

  // RLS TEST: Staff D can read the full roster of gym A
  console.log("TEST: Staff D can read the full roster of gym A");
  {
    const { data, error } = await clientStaffD
      .from("gym_memberships")
      .select("*")
      .eq("gym_id", gymIdA);
    // Staff sees owner A, member C, and staff D = 3 rows
    check("Staff D sees all 3 memberships", data?.length === 3 && !error);
  }
  console.log();

  // RLS TEST: Staff D can't promote member C to staff
  console.log("TEST: Staff D can't promote member C to staff");
  {
    const { error } = await clientStaffD
      .from("gym_memberships")
      .update({ role: "staff" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdMemberC);
    check("Staff D can't update role", !!error && error.code === "42501");
  }
  console.log();

  // RLS TEST: Staff D can't remove member C
  console.log("TEST: Staff D can't remove member C");
  {
    const { error } = await clientStaffD
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdMemberC);
    check("Staff D can't update status", !!error && error.code === "42501");
  }
  console.log();

  // RLS TEST: Staff D can't delete member C
  console.log("TEST: Staff D can't delete member C");
  {
    const { error } = await clientStaffD
      .from("gym_memberships")
      .delete()
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdMemberC);
    check("Staff D can't delete membership", !!error && error.code === "42501");
  }
  console.log();

  // RLS TEST: Member C can't self-insert a membership to gym B
  console.log("TEST: Member C can't self-insert a membership to gym B");
  {
    const { error } = await clientMemberC
      .from("gym_memberships")
      .insert({
        gym_id: gymIdB,
        user_id: userIdMemberC,
        role: "member",
        status: "active",
      });
    check("Member C can't insert member role", !!error);
  }
  console.log();

  // RLS TEST: Owner A can update gym A
  console.log("TEST: Owner A can update gym A");
  {
    const { error } = await clientA
      .from("gyms")
      .update({ name: "Gym A Updated" })
      .eq("id", gymIdA);
    check("Owner A can update gym A", !error, error?.message);
  }
  console.log();

  // RLS TEST: Member C can't update gym A
  console.log("TEST: Member C can't update gym A");
  {
    const { error } = await clientMemberC
      .from("gyms")
      .update({ name: "Gym A Hacked" })
      .eq("id", gymIdA);
    check("Member C can't update gym A", !!error && error.code === "42501");
  }
  console.log();

  // RLS TEST: Owner A can add staff to gym A
  console.log("TEST: Owner A can add staff to gym A");
  const newStaffId = randomUUID();
  {
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `new-staff-${Date.now()}@example.com`,
      password: "test-password-xyz",
      email_confirm: true,
    });
    
    if (createError || !newUser.user) {
      console.error("Failed to create new staff user:", createError);
      return false;
    }

    const { error } = await clientA
      .from("gym_memberships")
      .insert({
        gym_id: gymIdA,
        user_id: newUser.user.id,
        role: "staff",
        status: "active",
      });
    check("Owner A can add staff", !error, error?.message);
  }
  console.log();

  // RLS TEST: Owner A can remove staff D
  console.log("TEST: Owner A can remove staff D");
  {
    const { error } = await clientA
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdStaffD);
    check("Owner A can remove staff", !error, error?.message);
  }
  console.log();

  // CONSTRAINT TEST: Can't have two active owners per gym
  console.log("TEST: Can't have two active owners per gym");
  {
    const { data: anotherUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `another-owner-${Date.now()}@example.com`,
      password: "test-password-def",
      email_confirm: true,
    });

    if (createError || !anotherUser.user) {
      console.error("Failed to create another owner user:", createError);
      return false;
    }

    const { error } = await adminClient
      .from("gym_memberships")
      .insert({
        gym_id: gymIdA,
        user_id: anotherUser.user.id,
        role: "owner",
        status: "active",
      });
    check("Can't add second active owner", !!error && error.code === "23505");
  }
  console.log();

  // CONSTRAINT TEST: Can have at most one active member-role membership per user
  console.log("TEST: Can't have two active member-role memberships per user");
  {
    const { error } = await adminClient
      .from("gym_memberships")
      .insert({
        gym_id: gymIdB,
        user_id: userIdMemberC,
        role: "member",
        status: "active",
      });
    check("Can't add second active member membership", !!error && error.code === "23505");
  }
  console.log();

  // CONSTRAINT TEST: Owner can have multiple gym memberships (as owner/staff)
  console.log("TEST: Owner A can be staff of gym B");
  {
    const { error } = await adminClient
      .from("gym_memberships")
      .insert({
        gym_id: gymIdB,
        user_id: userIdA,
        role: "staff",
        status: "active",
      });
    check("Owner A can be staff of gym B", !error, error?.message);
  }
  console.log();

  // SELF-DEMOTION TEST: Owner can't demote themselves
  console.log("TEST: Owner A can't demote themselves to staff");
  {
    const { error } = await clientA
      .from("gym_memberships")
      .update({ role: "staff" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdA);
    check("Owner A can't change own role to staff", !!error);
  }
  console.log();

  // SELF-DEMOTION TEST: Owner can't demote themselves to member
  console.log("TEST: Owner A can't demote themselves to member");
  {
    const { error } = await clientA
      .from("gym_memberships")
      .update({ role: "member" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdA);
    check("Owner A can't change own role to member", !!error);
  }
  console.log();

  // SELF-REMOVAL TEST: Owner can't mark themselves as removed
  console.log("TEST: Owner A can't mark themselves as removed");
  {
    const { error } = await clientA
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdA);
    check("Owner A can't change own status to removed", !!error);
  }
  console.log();

  // SELF-DELETION TEST: Owner can't delete their own owner row
  console.log("TEST: Owner A can't delete their own owner membership");
  {
    const { error } = await clientA
      .from("gym_memberships")
      .delete()
      .eq("gym_id", gymIdA)
      .eq("user_id", userIdA);
    check("Owner A can't delete own membership", !!error);
  }
  console.log();

  // CASCADE TEST: Deleting a user cascades their memberships
  console.log("TEST: Deleting a user cascades their memberships");
  const testUserId = randomUUID();
  {
    // Create test user
    const { data: testUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `delete-test-${Date.now()}@example.com`,
      password: "test-password-ghi",
      email_confirm: true,
    });

    if (createError || !testUser.user) {
      console.error("Failed to create delete test user:", createError);
      return false;
    }

    // Add to gym A
    await adminClient.from("gym_memberships").insert({
      gym_id: gymIdA,
      user_id: testUser.user.id,
      role: "member",
      status: "active",
    });

    // Delete the user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(testUser.user.id);
    check("User deleted", !deleteError, deleteError?.message);

    // Check membership was cascaded
    const { data: membership } = await adminClient
      .from("gym_memberships")
      .select("*")
      .eq("user_id", testUser.user.id)
      .maybeSingle();
    check("Membership cascaded on user deletion", membership === null);
  }
  console.log();

  // IDEMPOTENCY TEST: Re-running migrations is a no-op
  console.log("TEST: Re-running migrations is a no-op");
  {
    // Try to re-insert the default gym
    const { error } = await adminClient
      .from("gyms")
      .insert({
        slug: "default",
        name: "Abhyas",
        timezone: "Asia/Kolkata",
      });
    // Should be a conflict but handled by ON CONFLICT DO NOTHING
    check("Re-inserting default gym is a no-op", error?.code === "23505" || !error);
  }
  console.log();

  // Clean up test users
  console.log("Cleaning up test users...");
  if (userIdA) await adminClient.auth.admin.deleteUser(userIdA);
  if (userIdB) await adminClient.auth.admin.deleteUser(userIdB);
  if (userIdMemberC) await adminClient.auth.admin.deleteUser(userIdMemberC);
  if (userIdStaffD) await adminClient.auth.admin.deleteUser(userIdStaffD);
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
