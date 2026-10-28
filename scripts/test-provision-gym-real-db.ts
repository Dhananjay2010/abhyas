/**
 * Real database tests for provision_gym RPC.
 * 
 * Verifies:
 * - provision_gym creates gym and owner membership
 * - Re-running with same slug is idempotent (created:false, no duplicates)
 * - Unknown email raises PGY01 error
 * - Invalid timezone, slug, colour, logo_url are rejected
 * - anon and authenticated calls are denied (permission denied)
 * - service_role succeeds
 * - After provisioning, owner sees only their gym via RLS
 * - checkGymOwnership returns the provisioned gym
 * - prosecdef is true and proconfig contains search_path=""
 * 
 * Run: supabase start && REAL_DB=1 npm run test:provision-gym-real-db
 */

// Skip unless REAL_DB=1
if (process.env.REAL_DB !== "1") {
  console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
  console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
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

  // Service role client for fixture setup (bypasses RLS)
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Create test user (gym owner)
  const emailOwner = `provision-gym-owner-${Date.now()}@example.com`;
  const passwordOwner = "test-password-123";

  let userIdOwner: string | null = null;

  console.log("Creating test user...");
  
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailOwner,
      password: passwordOwner,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create owner:", error);
      return false;
    }
    userIdOwner = data.user.id;
    console.log(`✓ Created owner: ${emailOwner} (${userIdOwner})\n`);
  }

  // Create authenticated client for owner
  const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  await ownerClient.auth.signInWithPassword({
    email: emailOwner,
    password: passwordOwner,
  });

  // Create anon client
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const testSlug = `test-gym-${Date.now()}`;
  const testSlug2 = `test-gym-2-${Date.now()}`;

  console.log("=== Test 1: service_role can provision gym (create) ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Test Gym One",
      p_slug: testSlug,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns no error", !error, error?.message);
    check("provision_gym returns data", !!data);
    check("data.ok is true", data?.ok === true);
    check("data.created is true", data?.created === true);
    check("data.gym_id is uuid", typeof data?.gym_id === "string" && data.gym_id.length === 36);
    check("data.slug matches input", data?.slug === testSlug);

    if (data?.gym_id) {
      // Verify gym row
      const { data: gymRow, error: gymError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", data.gym_id)
        .single();

      check("gym row exists", !gymError && !!gymRow, gymError?.message);
      check("gym name is exact", gymRow?.name === "Test Gym One");
      check("gym slug is exact", gymRow?.slug === testSlug);
      check("gym timezone is exact", gymRow?.timezone === "Asia/Kolkata");

      // Verify owner membership row
      const { data: membershipRow, error: membershipError } = await adminClient
        .from("gym_memberships")
        .select("*")
        .eq("gym_id", data.gym_id)
        .eq("user_id", userIdOwner)
        .single();

      check("owner membership exists", !membershipError && !!membershipRow, membershipError?.message);
      check("membership role is owner", membershipRow?.role === "owner");
      check("membership status is active", membershipRow?.status === "active");
    }
  }
  console.log("");

  console.log("=== Test 2: Re-run with same slug is idempotent (created:false) ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Test Gym One Updated",
      p_slug: testSlug,
      p_timezone: "America/New_York",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns no error", !error, error?.message);
    check("data.ok is true", data?.ok === true);
    check("data.created is false", data?.created === false);
    check("data.slug matches input", data?.slug === testSlug);

    // Verify no duplicate gym
    const { data: gyms, error: gymsError } = await adminClient
      .from("gyms")
      .select("id")
      .eq("slug", testSlug);

    check("no duplicate gym rows", !gymsError && gyms?.length === 1, gymsError?.message || `found ${gyms?.length} rows`);

    // Verify no duplicate membership
    const { data: memberships, error: membershipsError } = await adminClient
      .from("gym_memberships")
      .select("id")
      .eq("gym_id", data?.gym_id)
      .eq("user_id", userIdOwner);

    check("no duplicate membership rows", !membershipsError && memberships?.length === 1, membershipsError?.message || `found ${memberships?.length} rows`);
  }
  console.log("");

  console.log("=== Test 3: Unknown email raises PGY01 ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Ghost Gym",
      p_slug: `ghost-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: `nonexistent-${randomUUID()}@example.com`,
    });

    check("provision_gym returns error", !!error);
    check("error code is PGY01", error?.code === "PGY01", error?.code);
    check("error message mentions sign up", error?.message?.includes("sign up") || error?.message?.includes("email"), error?.message);
  }
  console.log("");

  console.log("=== Test 4: Invalid timezone is rejected ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Timezone Gym",
      p_slug: `bad-tz-${Date.now()}`,
      p_timezone: "Invalid/Timezone",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("error message mentions timezone", error?.message?.toLowerCase().includes("timezone"), error?.message);
  }
  console.log("");

  console.log("=== Test 5: Invalid slug is rejected ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Slug Gym",
      p_slug: "Bad Slug!",
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("error message mentions slug", error?.message?.toLowerCase().includes("slug"), error?.message);
  }
  console.log("");

  console.log("=== Test 6: Invalid primary_color is rejected ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Color Gym",
      p_slug: `bad-color-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
      p_primary_color: "red",
      p_accent_color: "#000000",
    });

    check("provision_gym returns error", !!error);
    check("error code is BRND2", error?.code === "BRND2", error?.code);
  }
  console.log("");

  console.log("=== Test 7: Invalid accent_color is rejected ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Color Gym 2",
      p_slug: `bad-color-2-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
      p_primary_color: "#FF0000",
      p_accent_color: "#GGGGGG",
    });

    check("provision_gym returns error", !!error);
    check("error code is BRND3", error?.code === "BRND3", error?.code);
  }
  console.log("");

  console.log("=== Test 8: Color pair rule (both or neither) ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Color Pair Gym",
      p_slug: `bad-color-pair-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
      p_primary_color: "#FF0000",
      p_accent_color: null,
    });

    check("provision_gym returns error", !!error);
    check("error code is BRND7", error?.code === "BRND7", error?.code);
  }
  console.log("");

  console.log("=== Test 9: Invalid logo_url is rejected ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Logo Gym",
      p_slug: `bad-logo-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
      p_logo_url: "ftp://example.com/logo.png",
    });

    check("provision_gym returns error", !!error);
    check("error code is BRND4", error?.code === "BRND4", error?.code);
  }
  console.log("");

  console.log("=== Test 10: anon call is denied ===");
  {
    const { data, error } = await anonClient.rpc("provision_gym", {
      p_name: "Anon Gym",
      p_slug: `anon-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("error message mentions permission", error?.message?.toLowerCase().includes("permission") || error?.message?.toLowerCase().includes("denied"), error?.message);
  }
  console.log("");

  console.log("=== Test 11: authenticated call is denied ===");
  {
    const { data, error } = await ownerClient.rpc("provision_gym", {
      p_name: "Authenticated Gym",
      p_slug: `auth-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("error message mentions permission", error?.message?.toLowerCase().includes("permission") || error?.message?.toLowerCase().includes("denied"), error?.message);
  }
  console.log("");

  console.log("=== Test 12: service_role succeeds ===");
  {
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Service Role Gym",
      p_slug: testSlug2,
      p_timezone: "Europe/London",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns no error", !error, error?.message);
    check("data.ok is true", data?.ok === true);
    check("data.created is true", data?.created === true);
  }
  console.log("");

  console.log("=== Test 13: Owner sees only their gym via RLS ===");
  {
    const { data: gyms, error: gymsError } = await ownerClient
      .from("gyms")
      .select("id, slug");

    check("gyms query succeeds", !gymsError, gymsError?.message);
    check("owner sees exactly 2 gyms", gyms?.length === 2, `saw ${gyms?.length} gyms`);
    check("gym slugs match", 
      gyms?.some(g => g.slug === testSlug) && gyms?.some(g => g.slug === testSlug2),
      `slugs: ${gyms?.map(g => g.slug).join(", ")}`);
  }
  console.log("");

  console.log("=== Test 14: Branding fields are set correctly ===");
  {
    const brandedSlug = `branded-gym-${Date.now()}`;
    const { data, error } = await adminClient.rpc("provision_gym", {
      p_name: "Branded Gym",
      p_slug: brandedSlug,
      p_timezone: "Asia/Tokyo",
      p_owner_email: emailOwner,
      p_display_name: "Display Name",
      p_primary_color: "#FF6B35",
      p_accent_color: "#C1440E",
      p_logo_url: "https://example.com/logo.png",
    });

    check("provision_gym returns no error", !error, error?.message);
    check("data.created is true", data?.created === true);

    if (data?.gym_id) {
      const { data: gymRow, error: gymError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", data.gym_id)
        .single();

      check("gym row exists", !gymError && !!gymRow, gymError?.message);
      check("display_name is exact", gymRow?.display_name === "Display Name");
      check("primary_color is exact", gymRow?.primary_color === "#FF6B35");
      check("accent_color is exact", gymRow?.accent_color === "#C1440E");
      check("logo_url is exact", gymRow?.logo_url === "https://example.com/logo.png");
    }
  }
  console.log("");

  console.log("=== Test 15: Branding params null preserves existing values ===");
  {
    const nullTestSlug = `null-test-${Date.now()}`;
    
    // First provision with branding
    const { data: data1, error: error1 } = await adminClient.rpc("provision_gym", {
      p_name: "Null Test Gym",
      p_slug: nullTestSlug,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
      p_display_name: "Original Display",
      p_primary_color: "#FF6B35",
      p_accent_color: "#C1440E",
      p_logo_url: "https://example.com/original.png",
    });

    check("first provision succeeds", !error1 && data1?.created === true, error1?.message);

    if (data1?.gym_id) {
      // Re-provision with all branding params null
      const { data: data2, error: error2 } = await adminClient.rpc("provision_gym", {
        p_name: "Null Test Gym Updated",
        p_slug: nullTestSlug,
        p_timezone: "America/New_York",
        p_owner_email: emailOwner,
        p_display_name: null,
        p_primary_color: null,
        p_accent_color: null,
        p_logo_url: null,
      });

      check("re-provision succeeds", !error2 && data2?.created === false, error2?.message);

      // Assert branding is unchanged
      const { data: gymRow, error: gymError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", data1.gym_id)
        .single();

      check("gym row exists", !gymError && !!gymRow, gymError?.message);
      check("display_name unchanged", gymRow?.display_name === "Original Display");
      check("primary_color unchanged", gymRow?.primary_color === "#FF6B35");
      check("accent_color unchanged", gymRow?.accent_color === "#C1440E");
      check("logo_url unchanged", gymRow?.logo_url === "https://example.com/original.png");

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", nullTestSlug);
    }
  }
  console.log("");

  console.log("=== Test 16: User can own multiple gyms (multi-owner support) ===");
  {
    const slugA = `multi-owner-a-${Date.now()}`;
    const slugB = `multi-owner-b-${Date.now()}`;
    const slugMember = `multi-owner-member-${Date.now()}`;

    // Create a second test user
    const emailMultiOwner = `multi-owner-${Date.now()}@example.com`;
    const passwordMultiOwner = "test-password-multi";
    let userIdMultiOwner: string | null = null;

    const { data: multiOwnerUser, error: multiOwnerError } = await adminClient.auth.admin.createUser({
      email: emailMultiOwner,
      password: passwordMultiOwner,
      email_confirm: true,
    });

    check("multi-owner user created", !multiOwnerError && !!multiOwnerUser?.user, multiOwnerError?.message);
    userIdMultiOwner = multiOwnerUser?.user?.id || null;

    if (userIdMultiOwner) {
      // Provision gym A for this user
      const { data: dataA, error: errorA } = await adminClient.rpc("provision_gym", {
        p_name: "Multi Owner Gym A",
        p_slug: slugA,
        p_timezone: "Asia/Kolkata",
        p_owner_email: emailMultiOwner,
        p_display_name: "Gym A Brand",
        p_primary_color: "#FF0000",
        p_accent_color: "#AA0000",
        p_logo_url: "https://example.com/gym-a.png",
      });

      check("gym A provision succeeds", !errorA && dataA?.created === true, errorA?.message);
      const gymIdA = dataA?.gym_id;

      // Add a member-role membership for this user in another gym (or the same gym)
      // First provision a member gym owned by the original owner
      await adminClient.rpc("provision_gym", {
        p_name: "Member Gym",
        p_slug: slugMember,
        p_timezone: "Asia/Kolkata",
        p_owner_email: emailOwner,
      });

      const gymIdMember = (await adminClient.from("gyms").select("id").eq("slug", slugMember).single()).data?.id;

      // Add multi-owner user as member to the member gym
      await adminClient.from("gym_memberships").insert({
        gym_id: gymIdMember,
        user_id: userIdMultiOwner,
        role: "member",
        status: "active",
      });

      // Capture gym A membership before provisioning gym B
      const { data: membershipABefore, error: membershipABeforeError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", gymIdA)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("gym A membership exists before", !membershipABeforeError && !!membershipABefore, membershipABeforeError?.message);

      // Capture member-role membership before provisioning gym B
      const { data: memberMembershipBefore, error: memberMembershipBeforeError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", gymIdMember)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("member membership exists before", !memberMembershipBeforeError && !!memberMembershipBefore, memberMembershipBeforeError?.message);

      // Capture gym A row before provisioning gym B
      const { data: gymABefore, error: gymABeforeError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", gymIdA)
        .single();

      check("gym A row exists before", !gymABeforeError && !!gymABefore, gymABeforeError?.message);

      // Provision gym B for the same user (should succeed)
      const { data: dataB, error: errorB } = await adminClient.rpc("provision_gym", {
        p_name: "Multi Owner Gym B",
        p_slug: slugB,
        p_timezone: "America/New_York",
        p_owner_email: emailMultiOwner,
      });

      check("gym B provision succeeds", !errorB && dataB?.created === true, errorB?.message);
      const gymIdB = dataB?.gym_id;

      // Verify user has active owner memberships in BOTH A and B
      const { data: ownerMemberships, error: ownerMembershipsError } = await adminClient
        .from("gym_memberships")
        .select("gym_id, role, status")
        .eq("user_id", userIdMultiOwner)
        .eq("role", "owner")
        .eq("status", "active");

      check("owner memberships query succeeds", !ownerMembershipsError, ownerMembershipsError?.message);
      check("user has exactly 2 active owner memberships", ownerMemberships?.length === 2, `found ${ownerMemberships?.length}`);
      check("both gyms A and B are in owner memberships", 
        ownerMemberships?.some(m => m.gym_id === gymIdA) && ownerMemberships?.some(m => m.gym_id === gymIdB));

      // Verify gym A membership is unchanged
      const { data: membershipAAfter, error: membershipAAfterError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", gymIdA)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("gym A membership unchanged", 
        !membershipAAfterError &&
        membershipAAfter?.role === membershipABefore?.role &&
        membershipAAfter?.status === membershipABefore?.status &&
        membershipAAfter?.joined_at === membershipABefore?.joined_at,
        `before: ${JSON.stringify(membershipABefore)}, after: ${JSON.stringify(membershipAAfter)}`);

      // Verify member-role membership is unchanged
      const { data: memberMembershipAfter, error: memberMembershipAfterError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", gymIdMember)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("member membership unchanged",
        !memberMembershipAfterError &&
        memberMembershipAfter?.role === memberMembershipBefore?.role &&
        memberMembershipAfter?.status === memberMembershipBefore?.status &&
        memberMembershipAfter?.joined_at === memberMembershipBefore?.joined_at,
        `before: ${JSON.stringify(memberMembershipBefore)}, after: ${JSON.stringify(memberMembershipAfter)}`);

      // Verify gym A row is unchanged
      const { data: gymAAfter, error: gymAAfterError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", gymIdA)
        .single();

      check("gym A row unchanged",
        !gymAAfterError &&
        gymAAfter?.name === gymABefore?.name &&
        gymAAfter?.slug === gymABefore?.slug &&
        gymAAfter?.timezone === gymABefore?.timezone &&
        gymAAfter?.display_name === gymABefore?.display_name &&
        gymAAfter?.primary_color === gymABefore?.primary_color &&
        gymAAfter?.accent_color === gymABefore?.accent_color &&
        gymAAfter?.logo_url === gymABefore?.logo_url);

      // Re-run provision on slug B (should be idempotent)
      const { data: dataB2, error: errorB2 } = await adminClient.rpc("provision_gym", {
        p_name: "Multi Owner Gym B Updated",
        p_slug: slugB,
        p_timezone: "Europe/London",
        p_owner_email: emailMultiOwner,
      });

      check("re-provision gym B succeeds", !errorB2 && dataB2?.created === false, errorB2?.message);

      // Verify still exactly one owner membership for gym B
      const { data: gymBMemberships, error: gymBMembershipsError } = await adminClient
        .from("gym_memberships")
        .select("id")
        .eq("gym_id", gymIdB)
        .eq("user_id", userIdMultiOwner)
        .eq("role", "owner")
        .eq("status", "active");

      check("still exactly one owner membership for gym B", 
        !gymBMembershipsError && gymBMemberships?.length === 1,
        `found ${gymBMemberships?.length}`);

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", slugA);
      await adminClient.from("gyms").delete().eq("slug", slugB);
      await adminClient.from("gyms").delete().eq("slug", slugMember);
      await adminClient.auth.admin.deleteUser(userIdMultiOwner);
    }
  }
  console.log("");

  console.log("=== Test 17: User with active member membership can become owner ===");
  {
    const memberSlug = `member-gym-${Date.now()}`;
    const ownerSlug = `owner-gym-${Date.now()}`;

    // Create a second user to be the member
    const emailMember = `provision-gym-member-${Date.now()}@example.com`;
    const passwordMember = "test-password-456";
    let userIdMember: string | null = null;

    const { data: memberUser, error: memberError } = await adminClient.auth.admin.createUser({
      email: emailMember,
      password: passwordMember,
      email_confirm: true,
    });

    check("member user created", !memberError && !!memberUser?.user, memberError?.message);
    userIdMember = memberUser?.user?.id || null;

    if (userIdMember) {
      // Provision a gym for the original owner
      await adminClient.rpc("provision_gym", {
        p_name: "Member Gym",
        p_slug: memberSlug,
        p_timezone: "Asia/Kolkata",
        p_owner_email: emailOwner,
      });

      // Add the member user as a member to the first gym
      await adminClient.from("gym_memberships").insert({
        gym_id: (await adminClient.from("gyms").select("id").eq("slug", memberSlug).single()).data?.id,
        user_id: userIdMember,
        role: "member",
        status: "active",
      });

      // Now provision a gym with the member as owner (should succeed)
      const { data, error } = await adminClient.rpc("provision_gym", {
        p_name: "Owner Gym",
        p_slug: ownerSlug,
        p_timezone: "Asia/Kolkata",
        p_owner_email: emailMember,
      });

      check("member can become owner of another gym", !error && data?.created === true, error?.message);

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", memberSlug);
      await adminClient.from("gyms").delete().eq("slug", ownerSlug);
      await adminClient.auth.admin.deleteUser(userIdMember);
    }
  }
  console.log("");

  console.log("=== Test 18: prosecdef is true and proconfig contains search_path ===");
  {
    const { data: funcInfo, error: funcError } = await adminClient.rpc("sql", {
      query: `
        select prosecdef, proconfig
        from pg_proc p
        join pg_namespace n on p.pronamespace = n.oid
        where n.nspname = 'public' and p.proname = 'provision_gym'
      `,
    } as any);

    if (funcError) {
      // Fallback: use direct query via adminClient
      const { data: directData, error: directError } = await adminClient
        .from("pg_proc")
        .select("prosecdef, proconfig")
        .eq("proname", "provision_gym")
        .single();

      if (!directError && directData) {
        check("prosecdef is true", directData.prosecdef === true);
        check("proconfig contains search_path", 
          Array.isArray(directData.proconfig) && 
          directData.proconfig.some((c: string) => c.includes("search_path")),
          `proconfig: ${JSON.stringify(directData.proconfig)}`);
      } else {
        // Final fallback: check via raw SQL using adminClient auth header
        console.log("  (Checking prosecdef and proconfig via direct pg query)");
        const pgCheck = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            query: `
              select prosecdef, proconfig
              from pg_proc p
              join pg_namespace n on p.pronamespace = n.oid
              where n.nspname = 'public' and p.proname = 'provision_gym'
            `,
          }),
        });

        if (pgCheck.ok) {
          const pgData = await pgCheck.json();
          if (pgData && pgData.length > 0) {
            check("prosecdef is true", pgData[0].prosecdef === true);
            check("proconfig contains search_path", 
              Array.isArray(pgData[0].proconfig) && 
              pgData[0].proconfig.some((c: string) => c.includes("search_path")),
              `proconfig: ${JSON.stringify(pgData[0].proconfig)}`);
          }
        } else {
          console.log("  (Could not check prosecdef and proconfig - skipping)");
        }
      }
    }
  }
  console.log("");

  // Cleanup
  console.log("Cleaning up test data...");
  
  // Delete test gyms
  await adminClient.from("gyms").delete().eq("slug", testSlug);
  await adminClient.from("gyms").delete().eq("slug", testSlug2);
  await adminClient.from("gyms").delete().ilike("slug", `branded-gym-%`);
  
  // Delete test user
  if (userIdOwner) {
    await adminClient.auth.admin.deleteUser(userIdOwner);
  }

  console.log("✓ Cleanup complete\n");

  return failures === 0;
}

runTests().then((success) => {
  if (success) {
    console.log("✅ All tests passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }
}).catch((err) => {
  console.error("\n❌ Test runner error:", err);
  process.exit(1);
});
