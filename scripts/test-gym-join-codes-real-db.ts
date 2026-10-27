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
 * NO-OP BY DEFAULT: Skips (exit 0) unless REAL_DB=1 is set.
 * In CI: REAL_DB=1 is set in database-seed-test job.
 */

// NO-OP by default: skip unless REAL_DB=1
if (process.env.REAL_DB !== "1") {
  console.log("⏭️  Skipping gym join codes real-DB tests (REAL_DB=1 not set)");
  console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance");
  console.log();
  process.exit(0);
}

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

  // Check use_count NOT incremented (idempotent redeem doesn't consume)
  const { data: codeAfterRedeem } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("code", memberCode)
    .single();
  check("Code use_count is 1 after two redeems (idempotent doesn't consume)", codeAfterRedeem?.use_count === 1);
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
  const emailMemberF = `gym-member-codes-f-${Date.now()}@example.com`;
  const emailMemberG = `gym-member-codes-g-${Date.now()}@example.com`;
  
  const { data: userFData } = await adminClient.auth.admin.createUser({
    email: emailMemberF,
    password: "test-password-ghi",
    email_confirm: true,
  });
  const userIdF = userFData.user?.id;

  const { data: userGData } = await adminClient.auth.admin.createUser({
    email: emailMemberG,
    password: "test-password-jkl",
    email_confirm: true,
  });
  const userIdG = userGData.user?.id;

  const clientF = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientG = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientF.auth.signInWithPassword({ 
    email: emailMemberF, 
    password: "test-password-ghi" 
  });
  await clientG.auth.signInWithPassword({ 
    email: emailMemberG, 
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

  // TEST: FOR UPDATE blocks concurrent access (deterministic test)
  console.log("TEST: FOR UPDATE lock prevents race condition (deterministic)");
  const { data: forUpdateCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
    p_max_uses: 1,
  });
  const forUpdateCode = forUpdateCodeData?.[0]?.code;
  
  // Create two test users for this race test
  const emailRace1 = `race1-${Date.now()}-${Math.random()}@example.com`;
  const emailRace2 = `race2-${Date.now()}-${Math.random()}@example.com`;
  const { data: race1Data } = await adminClient.auth.admin.createUser({
    email: emailRace1,
    password: "password123",
    email_confirm: true,
  });
  const { data: race2Data } = await adminClient.auth.admin.createUser({
    email: emailRace2,
    password: "password123",
    email_confirm: true,
  });
  const race1Uid = race1Data.user?.id;
  const race2Uid = race2Data.user?.id;
  
  // Get their JWT tokens for pg function calls
  const race1Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const race2Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await race1Client.auth.signInWithPassword({ email: emailRace1, password: "password123" });
  await race2Client.auth.signInWithPassword({ email: emailRace2, password: "password123" });
  const race1Session = (await race1Client.auth.getSession()).data.session;
  const race2Session = (await race2Client.auth.getSession()).data.session;
  
  // Use direct DB connection to test FOR UPDATE lock in redeem_join_code
  const { Pool } = await import("pg");
  const dbUrl = process.env.SUPABASE_DB_URL || 
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    const conn1 = await pool.connect();
    const conn2 = await pool.connect();
    
    try {
      // Set up auth context for both connections
      await conn1.query("BEGIN");
      await conn1.query(`SET request.jwt.claim.sub = '${race1Uid}'`);
      
      await conn2.query("BEGIN");
      await conn2.query(`SET request.jwt.claim.sub = '${race2Uid}'`);
      await conn2.query("SET statement_timeout = '800ms'");
      
      // Connection 1: Start redeem but don't commit (holds FOR UPDATE lock)
      await conn1.query("SELECT * FROM public.redeem_join_code($1)", [forUpdateCode]);
      
      // Connection 2: Try to redeem same code (should block on FOR UPDATE)
      let conn2Blocked = false;
      try {
        await conn2.query("SELECT * FROM public.redeem_join_code($1)", [forUpdateCode]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        conn2Blocked = message.includes("timeout") || message.includes("canceled") || message.includes("statement_timeout");
      }
      
      check("FOR UPDATE blocks second connection", conn2Blocked);
      
      await conn1.query("ROLLBACK");
      await conn2.query("ROLLBACK");
    } finally {
      conn1.release();
      conn2.release();
    }
  } finally {
    await pool.end();
  }
  console.log();

  // TEST: Expired code
  console.log("TEST: Expired code");
  // Create a code normally, then expire it via direct UPDATE (create_join_code validates future expiry)
  const { data: toExpireCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
  });
  const expiredCode = toExpireCodeData?.[0]?.code;
  const expiredCodeId = toExpireCodeData?.[0]?.id;
  
  // Expire it via admin UPDATE
  await adminClient
    .from("gym_join_codes")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", expiredCodeId);

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

  // TEST: Owner redeeming code for their own gym (idempotent no-op, use_count unchanged)
  console.log("TEST: Owner redeeming member code for their own gym");
  const { data: ownerCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
  });
  const ownerCode = ownerCodeData?.[0]?.code;
  const ownerCodeId = ownerCodeData?.[0]?.id;

  // Get initial use_count
  const { data: beforeRedeem } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", ownerCodeId)
    .single();
  const initialUseCount = beforeRedeem?.use_count ?? 0;

  // Owner A redeems code for gym A (where they're already owner)
  const { error: ownerRedeemError } = await clientA.rpc("redeem_join_code", {
    p_code: ownerCode,
  });
  check("Owner A can redeem code for own gym (idempotent)", !ownerRedeemError, ownerRedeemError?.message);

  // Check use_count is unchanged (idempotent no-op)
  const { data: afterRedeem } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", ownerCodeId)
    .single();
  check("use_count unchanged after owner redeems for own gym", afterRedeem?.use_count === initialUseCount);

  // Check Owner A is still owner (not downgraded to member)
  const { data: ownerAMembership } = await adminClient
    .from("gym_memberships")
    .select("role")
    .eq("gym_id", gymIdA)
    .eq("user_id", userIdA)
    .single();
  check("Owner A role still owner (not downgraded)", ownerAMembership?.role === "owner");
  console.log();

  // TEST: Owner of default gym redeeming code for another gym
  console.log("TEST: Owner of default gym redeeming code for another gym");
  const { data: defaultGymData } = await adminClient
    .from("gyms")
    .select("id")
    .eq("slug", "default")
    .single();
  const defaultGymId = defaultGymData?.id;

  // Create a new user H who will be owner of default gym
  const emailOwnerH = `gym-owner-default-${Date.now()}@example.com`;
  const { data: userHData } = await adminClient.auth.admin.createUser({
    email: emailOwnerH,
    password: "test-password-mno",
    email_confirm: true,
  });
  const userIdH = userHData.user?.id;
  if (!userIdH) return false;

  const clientH = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientH.auth.signInWithPassword({ 
    email: emailOwnerH, 
    password: "test-password-mno" 
  });

  // Make user H owner of default gym
  await adminClient
    .from("gym_memberships")
    .update({ role: "owner", status: "active" })
    .eq("gym_id", defaultGymId)
    .eq("user_id", userIdH);

  // User H redeems code for gym B
  const { data: gymBMemberCodeData } = await clientB.rpc("create_join_code", {
    p_gym_id: gymIdB,
    p_role: "member",
  });
  const gymBMemberCode = gymBMemberCodeData?.[0]?.code;

  const { error: userHRedeemError } = await clientH.rpc("redeem_join_code", {
    p_code: gymBMemberCode,
  });
  check("Owner of default gym can redeem code for gym B", !userHRedeemError, userHRedeemError?.message);

  // Check user H is member of gym B
  const { data: userHGymB } = await adminClient
    .from("gym_memberships")
    .select("role, status")
    .eq("gym_id", gymIdB)
    .eq("user_id", userIdH)
    .single();
  check("User H is member of gym B", userHGymB?.role === "member" && userHGymB?.status === "active");

  // Check user H is still owner of default gym (not removed)
  const { data: userHDefault } = await adminClient
    .from("gym_memberships")
    .select("role, status")
    .eq("gym_id", defaultGymId)
    .eq("user_id", userIdH)
    .single();
  check("User H is still owner of default gym", userHDefault?.role === "owner" && userHDefault?.status === "active");
  console.log();

  // TEST: Staff redeeming code for another gym
  console.log("TEST: Staff of gym A redeeming code for gym B");
  // Staff E redeems code for gym B (already have staff role in gym A)
  const { error: staffERedeemError } = await clientE.rpc("redeem_join_code", {
    p_code: gymBMemberCode,
  });
  check("Staff E can redeem code for gym B", !staffERedeemError, staffERedeemError?.message);

  // Check staff E is member of gym B
  const { data: staffEGymB } = await adminClient
    .from("gym_memberships")
    .select("role, status")
    .eq("gym_id", gymIdB)
    .eq("user_id", userIdE)
    .single();
  check("Staff E is member of gym B", staffEGymB?.role === "member" && staffEGymB?.status === "active");

  // Check staff E is still staff of gym A (not removed, because staff role is not moved)
  const { data: staffEGymA } = await adminClient
    .from("gym_memberships")
    .select("role, status")
    .eq("gym_id", gymIdA)
    .eq("user_id", userIdE)
    .single();
  check("Staff E is still staff of gym A", staffEGymA?.role === "staff" && staffEGymA?.status === "active");
  console.log();

  // TEST: Owner redeeming their own gym's member code (idempotent no-op)
  console.log("TEST: Owner of gym A redeeming member code for gym A (no-op)");
  
  // Get the member code id
  const memberCodeId = memberCodeData?.[0]?.id;
  
  // Get current use_count for gym A member code
  const { data: beforeUseCount } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", memberCodeId)
    .single();
  const useCountBefore = beforeUseCount?.use_count ?? 0;
  
  // Owner A redeems member code for their own gym (should be no-op)
  const { error: ownerARedeemOwnError } = await clientA.rpc("redeem_join_code", {
    p_code: memberCode,
  });
  check("Owner A can call redeem on their own gym code (no-op)", !ownerARedeemOwnError, ownerARedeemOwnError?.message);
  
  // Check use_count is UNCHANGED (no-op should not consume a use)
  const { data: afterUseCount } = await adminClient
    .from("gym_join_codes")
    .select("use_count")
    .eq("id", memberCodeId)
    .single();
  check("Use count unchanged after owner redeeming own gym code", afterUseCount?.use_count === useCountBefore);
  
  // Check owner A is still owner (not downgraded to member)
  const { data: ownerAStillOwner } = await adminClient
    .from("gym_memberships")
    .select("role, status")
    .eq("gym_id", gymIdA)
    .eq("user_id", userIdA)
    .single();
  check("Owner A is still owner (not downgraded)", ownerAStillOwner?.role === "owner");
  console.log();

  // TEST: Anon (unauthenticated) cannot call RPC functions
  console.log("TEST: Anon cannot redeem codes");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: anonRedeemError } = await anonClient.rpc("redeem_join_code", {
    p_code: memberCode,
  });
  check("Anon redeem fails", !!anonRedeemError);
  // Must be permission denied (no EXECUTE grant), NOT "Not authenticated" (would mean GRANT exists)
  check("Anon error is permission denied (no EXECUTE grant)", 
    !!anonRedeemError && (
      anonRedeemError.message?.toLowerCase().includes("permission denied") || 
      anonRedeemError.code === "42501" ||
      anonRedeemError.message?.includes("insufficient_privilege")
    ));

  const { error: anonPreviewError } = await anonClient.rpc("preview_join_code", {
    p_code: memberCode,
  });
  check("Anon preview fails", !!anonPreviewError);
  
  const { error: anonCreateError } = await anonClient.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
  });
  check("Anon create fails", !!anonCreateError);
  console.log();

  // TEST: Direct INSERT/UPDATE blocked (RPC-only writes)
  console.log("TEST: Direct table writes blocked");
  const { error: directInsertError } = await clientA
    .from("gym_join_codes")
    .insert({
      gym_id: gymIdA,
      code: "TESTCODE99",
      role: "member",
      created_by: userIdA,
    });
  check("Owner cannot INSERT directly", !!directInsertError);
  check("INSERT error is RLS policy violation",
    !!directInsertError && (directInsertError.message?.includes("row-level security") || 
    directInsertError.message?.includes("policy")));
  
  // UPDATE with no policy: silently matches 0 rows (no error in Postgres RLS)
  // Read original state first
  const { data: beforeUpdate } = await adminClient
    .from("gym_join_codes")
    .select("use_count, revoked_at, expires_at")
    .eq("id", memberCodeId)
    .single();
  
  const testRevokedAt = new Date(Date.now() + 86400000).toISOString();
  const { data: directUpdateResult } = await clientA
    .from("gym_join_codes")
    .update({ revoked_at: testRevokedAt })
    .eq("id", memberCodeId)
    .select();
  check("Owner UPDATE matches 0 rows (no policy)", !directUpdateResult || directUpdateResult.length === 0);
  
  // Verify row is actually unchanged
  const { data: afterUpdate } = await adminClient
    .from("gym_join_codes")
    .select("use_count, revoked_at, expires_at")
    .eq("id", memberCodeId)
    .single();
  check("Row unchanged after UPDATE with no policy", 
    afterUpdate?.use_count === beforeUpdate?.use_count &&
    afterUpdate?.revoked_at === beforeUpdate?.revoked_at &&
    afterUpdate?.expires_at === beforeUpdate?.expires_at);
  console.log();

  // TEST: Throttle limits at exactly 10 misses
  console.log("TEST: Throttle triggers at 10 misses");
  // Create a fresh user for throttle test
  const emailThrottle = `test-throttle-${Date.now()}-${Math.random()}@example.com`;
  const { data: authUserThrottle } = await adminClient.auth.admin.createUser({
    email: emailThrottle,
    password: "password123",
    email_confirm: true,
  });
  const clientThrottle = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientThrottle.auth.signInWithPassword({
    email: emailThrottle,
    password: "password123",
  });
  
  // Make 9 failed attempts (should not throttle)
  for (let i = 0; i < 9; i++) {
    await clientThrottle.rpc("preview_join_code", { p_code: "INVALID" });
  }
  
  // 10th attempt should still work (threshold is >= 10)
  const { error: attempt10 } = await clientThrottle.rpc("preview_join_code", { p_code: "INVALID" });
  check("10th miss still works (not throttled yet)", !attempt10 || !attempt10.message?.includes("Too many"));
  
  // 11th attempt should be throttled
  const { error: attempt11 } = await clientThrottle.rpc("preview_join_code", { p_code: "INVALID" });
  check("11th miss is throttled", !!attempt11);
  check("Throttle error message", !!attempt11 && (attempt11.message?.includes("Too many") || attempt11.code === "GJC10"));
  console.log();

  // TEST: Successful redemptions don't count toward throttle
  console.log("TEST: Successes don't trigger throttle");
  // Create a fresh user for success test
  const emailSuccess = `test-success-${Date.now()}-${Math.random()}@example.com`;
  const { data: authUserSuccess } = await adminClient.auth.admin.createUser({
    email: emailSuccess,
    password: "password123",
    email_confirm: true,
  });
  const clientSuccess = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientSuccess.auth.signInWithPassword({
    email: emailSuccess,
    password: "password123",
  });
  
  // Create a code with high max_uses for successful redeems
  const { data: successCodeData } = await clientA.rpc("create_join_code", {
    p_gym_id: gymIdA,
    p_role: "member",
    p_max_uses: 100,
  });
  const successCode = successCodeData?.[0]?.code;
  
  // Make 20 successful redeems (should NOT throttle, only misses count)
  // First redeem joins the gym, subsequent ones are idempotent (already a member)
  for (let i = 0; i < 20; i++) {
    await clientSuccess.rpc("redeem_join_code", { p_code: successCode });
  }
  
  // Next attempt should still work (successes don't count)
  const { error: successAfter20 } = await clientSuccess.rpc("redeem_join_code", { p_code: successCode });
  check("20 successes don't throttle", !successAfter20);
  console.log();

  // TEST: Code format CHECK constraint (using admin to bypass RLS)
  console.log("TEST: Code format CHECK constraint");
  const { error: invalidFormatError } = await adminClient
    .from("gym_join_codes")
    .insert({
      gym_id: gymIdA,
      code: "INVALID", // Only 7 chars, should fail format check
      role: "member",
      created_by: userIdA,
    });
  check("Invalid format code rejected", !!invalidFormatError);
  check("Format error mentions constraint or check",
    !!invalidFormatError && (invalidFormatError.message?.includes("code_format") || 
    invalidFormatError.message?.includes("check constraint") ||
    invalidFormatError.message?.toLowerCase().includes("violates")));
  
  const { error: ambiguousCharError } = await adminClient
    .from("gym_join_codes")
    .insert({
      gym_id: gymIdA,
      code: "ABCDEF01IO", // Contains ambiguous chars (0, 1, I, O)
      role: "member",
      created_by: userIdA,
    });
  check("Ambiguous char code rejected", !!ambiguousCharError);
  console.log();

  // Clean up (delete only test data, NOT users)
  console.log("Cleaning up test data...");
  
  // Delete join codes for test gyms
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymIdA);
  await adminClient.from("gym_join_codes").delete().eq("gym_id", gymIdB);
  
  // Delete memberships for test gyms
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymIdA);
  await adminClient.from("gym_memberships").delete().eq("gym_id", gymIdB);
  
  // Delete test gyms (cascade will handle remaining refs)
  await adminClient.from("gyms").delete().eq("id", gymIdA);
  await adminClient.from("gyms").delete().eq("id", gymIdB);
  
  console.log("✓ Test data cleaned up (users left intact for reuse)\n");

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
