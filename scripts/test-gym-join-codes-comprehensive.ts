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

// Skip unless REAL_DB=1
if (process.env.REAL_DB !== "1") {
  console.log("\n⏭️  Skipping comprehensive tests (REAL_DB=1 not set)");
  console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
  process.exit(0);
}

import { checkRealDbTest } from "./lib-db-reset-guard.js";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { parsePreviewJoinCodeResult, parseRedeemJoinCodeResult, parseCreateJoinCodeResult } from "../src/lib/gym-join-code-types.js";
import { Client } from "pg";

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
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let failures = 0;
function check(label: string, ok: boolean, detail = "", actual?: unknown) {
  if (!ok) {
    failures++;
    const actualStr = actual !== undefined ? ` -- got: ${JSON.stringify(actual)}` : detail ? `  -- ${detail}` : "";
    console.log(`  FAIL ${label}${actualStr}`);
  } else {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  }
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
  const { error: gymError } = await adminClient.from("gyms").insert({
    id: gymId,
    slug: `test-gym-${timestamp}`,
    name: "Test Gym",
  });
  if (gymError) throw new Error(`Failed to insert test gym: ${gymError.message}`);

  // Add roles
  // Note: The member user is already active in the default gym (signup trigger),
  // so we must deactivate that first to satisfy the one_active_member_per_user constraint
  const { data: defaultGym } = await adminClient
    .from("gyms")
    .select("id")
    .eq("slug", "default")
    .single();
  
  if (defaultGym) {
    const { error: deactivateError } = await adminClient
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("user_id", member.userId)
      .eq("gym_id", defaultGym.id);
    if (deactivateError) {
      throw new Error(`Failed to deactivate default gym membership: ${deactivateError.message}`);
    }
  }

  // Insert memberships separately with error checking
  const { error: ownerInsertError } = await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: owner.userId,
    role: "owner",
    status: "active",
  });
  if (ownerInsertError) {
    throw new Error(`Failed to insert owner membership: ${ownerInsertError.message}`);
  }

  const { error: staffInsertError } = await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: staff.userId,
    role: "staff",
    status: "active",
  });
  if (staffInsertError) {
    throw new Error(`Failed to insert staff membership: ${staffInsertError.message}`);
  }

  const { error: memberInsertError } = await adminClient.from("gym_memberships").insert({
    gym_id: gymId,
    user_id: member.userId,
    role: "member",
    status: "active",
  });
  if (memberInsertError) {
    throw new Error(`Failed to insert member membership: ${memberInsertError.message}`);
  }

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
  const { data: memberCodeData, error: memberCodeError } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  if (memberCodeError) {
    console.error("Failed to create member code:", memberCodeError);
    throw new Error(`Failed to create member code: ${memberCodeError.message}`);
  }
  const memberCodeParsed = parseCreateJoinCodeResult(memberCodeData);
  if (!memberCodeParsed) {
    console.error("Failed to parse member code result. Raw data:", memberCodeData);
    throw new Error(`Failed to parse member code result. Raw data: ${JSON.stringify(memberCodeData)}`);
  }
  const validCode = memberCodeParsed.code;

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
  const previewResult = parsePreviewJoinCodeResult(throttledPreview);
  check("11th attempt throttled on valid code (preview)", 
    previewResult !== null && previewResult.ok === false && previewResult.reason === "throttled");

  const { data: throttledRedeem } = await throttleUser.client.rpc("redeem_join_code", {
    p_code: validCode,
  });
  const redeemResult = parseRedeemJoinCodeResult(throttledRedeem);
  check("11th attempt still throttled (redeem)", 
    redeemResult !== null && redeemResult.ok === false && redeemResult.reason === "throttled");

  // Attempts table should still have 10 rows (throttled calls don't record)
  const { data: attemptsAfter } = await adminClient
    .from("gym_join_code_attempts")
    .select("*")
    .eq("user_id", throttleUser.userId);
  check("Throttled calls don't add attempts", attemptsAfter?.length === 10);
  console.log();

  console.log("TEST: Successes don't count toward throttle");
  const successUser = await createTestUser("success");
  const { data: highUsesCodeData, error: highUsesCodeError } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
    p_max_uses: 50,
  });
  if (highUsesCodeError) {
    console.error("Failed to create high-uses code:", highUsesCodeError);
    throw new Error(`Failed to create high-uses code: ${highUsesCodeError.message}`);
  }
  const highUsesCodeParsed = parseCreateJoinCodeResult(highUsesCodeData);
  if (!highUsesCodeParsed) {
    console.error("Failed to parse high-uses code result. Raw data:", highUsesCodeData);
    throw new Error(`Failed to parse high-uses code result. Raw data: ${JSON.stringify(highUsesCodeData)}`);
  }
  const highUsesCode = highUsesCodeParsed.code;

  // Make 15 successful preview calls
  for (let i = 0; i < 15; i++) {
    await successUser.client.rpc("preview_join_code", { p_code: highUsesCode });
  }

  // Make 15 successful redeem calls (first one joins, rest are idempotent)
  for (let i = 0; i < 15; i++) {
    const { data: redeemData } = await successUser.client.rpc("redeem_join_code", { p_code: highUsesCode });
    if (i === 0) {
      // First redeem: success should return gym_name
      const parsed = parseRedeemJoinCodeResult(redeemData);
      check("Success redeem returns gym_name", !!parsed && parsed.ok && parsed.gym_name === "Test Gym");
    }
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
  const afterResult = parsePreviewJoinCodeResult(afterSuccesses);
  check("30+ successes don't throttle", afterResult !== null && afterResult.ok === true);
  console.log();

  // L1: Member cannot see own gym's codes
  {
    const { data: memberCodes } = await member.client
      .from("gym_join_codes")
      .select("id")
      .eq("gym_id", gymId);
    check("Member cannot see own gym's codes", memberCodes?.length === 0);
  }

  // L1: Outsider cannot see other gym's codes
  {
    const { data: outsiderCodes } = await outsider.client
      .from("gym_join_codes")
      .select("id")
      .eq("gym_id", gymId);
    check("Outsider cannot see other gym's codes", outsiderCodes?.length === 0);
  }

  // L1: Staff sees only member codes (comprehensive)
  // Create a staff code first
  const staffCodeId = randomUUID();
  await adminClient.from("gym_join_codes").insert({
    id: staffCodeId,
    gym_id: gymId,
    code: "STAFF" + generateJoinCode().slice(5),
    role: "staff",
    created_by: owner.userId,
  });
  {
    const { data: staffVisible } = await staff.client
      .from("gym_join_codes")
      .select("id, role")
      .eq("gym_id", gymId);
    const allMember = staffVisible?.every(c => c.role === "member") ?? false;
    const staffCodeAbsent = !staffVisible?.some(c => c.id === staffCodeId) ?? false;
    check("Staff sees only member codes (comprehensive)", allMember && staffCodeAbsent);
  }

  // L1: Owner sees staff codes
  {
    const { data: ownerVisible } = await owner.client
      .from("gym_join_codes")
      .select("id")
      .eq("gym_id", gymId);
    const seesStaffCode = ownerVisible?.some(c => c.id === staffCodeId) ?? false;
    check("Owner sees staff codes", seesStaffCode);
  }

  console.log();

  console.log("TEST: Staff redeeming own gym's member code stays staff");
  const staffOwnGym = await createTestUser("staff-own");
  const gymStaff = randomUUID();
  const { error: staffGymError } = await adminClient.from("gyms").insert({
    id: gymStaff,
    slug: `staff-gym-${timestamp}`,
    name: "Staff Gym",
  });
  if (staffGymError) throw new Error(`Failed to insert staff gym: ${staffGymError.message}`);
  const { error: staffMembershipsError } = await adminClient.from("gym_memberships").insert([
    { gym_id: gymStaff, user_id: owner.userId, role: "owner", status: "active" },
    { gym_id: gymStaff, user_id: staffOwnGym.userId, role: "staff", status: "active" },
  ]);
  if (staffMembershipsError) throw new Error(`Failed to insert staff memberships: ${staffMembershipsError.message}`);

  const { data: staffGymCodeData, error: staffGymCodeError } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymStaff,
    p_role: "member",
  });
  if (staffGymCodeError) {
    console.error("Failed to create staff gym code:", staffGymCodeError);
    throw new Error(`Failed to create staff gym code: ${staffGymCodeError.message}`);
  }
  const staffGymCodeParsed = parseCreateJoinCodeResult(staffGymCodeData);
  if (!staffGymCodeParsed) {
    console.error("Failed to parse staff gym code result. Raw data:", staffGymCodeData);
    throw new Error(`Failed to parse staff gym code result. Raw data: ${JSON.stringify(staffGymCodeData)}`);
  }
  const staffGymCode = staffGymCodeParsed.code;
  const staffGymCodeId = staffGymCodeParsed.id;

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
  check("Staff redeem own gym doesn't consume use", 
    usesBefore !== null && usesAfter !== null && usesAfter.use_count === usesBefore.use_count,
    "", !usesBefore || !usesAfter ? "Failed to read use_count" : undefined);
  console.log();

  console.log("TEST: Own-gym redeem rules");
  
  // Create a fresh gym for these tests
  const ownGymTest = randomUUID();
  const ownerOwnGym = await createTestUser("owner-owngym");
  const staffOwnGym2 = await createTestUser("staff-owngym2");
  const memberOwnGym = await createTestUser("member-owngym");
  
  const { error: ownGymError } = await adminClient.from("gyms").insert({
    id: ownGymTest,
    slug: `owngym-test-${timestamp}`,
    name: "Own Gym Test",
  });
  if (ownGymError) throw new Error(`Failed to insert own gym test: ${ownGymError.message}`);
  
  // Deactivate default memberships for staff and member
  if (defaultGym) {
    await adminClient
      .from("gym_memberships")
      .update({ status: "removed" })
      .in("user_id", [staffOwnGym2.userId, memberOwnGym.userId])
      .eq("gym_id", defaultGym.id);
  }
  
  const { error: ownGymOwnerErr } = await adminClient.from("gym_memberships").insert({
    gym_id: ownGymTest,
    user_id: ownerOwnGym.userId,
    role: "owner",
    status: "active",
  });
  if (ownGymOwnerErr) throw new Error(`Failed to insert owner: ${ownGymOwnerErr.message}`);
  
  const { error: ownGymStaffErr } = await adminClient.from("gym_memberships").insert({
    gym_id: ownGymTest,
    user_id: staffOwnGym2.userId,
    role: "staff",
    status: "active",
  });
  if (ownGymStaffErr) throw new Error(`Failed to insert staff: ${ownGymStaffErr.message}`);
  
  const { error: ownGymMemberErr } = await adminClient.from("gym_memberships").insert({
    gym_id: ownGymTest,
    user_id: memberOwnGym.userId,
    role: "member",
    status: "active",
  });
  if (ownGymMemberErr) throw new Error(`Failed to insert member: ${ownGymMemberErr.message}`);
  
  // Test 1: Owner redeeming their own gym's member code
  const { data: ownerMemberCodeData } = await ownerOwnGym.client.rpc("create_join_code", {
    p_gym_id: ownGymTest,
    p_role: "member",
  });
  const ownerMemberCodeParsed = parseCreateJoinCodeResult(ownerMemberCodeData);
  if (!ownerMemberCodeParsed) throw new Error("Failed to create owner member code");
  
  const { data: ownerMemberCodeId } = await adminClient
    .from("gym_join_codes")
    .select("id, use_count")
    .eq("code", ownerMemberCodeParsed.code)
    .single();
  
  const { data: ownerRedeemMember } = await ownerOwnGym.client.rpc("redeem_join_code", {
    p_code: ownerMemberCodeParsed.code,
  });
  const ownerRedeemMemberResult = parseRedeemJoinCodeResult(ownerRedeemMember);
  check("Owner redeeming own gym member code returns already_member",
    ownerRedeemMemberResult !== null && ownerRedeemMemberResult.ok === false && ownerRedeemMemberResult.reason === "already_member");
  
  const { data: ownerMemberUseCount } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", ownerMemberCodeId?.id)
    .single();
  check("Owner redeem own gym doesn't consume use", 
    ownerMemberCodeId !== null && ownerMemberUseCount !== null && ownerMemberUseCount.use_count === ownerMemberCodeId.use_count,
    "", !ownerMemberCodeId || !ownerMemberUseCount ? "Failed to read use_count" : undefined);
  
  const { data: ownerRoleAfter } = await adminClient
    .from("gym_memberships")
    .select("role")
    .eq("gym_id", ownGymTest)
    .eq("user_id", ownerOwnGym.userId)
    .single();
  check("Owner role unchanged", ownerRoleAfter?.role === "owner");
  
  // Test 2: Owner redeeming their own gym's staff code
  const { data: ownerStaffCodeData } = await ownerOwnGym.client.rpc("create_join_code", {
    p_gym_id: ownGymTest,
    p_role: "staff",
  });
  const ownerStaffCodeParsed = parseCreateJoinCodeResult(ownerStaffCodeData);
  if (!ownerStaffCodeParsed) throw new Error("Failed to create owner staff code");
  
  const { data: ownerStaffCodeId } = await adminClient
    .from("gym_join_codes")
    .select("id, use_count")
    .eq("code", ownerStaffCodeParsed.code)
    .single();
  
  const { data: ownerRedeemStaff } = await ownerOwnGym.client.rpc("redeem_join_code", {
    p_code: ownerStaffCodeParsed.code,
  });
  const ownerRedeemStaffResult = parseRedeemJoinCodeResult(ownerRedeemStaff);
  check("Owner redeeming own gym staff code returns already_member",
    ownerRedeemStaffResult !== null && ownerRedeemStaffResult.ok === false && ownerRedeemStaffResult.reason === "already_member");
  
  const { data: ownerStaffUseCount } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", ownerStaffCodeId?.id)
    .single();
  check("Owner redeem own staff code doesn't consume use", 
    ownerStaffCodeId !== null && ownerStaffUseCount !== null && ownerStaffUseCount.use_count === ownerStaffCodeId.use_count,
    "", !ownerStaffCodeId || !ownerStaffUseCount ? "Failed to read use_count" : undefined);
  
  // Test 3: Staff redeeming their own gym's staff code with max_uses=1
  const { data: staffStaffCodeData } = await ownerOwnGym.client.rpc("create_join_code", {
    p_gym_id: ownGymTest,
    p_role: "staff",
    p_max_uses: 1,
  });
  const staffStaffCodeParsed = parseCreateJoinCodeResult(staffStaffCodeData);
  if (!staffStaffCodeParsed) throw new Error("Failed to create staff staff code");
  
  const { data: staffStaffCodeBefore } = await adminClient
    .from("gym_join_codes")
    .select("id, use_count")
    .eq("code", staffStaffCodeParsed.code)
    .single();
  
  const { data: staffRedeemStaff } = await staffOwnGym2.client.rpc("redeem_join_code", {
    p_code: staffStaffCodeParsed.code,
  });
  const staffRedeemStaffResult = parseRedeemJoinCodeResult(staffRedeemStaff);
  check("Staff redeeming own gym staff code returns already_member",
    staffRedeemStaffResult !== null && staffRedeemStaffResult.ok === false && staffRedeemStaffResult.reason === "already_member");
  
  const { data: staffStaffCodeAfter } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", staffStaffCodeBefore?.id)
    .single();
  check("Staff redeem own staff code doesn't consume use (max_uses=1)", 
    staffStaffCodeBefore !== null && staffStaffCodeAfter !== null && staffStaffCodeAfter.use_count === staffStaffCodeBefore.use_count,
    "", !staffStaffCodeBefore || !staffStaffCodeAfter ? "Failed to read use_count" : undefined);
  
  // Real invitee can still redeem
  const realInvitee = await createTestUser("real-invitee");
  if (defaultGym) {
    await adminClient
      .from("gym_memberships")
      .update({ status: "removed" })
      .eq("user_id", realInvitee.userId)
      .eq("gym_id", defaultGym.id);
  }
  
  const { data: realInviteeRedeem } = await realInvitee.client.rpc("redeem_join_code", {
    p_code: staffStaffCodeParsed.code,
  });
  const realInviteeResult = parseRedeemJoinCodeResult(realInviteeRedeem);
  check("Real invitee can still redeem after staff no-op", realInviteeResult !== null && realInviteeResult.ok === true);
  
  // Test 4: Member redeeming their own gym's staff code (upgrade path)
  const { data: memberStaffCodeData } = await ownerOwnGym.client.rpc("create_join_code", {
    p_gym_id: ownGymTest,
    p_role: "staff",
  });
  const memberStaffCodeParsed = parseCreateJoinCodeResult(memberStaffCodeData);
  if (!memberStaffCodeParsed) throw new Error("Failed to create member staff code");
  
  const { data: memberStaffCodeBefore } = await adminClient
    .from("gym_join_codes")
    .select("id, use_count")
    .eq("code", memberStaffCodeParsed.code)
    .single();
  
  const { data: memberRedeemStaff } = await memberOwnGym.client.rpc("redeem_join_code", {
    p_code: memberStaffCodeParsed.code,
  });
  const memberRedeemStaffResult = parseRedeemJoinCodeResult(memberRedeemStaff);
  check("Member redeeming own gym staff code succeeds (upgrade)", memberRedeemStaffResult !== null && memberRedeemStaffResult.ok === true);
  
  const { data: memberRoleAfter } = await adminClient
    .from("gym_memberships")
    .select("role")
    .eq("gym_id", ownGymTest)
    .eq("user_id", memberOwnGym.userId)
    .single();
  check("Member upgraded to staff", memberRoleAfter?.role === "staff");
  
  const { data: memberStaffCodeAfterUpgrade } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", memberStaffCodeBefore?.id)
    .single();
  check("Member upgrade consumes one use", 
    memberStaffCodeBefore !== null && memberStaffCodeAfterUpgrade !== null && memberStaffCodeAfterUpgrade.use_count === memberStaffCodeBefore.use_count + 1,
    "", !memberStaffCodeBefore || !memberStaffCodeAfterUpgrade ? "Failed to read use_count" : undefined);
  
  // Now redeem again as staff (should be no-op)
  const { data: memberRedeemStaffAgain } = await memberOwnGym.client.rpc("redeem_join_code", {
    p_code: memberStaffCodeParsed.code,
  });
  const memberRedeemStaffAgainResult = parseRedeemJoinCodeResult(memberRedeemStaffAgain);
  check("Member (now staff) redeeming same code returns already_member",
    memberRedeemStaffAgainResult !== null && memberRedeemStaffAgainResult.ok === false && memberRedeemStaffAgainResult.reason === "already_member");
  
  const { data: memberStaffCodeAfterSecond } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", memberStaffCodeBefore?.id)
    .single();
  check("Second redeem (as staff) doesn't consume use", 
    memberStaffCodeAfterUpgrade !== null && memberStaffCodeAfterSecond !== null && memberStaffCodeAfterSecond.use_count === memberStaffCodeAfterUpgrade.use_count,
    "", !memberStaffCodeAfterUpgrade || !memberStaffCodeAfterSecond ? "Failed to read use_count" : undefined);
  
  // Test 5: No attempts recorded for any own-gym redeems
  const { data: ownGymAttempts } = await adminClient
    .from("gym_join_code_attempts")
    .select("*")
    .in("user_id", [ownerOwnGym.userId, staffOwnGym2.userId, memberOwnGym.userId]);
  check("No attempts recorded for own-gym redeems", ownGymAttempts?.length === 0);
  console.log();

  console.log("TEST: Case-insensitive unique constraint");
  const testCode = "TSTCDE2345"; // Valid format: no 0, 1, I, O
  const { error: firstInsertError } = await adminClient.from("gym_join_codes").insert({
    gym_id: gymId,
    code: testCode,
    role: "member",
    created_by: owner.userId,
  });
  if (firstInsertError) {
    throw new Error(`Failed to insert test code: ${firstInsertError.message}`);
  }

  // Exact duplicate should hit unique index (23505)
  const { error: exactDupError } = await adminClient.from("gym_join_codes").insert({
    gym_id: gymId,
    code: testCode,
    role: "member",
    created_by: owner.userId,
  });
  check("Exact duplicate rejected (23505)", !!exactDupError && exactDupError.code === "23505");

  // Lowercase version should also hit unique index (or CHECK if invalid, accept both)
  const { error: dupError } = await adminClient.from("gym_join_codes").insert({
    gym_id: gymId,
    code: testCode.toLowerCase(),
    role: "member",
    created_by: owner.userId,
  });
  check("Lowercase duplicate rejected", !!dupError && (dupError.code === "23505" || dupError.code === "23514"));
  console.log();

  console.log("TEST: gen_random_bytes produces valid codes");
  const { data: manyCodesData, error: manyCodesError } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  if (manyCodesError) {
    console.error("Failed to create test code:", manyCodesError);
    throw new Error(`Failed to create test code: ${manyCodesError.message}`);
  }
  const manyCodesParsed = parseCreateJoinCodeResult(manyCodesData);
  if (!manyCodesParsed) {
    console.error("Failed to parse test code result. Raw data:", manyCodesData);
    throw new Error(`Failed to parse test code result. Raw data: ${JSON.stringify(manyCodesData)}`);
  }
  const generatedCode = manyCodesParsed.code;
  const isValid = /^[2-9A-HJ-NP-Z]{10}$/.test(generatedCode);
  check("Generated code matches format", isValid, `code=${generatedCode}`);
  check("No ambiguous chars (0,1,I,O)", !/(0|1|I|O)/.test(generatedCode));
  console.log();

  console.log("TEST: Attempts table RLS blocks everything");
  // With RLS enabled but no SELECT policy: returns 0 rows, no error
  const { data: selectData, error: selectError } = await outsider.client
    .from("gym_join_code_attempts")
    .select("*")
    .limit(1);
  check("User cannot SELECT attempts (returns 0 rows)", !selectError && selectData?.length === 0);

  // With no INSERT policy: raises error
  const { error: insertError } = await outsider.client
    .from("gym_join_code_attempts")
    .insert({ user_id: outsider.userId, attempted_at: new Date().toISOString() });
  check("User cannot INSERT attempts", !!insertError);

  // With no UPDATE policy: matches 0 rows, no error (we need to verify row is unchanged)
  const testAttemptId = randomUUID();
  await adminClient.from("gym_join_code_attempts").insert({
    id: testAttemptId,
    user_id: outsider.userId,
    attempted_at: new Date().toISOString(),
  });
  
  const { data: beforeUpdate } = await adminClient
    .from("gym_join_code_attempts")
    .select("attempted_at")
    .eq("id", testAttemptId)
    .single();
  
  const newTime = new Date(Date.now() + 86400000).toISOString();
  const { data: updateResult, error: updateError } = await outsider.client
    .from("gym_join_code_attempts")
    .update({ attempted_at: newTime })
    .eq("id", testAttemptId)
    .select();
  check("User UPDATE matches 0 rows (no error)", !updateError && (!updateResult || updateResult.length === 0));
  
  const { data: afterUpdate } = await adminClient
    .from("gym_join_code_attempts")
    .select("attempted_at")
    .eq("id", testAttemptId)
    .single();
  check("Row unchanged after UPDATE", afterUpdate?.attempted_at === beforeUpdate?.attempted_at);

  // With no DELETE policy: matches 0 rows, no error (we need to verify row still exists)
  const { data: deleteResult, error: deleteError } = await outsider.client
    .from("gym_join_code_attempts")
    .delete()
    .eq("id", testAttemptId)
    .select();
  check("User DELETE matches 0 rows (no error)", !deleteError && (!deleteResult || deleteResult.length === 0));
  
  const { data: afterDelete } = await adminClient
    .from("gym_join_code_attempts")
    .select("id")
    .eq("id", testAttemptId);
  check("Row still exists after DELETE", afterDelete?.length === 1);
  
  // Cleanup test row
  await adminClient.from("gym_join_code_attempts").delete().eq("id", testAttemptId);
  console.log();

  console.log("TEST: Read-only transaction refusal (GET)");
  // Create a valid code and an invalid one for testing
  const { data: getTestCodeData } = await owner.client.rpc("create_join_code", {
    p_gym_id: gymId,
    p_role: "member",
  });
  const getTestCodeParsed = parseCreateJoinCodeResult(getTestCodeData);
  if (!getTestCodeParsed) throw new Error("Failed to create GET test code");
  const getTestCode = getTestCodeParsed.code;
  
  // Preview with {get:true} should be refused for both hit and miss
  const { error: previewGetHitError } = await outsider.client.rpc("preview_join_code", {
    p_code: getTestCode,
  }, { get: true });
  check("Preview GET with valid code refused (GJC11)", !!previewGetHitError && previewGetHitError.code === "GJC11");
  
  const { error: previewGetMissError } = await outsider.client.rpc("preview_join_code", {
    p_code: "INVALIDGET",
  }, { get: true });
  check("Preview GET with invalid code refused (GJC11)", !!previewGetMissError && previewGetMissError.code === "GJC11");
  
  // Redeem with {get:true} should be refused for both hit and miss
  const { error: redeemGetHitError } = await outsider.client.rpc("redeem_join_code", {
    p_code: getTestCode,
  }, { get: true });
  check("Redeem GET with valid code refused (GJC11)", !!redeemGetHitError && redeemGetHitError.code === "GJC11");
  
  const { error: redeemGetMissError } = await outsider.client.rpc("redeem_join_code", {
    p_code: "INVALIDGET",
  }, { get: true });
  check("Redeem GET with invalid code refused (GJC11)", !!redeemGetMissError && redeemGetMissError.code === "GJC11");
  console.log();

  console.log("TEST: Helper functions not executable by authenticated");
  const { error: genError } = await outsider.client.rpc("generate_join_code", {});
  check("generate_join_code denied", !!genError && genError.code === "42501");

  const { error: recordError } = await outsider.client.rpc("record_join_code_miss", {
    p_user_id: outsider.userId,
  });
  check("record_join_code_miss denied", !!recordError && recordError.code === "42501");
  console.log();

  console.log("TEST: Mutant killers - gen_random_bytes, search_path");
  // Catalog queries must go over a direct Postgres connection (PostgREST does not expose pg_catalog)
  const pgClient = new Client({ connectionString: SUPABASE_DB_URL });
  try {
    await pgClient.connect();
    
    // Mutant: random() instead of gen_random_bytes
    // Check the function body contains gen_random_bytes and not random()
    try {
      const funcDefResult = await pgClient.query(`
        SELECT p.oid, pg_get_functiondef(p.oid) AS def
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'generate_join_code'
      `);
      
      function parseFunctionDef(row: unknown): { oid: number; def: string } | null {
        if (row === null || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        if (typeof r.oid !== "number" && typeof r.oid !== "string") return null;
        if (typeof r.def !== "string") return null;
        return { oid: typeof r.oid === "string" ? parseInt(r.oid, 10) : r.oid, def: r.def };
      }
      
      if (funcDefResult.rows.length === 1) {
        const parsed = parseFunctionDef(funcDefResult.rows[0]);
        if (parsed) {
          const hasGenRandomBytes = parsed.def.includes('gen_random_bytes');
          const hasRandom = parsed.def.includes('random()');
          check("generate_join_code uses gen_random_bytes (kills random() mutant)", hasGenRandomBytes);
          check("generate_join_code does not use random()", !hasRandom);
        } else {
          check("generate_join_code uses gen_random_bytes (kills random() mutant)", false, "Could not parse function definition");
          check("generate_join_code does not use random()", false, "Could not parse function definition");
        }
      } else {
        check("generate_join_code uses gen_random_bytes (kills random() mutant)", false, `Expected 1 function, found ${funcDefResult.rows.length}`);
        check("generate_join_code does not use random()", false, `Expected 1 function, found ${funcDefResult.rows.length}`);
      }
    } catch (funcDefError) {
      const errorMsg = funcDefError instanceof Error ? funcDefError.message : String(funcDefError);
      check("generate_join_code uses gen_random_bytes (kills random() mutant)", false, errorMsg);
      check("generate_join_code does not use random()", false, errorMsg);
    }
    
    // Mutant: search_path dropped
    // Check that all SECURITY DEFINER functions have search_path="" exactly
    try {
      // Expected SECURITY DEFINER functions (check_join_code_throttle was removed)
      const expectedDefinerFuncs = [
        'preview_join_code',
        'redeem_join_code', 
        'create_join_code',
        'revoke_join_code',
        'record_join_code_miss'
      ];
      
      const definerFuncsResult = await pgClient.query(`
        SELECT p.proname, p.proconfig
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])
          AND p.prosecdef = true
      `, [expectedDefinerFuncs]);
      
      function parseDefinerFunc(row: unknown): { proname: string; proconfig: string[] | null } | null {
        if (row === null || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        if (typeof r.proname !== "string") return null;
        if (r.proconfig === null) return { proname: r.proname, proconfig: null };
        if (!Array.isArray(r.proconfig)) return null;
        if (!r.proconfig.every((c): c is string => typeof c === "string")) return null;
        return { proname: r.proname, proconfig: r.proconfig };
      }
      
      const definerFuncs: Array<{ proname: string; proconfig: string[] | null }> = [];
      for (const row of definerFuncsResult.rows) {
        const parsed = parseDefinerFunc(row);
        if (parsed) definerFuncs.push(parsed);
      }
      
      // Check we found all expected functions
      const foundNames = new Set(definerFuncs.map(f => f.proname));
      const missingFuncs = expectedDefinerFuncs.filter(name => !foundNames.has(name));
      
      if (missingFuncs.length > 0) {
        check("All SECURITY DEFINER functions have search_path=\"\" (kills search_path mutant)", 
          false, 
          `Missing functions: ${missingFuncs.join(', ')}`);
      } else {
        // Check each has search_path=""
        const allHaveSearchPath = definerFuncs.every(f => 
          f.proconfig !== null && f.proconfig.some(c => c === 'search_path=""')
        );
        check("All SECURITY DEFINER functions have search_path=\"\" (kills search_path mutant)", 
          allHaveSearchPath,
          "", definerFuncs.map(f => ({name: f.proname, config: f.proconfig})));
      }
      
      // Assert that check_join_code_throttle does NOT exist (removed dead code)
      const deadFuncResult = await pgClient.query(`
        SELECT p.proname
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'check_join_code_throttle'
      `);
      check("check_join_code_throttle does not exist (dead code removed)", deadFuncResult.rows.length === 0);
      
    } catch (definerError) {
      const errorMsg = definerError instanceof Error ? definerError.message : String(definerError);
      check("All SECURITY DEFINER functions have search_path=\"\" (kills search_path mutant)", false, errorMsg);
    }

    // L1: gym_join_codes_created_by_idx exists on (created_by)
    try {
      const idxResult = await pgClient.query(`
        SELECT indexdef FROM pg_indexes 
        WHERE schemaname='public' AND indexname='gym_join_codes_created_by_idx'
      `);
      check("gym_join_codes_created_by_idx exists on (created_by)", 
        idxResult.rows.length === 1 && idxResult.rows[0].indexdef.includes('(created_by)'));
    } catch (idxError) {
      check("gym_join_codes_created_by_idx exists on (created_by)", false, String(idxError));
    }

    // L1: Single merged SELECT policy on gym_join_codes
    try {
      const policyResult = await pgClient.query(`
        SELECT policyname FROM pg_policies 
        WHERE schemaname='public' AND tablename='gym_join_codes' AND cmd='SELECT'
      `);
      const policyNames = policyResult.rows.map((r: {policyname: string}) => r.policyname);
      check("Single merged SELECT policy on gym_join_codes", 
        policyNames.length === 1 && policyNames[0] === 'gym_join_codes_select');
    } catch (policyError) {
      check("Single merged SELECT policy on gym_join_codes", false, String(policyError));
    }

  } finally {
    await pgClient.end();
  }
  console.log();

  // Test already_member personalized error (LOW 6)
  console.log("\n=== Test already_member personalized error (LOW 6) ===");
  
  // successUser is already a member of gymId via highUsesCode
  // Now successUser tries to redeem again - should get already_member with gym name
  const { data: alreadyMemberData } = await successUser.client.rpc("redeem_join_code", {
    p_code: highUsesCode,
  });
  check("successUser redeem returns data", !!alreadyMemberData);
  const parsedAlreadyMember = parseRedeemJoinCodeResult(alreadyMemberData);
  check("successUser redeem already_member reason", 
    parsedAlreadyMember !== null && !parsedAlreadyMember.ok && parsedAlreadyMember.reason === "already_member");
  check("successUser redeem already_member includes gym_name",
    parsedAlreadyMember !== null && !parsedAlreadyMember.ok && parsedAlreadyMember.gym_name === "Test Gym");

  // Verify user-facing copy via lib function
  const { processRedeemResult } = await import("@/lib/redeem-join-code-errors");
  const userFacingResult = processRedeemResult(alreadyMemberData);
  check("User-facing error includes 'Test Gym'",
    !userFacingResult.ok && userFacingResult.error.includes("Test Gym"));
  
  // Test N failed redeems = N misses (no double-recording)
  console.log("\nTEST: N failed redeems = N misses (no double-recording)");
  const missTestUser = await createTestUser("miss-test");
  const beforeMissCount = await adminClient
    .from("gym_join_code_attempts")
    .select("*", { count: "exact" })
    .eq("user_id", missTestUser.userId);
  check("missTestUser starts with 0 attempts", beforeMissCount.count === 0);
  
  // Make 3 failed redeem calls (invalid codes)
  for (let i = 0; i < 3; i++) {
    await missTestUser.client.rpc("redeem_join_code", { p_code: "INVALID" + i });
  }
  
  const afterMissCount = await adminClient
    .from("gym_join_code_attempts")
    .select("*", { count: "exact" })
    .eq("user_id", missTestUser.userId);
  check("3 failed redeems = exactly 3 attempts recorded", afterMissCount.count === 3);
  
  await adminClient.from("gym_join_code_attempts").delete().eq("user_id", missTestUser.userId);
  await adminClient.auth.admin.deleteUser(missTestUser.userId);
  console.log();

  // Test throttle: 10 misses allowed, 10th returns real reason, 11th is throttled
  console.log("\nTEST: Throttle allows exactly 10 misses");
  const throttleTestUser = await createTestUser("throttle-test");
  
  // Make 10 failed redeem calls (invalid codes)
  let tenthResult = null;
  for (let i = 0; i < 10; i++) {
    const { data } = await throttleTestUser.client.rpc("redeem_join_code", { p_code: "INVALID" + i });
    if (i === 9) tenthResult = data;
  }
  
  const tenthParsed = parseRedeemJoinCodeResult(tenthResult);
  check("10th attempt returns real reason (invalid, not throttled)",
    tenthParsed !== null && !tenthParsed.ok && tenthParsed.reason === "invalid");
  
  // 11th attempt should be throttled
  const { data: eleventhData } = await throttleTestUser.client.rpc("redeem_join_code", { p_code: "INVALID10" });
  const eleventhParsed = parseRedeemJoinCodeResult(eleventhData);
  check("11th attempt is throttled",
    eleventhParsed !== null && !eleventhParsed.ok && eleventhParsed.reason === "throttled");
  
  const throttleCount = await adminClient
    .from("gym_join_code_attempts")
    .select("*", { count: "exact" })
    .eq("user_id", throttleTestUser.userId);
  check("10 failed attempts recorded (11th not recorded)", throttleCount.count === 10);
  
  await adminClient.from("gym_join_code_attempts").delete().eq("user_id", throttleTestUser.userId);
  await adminClient.auth.admin.deleteUser(throttleTestUser.userId);
  console.log();

  // Cleanup
  console.log("Cleaning up...");
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymId);
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymStaff);
  await adminClient.from("gym_join_codes").delete().eq("gym_id", ownGymTest);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymId);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymStaff);
  await adminClient.from("gym_memberships").delete().eq("gym_id", ownGymTest);
  await adminClient.from("gym_join_code_attempts").delete().in("user_id", [
    throttleUser.userId,
    successUser.userId,
  ]);
  await adminClient.from("gyms").delete().in("id", [gymId, gymStaff, ownGymTest]);

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    return false;
  }

  console.log("\n✅ All comprehensive tests passed\n");
  return true;
}

runTests().then((success) => process.exit(success ? 0 : 1));
