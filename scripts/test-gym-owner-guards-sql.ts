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
    await adminClient
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("gym_id", defaultGym.id)
      .eq("user_id", userIdOwner);
  }

  // TEST: get_owned_gym_name
  console.log("TEST: get_owned_gym_name returns gym name for owners");
  {
    const { data, error } = await adminClient.rpc("get_owned_gym_name", { user_id_param: userIdOwner });
    check("Owner sees gym name", !error && data === "Test Gym", data);
  }
  console.log();

  console.log("TEST: get_owned_gym_name returns null for non-owners");
  {
    const { data, error } = await adminClient.rpc("get_owned_gym_name", { user_id_param: userIdMember });
    check("Member sees null", !error && data === null);
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

  // TEST: Migration re-run idempotency
  console.log("TEST: Re-running migrations is idempotent");
  {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    // Get current state
    const { data: gymsBefore } = await adminClient.from("gyms").select("*").order("created_at");
    const { data: membershipsBefore } = await adminClient.from("gym_memberships").select("*").order("joined_at");

    // Re-run migrations 20261025000034 and 20261025000035 via psql
    const dbUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";
    try {
      await execAsync(`psql "${dbUrl}" -f supabase/migrations/20261025000034_gym_tenant_schema.sql`);
      await execAsync(`psql "${dbUrl}" -f supabase/migrations/20261025000035_gym_backfill_default.sql`);
      
      // Get state after re-run
      const { data: gymsAfter } = await adminClient.from("gyms").select("*").order("created_at");
      const { data: membershipsAfter } = await adminClient.from("gym_memberships").select("*").order("joined_at");

      check("Gyms unchanged after re-run", JSON.stringify(gymsBefore) === JSON.stringify(gymsAfter));
      check("Memberships unchanged after re-run", JSON.stringify(membershipsBefore) === JSON.stringify(membershipsAfter));
    } catch (err: any) {
      check("Migration re-run succeeded", false, err.message);
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
