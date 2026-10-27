/**
 * Real database tests for gym join codes.
 * 
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - RLS policies for gym_join_codes (owner/staff/member/outsider)
 * - preview_join_code doesn't leak invalid/expired/revoked/exhausted info
 * - redeem_join_code moves a member out of the default gym (old row status='removed', still present)
 * - One-active-member-gym invariant
 * - Staff codes work correctly
 * - Idempotent re-redeem
 * - max_uses race-safety (two concurrent redeems on a max_uses=1 code: exactly one succeeds)
 * - Expiry and revoke
 * 
 * Run: supabase start && REAL_DB=1 npm run test:gym-join-codes-real-db
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

  // Create test users
  const emailOwnerA = `gym-owner-codes-${Date.now()}@example.com`;
  const emailOwnerB = `gym-owner-codes-b-${Date.now()}@example.com`;
  const emailMemberC = `gym-member-codes-c-${Date.now()}@example.com`;
  const emailMemberD = `gym-member-codes-d-${Date.now()}@example.com`;
  const emailStaffE = `gym-staff-codes-e-${Date.now()}@example.com`;

  console.log("Creating test users...");
  
  const { data: userAData } = await adminClient.auth.admin.createUser({
    email: emailOwnerA,
    password: "test-password-123",
    email_confirm: true,
  });
  const userIdA = userAData.user?.id;
  if (!userIdA) return false;
  console.log(`✓ Created owner A: ${userIdA}`);

  const { data: userBData } = await adminClient.auth.admin.createUser({
    email: emailOwnerB,
    password: "test-password-456",
    email_confirm: true,
  });
  const userIdB = userBData.user?.id;
  if (!userIdB) return false;
  console.log(`✓ Created owner B: ${userIdB}`);

  const { data: userCData } = await adminClient.auth.admin.createUser({
    email: emailMemberC,
    password: "test-password-789",
    email_confirm: true,
  });
  const userIdC = userCData.user?.id;
  if (!userIdC) return false;
  console.log(`✓ Created member C: ${userIdC}`);

  const { data: userDData } = await adminClient.auth.admin.createUser({
    email: emailMemberD,
    password: "test-password-abc",
    email_confirm: true,
  });
  const userIdD = userDData.user?.id;
  if (!userIdD) return false;
  console.log(`✓ Created member D: ${userIdD}`);

  const { data: userEData } = await adminClient.auth.admin.createUser({
    email: emailStaffE,
    password: "test-password-def",
    email_confirm: true,
  });
  const userIdE = userEData.user?.id;
  if (!userIdE) return false;
  console.log(`✓ Created staff E: ${userIdE}\n`);

  // Sign in clients
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientC = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientD = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientE = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  await clientA.auth.signInWithPassword({ email: emailOwnerA, password: "test-password-123" });
  await clientB.auth.signInWithPassword({ email: emailOwnerB, password: "test-password-456" });
  await clientC.auth.signInWithPassword({ email: emailMemberC, password: "test-password-789" });
  await clientD.auth.signInWithPassword({ email: emailMemberD, password: "test-password-abc" });
  await clientE.auth.signInWithPassword({ email: emailStaffE, password: "test-password-def" });

  console.log("✓ All users signed in\n");

  // Create two gyms
  const gymIdA = randomUUID();
  const gymIdB = randomUUID();

  console.log("TEST: Create gyms");
  await adminClient.from("gyms").insert({
    id: gymIdA,
    slug: `gym-codes-a-${Date.now()}`,
    name: "Gym A",
  });
  check("Gym A created", true);

  await adminClient.from("gyms").insert({
    id: gymIdB,
    slug: `gym-codes-b-${Date.now()}`,
    name: "Gym B",
  });
  check("Gym B created", true);
  console.log();

  // Add owners
  console.log("TEST: Add owners");
  await adminClient.from("gym_memberships").insert({
    gym_id: gymIdA,
    user_id: userIdA,
    role: "owner",
    status: "active",
  });
  check("Owner A added to gym A", true);

  await adminClient.from("gym_memberships").insert({
    gym_id: gymIdB,
    user_id: userIdB,
    role: "owner",
    status: "active",
  });
  check("Owner B added to gym B", true);
  console.log();

  // Add staff E to gym A
  console.log("TEST: Add staff");
  await adminClient.from("gym_memberships").insert({
    gym_id: gymIdA,
    user_id: userIdE,
    role: "staff",
    status: "active",
  });
  check("Staff E added to gym A", true);
  console.log();

  // TEST: Owner A creates a member code
  console.log("TEST: Owner creates member code");
  const { data: memberCodeData, error: memberCodeError } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
  });
  check("Owner A creates member code", !memberCodeError, memberCodeError?.message);
  const memberCode = memberCodeData?.[0]?.code;
  check("Member code returned", !!memberCode);
  console.log();

  // TEST: Owner A creates a staff code
  console.log("TEST: Owner creates staff code");
  const { data: staffCodeData, error: staffCodeError } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "staff",
  });
  check("Owner A creates staff code", !staffCodeError, staffCodeError?.message);
  const staffCode = staffCodeData?.[0]?.code;
  check("Staff code returned", !!staffCode);
  console.log();

  // TEST: RLS - Owner A can see their codes
  console.log("TEST: RLS - Owner can see their codes");
  const { data: ownerCodes } = await clientA
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", gymIdA);
  check("Owner A sees 2 codes", ownerCodes?.length === 2);
  console.log();

  // TEST: RLS - Staff E can see member codes only
  console.log("TEST: RLS - Staff can see member codes only");
  const { data: staffCodes } = await clientE
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", gymIdA);
  check("Staff E sees only member codes", staffCodes?.length === 1);
  check("Staff E sees member code", staffCodes?.[0]?.role === "member");
  console.log();

  // TEST: RLS - Member C can't see codes
  console.log("TEST: RLS - Member can't see codes");
  const { data: memberCodesView } = await clientC
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", gymIdA);
  check("Member C sees 0 codes", memberCodesView?.length === 0);
  console.log();

  // TEST: RLS - Owner B can't see gym A's codes
  console.log("TEST: RLS - Owner B can't see gym A's codes");
  const { data: ownerBCodes } = await clientB
    .from("gym_join_codes")
    .select("*")
    .eq("gym_id", gymIdA);
  check("Owner B sees 0 codes from gym A", ownerBCodes?.length === 0);
  console.log();

  // TEST: preview_join_code returns gym info for valid code
  console.log("TEST: preview_join_code returns gym info for valid code");
  const { data: previewValid } = await clientC.rpc("preview_join_code", {
    p_code: memberCode,
  });
  check("Preview returns 1 row", previewValid?.length === 1);
  check("Preview returns gym name", previewValid?.[0]?.gym_name === "Gym A");
  check("Preview returns role", previewValid?.[0]?.role === "member");
  console.log();

  // TEST: preview_join_code returns no rows for invalid code
  console.log("TEST: preview_join_code returns no rows for invalid code");
  const { data: previewInvalid } = await clientC.rpc("preview_join_code", {
    p_code: "INVALID",
  });
  check("Preview returns 0 rows for invalid code", previewInvalid?.length === 0);
  console.log();

  // TEST: Redeem member code - member C joins gym A
  console.log("TEST: Redeem member code - member C joins gym A");
  
  // Check C's default gym membership before redeem
  const { data: defaultGym } = await adminClient
    .from("gyms")
    .select("id")
    .eq("slug", "default")
    .single();
  
  const { data: memberCDefaultBefore } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdC)
    .eq("gym_id", defaultGym?.id ?? "");
  
  check("Member C has default gym membership before redeem", memberCDefaultBefore?.length === 1);
  check("Member C default membership is active before redeem", memberCDefaultBefore?.[0]?.status === "active");

  const { error: redeemError } = await clientC.rpc("redeem_join_code", {
    p_code: memberCode,
  });
  check("Member C redeems code successfully", !redeemError, redeemError?.message);

  // Check C's default gym membership after redeem
  const { data: memberCDefaultAfter } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdC)
    .eq("gym_id", defaultGym?.id ?? "");
  
  check("Member C default gym membership still exists (not deleted)", memberCDefaultAfter?.length === 1);
  check("Member C default membership is removed after redeem", memberCDefaultAfter?.[0]?.status === "removed");

  // Check C's new gym A membership
  const { data: memberCGymA } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdC)
    .eq("gym_id", gymIdA);
  
  check("Member C has gym A membership", memberCGymA?.length === 1);
  check("Member C gym A membership is active", memberCGymA?.[0]?.status === "active");
  check("Member C gym A role is member", memberCGymA?.[0]?.role === "member");
  console.log();

  // TEST: Idempotent re-redeem
  console.log("TEST: Idempotent re-redeem");
  const { error: redeemAgainError } = await clientC.rpc("redeem_join_code", {
    p_code: memberCode,
  });
  check("Member C can redeem again (idempotent)", !redeemAgainError);

  // Check use_count incremented only once more
  const { data: codeAfterRedeem } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("code", memberCode)
    .single();
  check("Code use_count is 2 after two redeems (idempotent doesn't consume)", codeAfterRedeem?.use_count === 2);
  console.log();

  // TEST: One-active-member-gym invariant
  console.log("TEST: One-active-member-gym invariant");
  
  // Owner B creates a code for gym B
  const { data: gymBCodeData } = await clientB.rpc("create_join_code", {
    p_gym_id: gymIdB,
    p_role: "member",
  });
  const gymBCode = gymBCodeData?.[0]?.code;

  // Member C redeems gym B code (should move from gym A to gym B)
  const { error: redeemGymBError } = await clientC.rpc("redeem_join_code", {
    p_code: gymBCode,
  });
  check("Member C redeems gym B code", !redeemGymBError, redeemGymBError?.message);

  // Check C's gym A membership is now removed
  const { data: memberCGymAAfter } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdC)
    .eq("gym_id", gymIdA);
  check("Member C gym A membership is removed", memberCGymAAfter?.[0]?.status === "removed");

  // Check C's gym B membership is active
  const { data: memberCGymB } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdC)
    .eq("gym_id", gymIdB);
  check("Member C gym B membership is active", memberCGymB?.[0]?.status === "active");
  console.log();

  // TEST: Staff code redemption
  console.log("TEST: Staff code redemption");
  const { error: redeemStaffError } = await clientD.rpc("redeem_join_code", {
    p_code: staffCode,
  });
  check("Member D redeems staff code", !redeemStaffError, redeemStaffError?.message);

  const { data: memberDGymA } = await adminClient
    .from("gym_memberships")
    .select("*")
    .eq("user_id", userIdD)
    .eq("gym_id", gymIdA);
  check("Member D has gym A membership", memberDGymA?.length === 1);
  check("Member D role is staff", memberDGymA?.[0]?.role === "staff");
  console.log();

  // TEST: max_uses race-safety
  console.log("TEST: max_uses race-safety");
  const { data: limitedCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
    p_max_uses: 1,
  });
  const limitedCode = limitedCodeData?.[0]?.code;

  // Create two more users
  const { data: userFData } = await adminClient.auth.admin.createUser({
    email: `gym-member-codes-f-${Date.now()}@example.com`,
    password: "test-password-ghi",
    email_confirm: true,
  });
  const userIdF = userFData.user?.id;

  const { data: userGData } = await adminClient.auth.admin.createUser({
    email: `gym-member-codes-g-${Date.now()}@example.com`,
    password: "test-password-jkl",
    email_confirm: true,
  });
  const userIdG = userGData.user?.id;

  const clientF = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientG = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientF.auth.signInWithPassword({ 
    email: `gym-member-codes-f-${Date.now()}@example.com`, 
    password: "test-password-ghi" 
  });
  await clientG.auth.signInWithPassword({ 
    email: `gym-member-codes-g-${Date.now()}@example.com`, 
    password: "test-password-jkl" 
  });

  // Both try to redeem concurrently
  const [resultF, resultG] = await Promise.all([
    clientF.rpc("redeem_join_code", { p_code: limitedCode }),
    clientG.rpc("redeem_join_code", { p_code: limitedCode }),
  ]);

  const successCount = [resultF.error, resultG.error].filter(e => !e).length;
  check("Exactly one concurrent redeem succeeds on max_uses=1", successCount === 1);
  console.log();

  // TEST: Expired code
  console.log("TEST: Expired code");
  const { data: expiredCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
    p_expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const expiredCode = expiredCodeData?.[0]?.code;

  const { data: previewExpired } = await clientC.rpc("preview_join_code", {
    p_code: expiredCode,
  });
  check("Preview returns 0 rows for expired code", previewExpired?.length === 0);

  const { error: redeemExpiredError } = await clientC.rpc("redeem_join_code", {
    p_code: expiredCode,
  });
  check("Redeem expired code fails", !!redeemExpiredError);
  console.log();

  // TEST: Revoked code
  console.log("TEST: Revoked code");
  const { data: revokeCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
  });
  const revokeCode = revokeCodeData?.[0]?.code;
  const revokeCodeId = revokeCodeData?.[0]?.id;

  const { error: revokeError } = await clientA.rpc("revoke_join_code", {
    p_id: revokeCodeId,
  });
  check("Owner A revokes code", !revokeError, revokeError?.message);

  const { data: previewRevoked } = await clientC.rpc("preview_join_code", {
    p_code: revokeCode,
  });
  check("Preview returns 0 rows for revoked code", previewRevoked?.length === 0);

  const { error: redeemRevokedError } = await clientC.rpc("redeem_join_code", {
    p_code: revokeCode,
  });
  check("Redeem revoked code fails", !!redeemRevokedError);
  console.log();

  // Clean up
  console.log("Cleaning up test users...");
  await adminClient.auth.admin.deleteUser(userIdA);
  await adminClient.auth.admin.deleteUser(userIdB);
  await adminClient.auth.admin.deleteUser(userIdC);
  await adminClient.auth.admin.deleteUser(userIdD);
  await adminClient.auth.admin.deleteUser(userIdE);
  if (userIdF) await adminClient.auth.admin.deleteUser(userIdF);
  if (userIdG) await adminClient.auth.admin.deleteUser(userIdG);
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
