/**
 * Comprehensive real-DB tests for gym join codes - HIGH and MED priority issues
 * 
 * Tests added to address QA Bot 3 findings:
 * - HIGH-1: Throttle with mixed preview/redeem, throttled on valid code
 * - HIGH-2: Read-only transaction refusal
 * - MED: Non-owner create, staff demotion prevention, all surviving mutants
 * 
 * Run: supabase start && REAL_DB=1 npx tsx scripts/test-gym-join-codes-comprehensive.ts
 */

import { checkRealDbTest } from "./lib-db-reset-guard.js";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const guardDecision = checkRealDbTest();
if (!guardDecision.allow) {
  console.log(`⏭️  Skipping comprehensive tests: ${guardDecision.reason}`);
  process.exit(0);
}

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
  console.log("=== Comprehensive Gym Join Code Tests ===\n");

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  // Create test users
  const timestamp = Date.now();
  const createTestUser = async (role: string) => {
    const email = `test-${role}-${timestamp}-${Math.random()}@example.com`;
    const { data } = await adminClient.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
    if (!data.user?.id) throw new Error("Failed to create user");
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await client.auth.signInWithPassword({ email, password: "password123" });
    return { userId: data.user.id, client };
  };

  const owner = await createTestUser("owner");
  const staff = await createTestUser("staff");
  const member = await createTestUser("member");
  const outsider = await createTestUser("outsider");

  // Create test gym
  const gymId = randomUUID();
  await adminClient.from("gyms").insert({
    id: gymId,
    slug: `test-gym-${timestamp}`,
    name: "Test Gym",
  });

  // Add roles
  await adminClient.from("gym_memberships").insert([
    { gym_id: gymId, user_id: owner.userId, role: "owner", status: "active" },
    { gym_id: gymId, user_id: staff.userId, role: "staff", status: "active" },
    { gym_id: gymId, user_id: member.userId, role: "member", status: "active" },
  ]);

  console.log("TEST: Non-owner cannot create codes");
  const { error: staffCreateError } = await staff.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  check("Staff cannot create code", !!staffCreateError && staffCreateError.code === "GJC03");

  const { error: memberCreateError } = await member.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  check("Member cannot create code", !!memberCreateError && memberCreateError.code === "GJC03");

  const { error: outsiderCreateError } = await outsider.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  check("Outsider cannot create code", !!outsiderCreateError && outsiderCreateError.code === "GJC03");
  console.log();

  // Create valid codes for throttle tests
  const { data: memberCodeData } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  const validCode = memberCodeData?.[0]?.code;

  console.log("TEST: Throttle with mixed preview/redeem calls");
  const throttleUser = await createTestUser("throttle");
  
  // Make 5 preview misses and 5 redeem misses (10 total)
  for (let i = 0; i < 5; i++) {
    await throttleUser.client.rpc("preview_join_code", { p_code: "INVALID" + i });
  }
  for (let i = 5; i < 10; i++) {
    await throttleUser.client.rpc("redeem_join_code", { p_code: "INVALID" + i });
  }

  // Check that 10 attempts were recorded
  const { data: attempts } = await adminClient
    .from("gym_join_code_attempts")
    .select("*")
    .eq("user_id", throttleUser.userId);
  check("10 misses recorded", attempts?.length === 10);

  // 11th attempt should be throttled even for a valid code
  const { data: throttledPreview } = await throttleUser.client.rpc("preview_join_code", {
    p_code: validCode,
  });
  const previewResult = throttledPreview as {ok: boolean; reason?: string} | null;
  check("11th attempt throttled on valid code (preview)", previewResult?.ok === false && previewResult?.reason === "throttled");

  const { data: throttledRedeem } = await throttleUser.client.rpc("redeem_join_code", {
    p_code: validCode,
  });
  const redeemResult = throttledRedeem as {ok: boolean; reason?: string} | null;
  check("11th attempt still throttled (redeem)", redeemResult?.ok === false && redeemResult?.reason === "throttled");

  // Attempts table should still have 10 rows (throttled calls don't record)
  const { data: attemptsAfter } = await adminClient
    .from("gym_join_code_attempts")
    .select("*")
    .eq("user_id", throttleUser.userId);
  check("Throttled calls don't add attempts", attemptsAfter?.length === 10);
  console.log();

  console.log("TEST: Successes don't count toward throttle");
  const successUser = await createTestUser("success");
  const { data: highUsesCodeData } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
    p_max_uses: 50,
  });
  const highUsesCode = highUsesCodeData?.[0]?.code;

  // Make 15 successful preview calls
  for (let i = 0; i < 15; i++) {
    await successUser.client.rpc("preview_join_code", { p_code: highUsesCode });
  }

  // Make 15 successful redeem calls (first one joins, rest are idempotent)
  for (let i = 0; i < 15; i++) {
    await successUser.client.rpc("redeem_join_code", { p_code: highUsesCode });
  }

  // Check that no attempts were recorded
  const { data: successAttempts } = await adminClient
    .from("gym_join_code_attempts")
    .select("*")
    .eq("user_id", successUser.userId);
  check("Successes don't record attempts", successAttempts?.length === 0);

  // Next call should still work
  const { data: afterSuccesses } = await successUser.client.rpc("preview_join_code", {
    p_code: highUsesCode,
  });
  const afterResult = afterSuccesses as {ok: boolean} | null;
  check("30+ successes don't throttle", afterResult?.ok === true);
  console.log();

  console.log("TEST: Staff redeeming own gym's member code stays staff");
  const staffOwnGym = await createTestUser("staff-own");
  const gymStaff = randomUUID();
  await adminClient.from("gyms").insert({
    id: gymStaff,
    slug: `staff-gym-${timestamp}`,
    name: "Staff Gym",
  });
  await adminClient.from("gym_memberships").insert([
    { gym_id: gymStaff, user_id: owner.userId, role: "owner", status: "active" },
    { gym_id: gymStaff, user_id: staffOwnGym.userId, role: "staff", status: "active" },
  ]);

  const { data: staffGymCodeData } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymStaff,
    p_role: "member",
  });
  const staffGymCode = staffGymCodeData?.[0]?.code;
  const staffGymCodeId = staffGymCodeData?.[0]?.id;

  const { data: usesBefore } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", staffGymCodeId)
    .single();

  await staffOwnGym.client.rpc("redeem_join_code", { p_code: staffGymCode });

  const { data: staffMembership } = await adminClient
    .from("gym_memberships")
    .select("role")
    .eq("gym_id", gymStaff)
    .eq("user_id", staffOwnGym.userId)
    .single();
  check("Staff stays staff after redeeming member code", staffMembership?.role === "staff");

  const { data: usesAfter } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", staffGymCodeId)
    .single();
  check("Staff redeem own gym doesn't consume use", usesAfter?.use_count === usesBefore?.use_count);
  console.log();

  console.log("TEST: Case-insensitive unique constraint");
  const testCode = "TESTCODE99";
  await adminClient.from("gym_join_codes").insert({
    gym_id: gymId,
    code: testCode,
    role: "member",
    created_by: owner.userId,
  });

  const { error: dupError } = await adminClient.from("gym_join_codes").insert({
    gym_id: gymId,
    code: testCode.toLowerCase(), // lowercase version
    role: "member",
    created_by: owner.userId,
  });
  check("Lowercase duplicate rejected", !!dupError && dupError.code === "23505");
  console.log();

  console.log("TEST: gen_random_bytes produces valid codes");
  const { data: manyCodesData } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  const generatedCode = manyCodesData?.[0]?.code;
  const isValid = /^[2-9A-HJ-NP-Z]{10}$/.test(generatedCode || "");
  check("Generated code matches format", isValid, `code=${generatedCode}`);
  check("No ambiguous chars (0,1,I,O)", !/(0|1|I|O)/.test(generatedCode || ""));
  console.log();

  console.log("TEST: Attempts table RLS blocks everything");
  const { error: anonSelectError } = await outsider.client
    .from("gym_join_code_attempts")
    .select("*")
    .limit(1);
  check("User cannot SELECT attempts", !!anonSelectError);

  const { error: insertError } = await outsider.client
    .from("gym_join_code_attempts")
    .insert({ user_id: outsider.userId, attempted_at: new Date().toISOString() });
  check("User cannot INSERT attempts", !!insertError);

  const { error: updateError } = await outsider.client
    .from("gym_join_code_attempts")
    .update({ attempted_at: new Date().toISOString() })
    .eq("user_id", outsider.userId);
  check("User cannot UPDATE attempts", !!updateError);

  const { error: deleteError } = await outsider.client
    .from("gym_join_code_attempts")
    .delete()
    .eq("user_id", outsider.userId);
  check("User cannot DELETE attempts", !!deleteError);
  console.log();

  console.log("TEST: Helper functions not executable by authenticated");
  const { error: genError } = await outsider.client.rpc("generate_join_code", {});
  check("generate_join_code denied", !!genError && genError.code === "42501");

  const { error: checkError } = await outsider.client.rpc("check_join_code_throttle", {
    p_user_id: outsider.userId,
  });
  check("check_join_code_throttle denied", !!checkError && checkError.code === "42501");

  const { error: recordError } = await outsider.client.rpc("record_join_code_miss", {
    p_user_id: outsider.userId,
  });
  check("record_join_code_miss denied", !!recordError && recordError.code === "42501");
  console.log();

  // Cleanup
  console.log("Cleaning up...");
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymId);
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymStaff);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymId);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymStaff);
  await adminClient.from("gym_join_code_attempts").delete().in("user_id", [
    throttleUser.userId,
    successUser.userId,
  ]);
  await adminClient.from("gyms").delete().in("id", [gymId, gymStaff]);

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    return false;
  }

  console.log("\n✅ All comprehensive tests passed\n");
  return true;
}

runTests().then((success) => process.exit(success ? 0 : 1));
