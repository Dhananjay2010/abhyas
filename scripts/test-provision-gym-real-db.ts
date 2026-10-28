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
 * - After provisioning, owner sees only their gyms via RLS
 * - prosecdef is true and proconfig contains search_path=""
 * - Provisioning a new gym doesn't affect existing ownerships (including default gym)
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
import { spawn } from "child_process";
import { checkGymOwnership } from "../src/lib/gym/owner-check";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

function execPsql(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [SUPABASE_DB_URL, "-qtAX", "-c", query]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
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

    check("create returns no error", !error, error?.message);
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

    check("re-run same slug returns no error", !error, error?.message);
    check("data.ok is true", data?.ok === true);
    check("data.created is false", data?.created === false);
    check("data.slug matches input", data?.slug === testSlug);

    // Verify no duplicate gym
    const { data: gyms, error: gymsError } = await adminClient
      .from("gyms")
      .select("gym_id:id")
      .eq("slug", testSlug);

    check("no duplicate gym rows", !gymsError && gyms?.length === 1, gymsError?.message || `found ${gyms?.length} rows`);

    // Verify no duplicate membership
    const { data: memberships, error: membershipsError } = await adminClient
      .from("gym_memberships")
      .select("gym_id")
      .eq("gym_id", data?.gym_id)
      .eq("user_id", userIdOwner);

    check("no duplicate membership rows", !membershipsError && memberships?.length === 1, membershipsError?.message || `found ${memberships?.length} rows`);

    // Verify name and timezone are UNCHANGED (function ignores them on re-run)
    const { data: gymRow } = await adminClient
      .from("gyms")
      .select("name, timezone")
      .eq("slug", testSlug)
      .single();

    check("gym name unchanged on re-run", gymRow?.name === "Test Gym One", `got ${gymRow?.name}`);
    check("gym timezone unchanged on re-run", gymRow?.timezone === "Asia/Kolkata", `got ${gymRow?.timezone}`);
  }
  console.log("");

  console.log("=== Test 3: Unknown email raises PGY01 ===");
  {
    const unknownEmail = `nonexistent-${Date.now()}@example.com`;
    const { error } = await adminClient.rpc("provision_gym", {
      p_name: "Ghost Gym",
      p_slug: `ghost-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: unknownEmail,
    });

    check("provision_gym returns error", !!error);
    check("error code is PGY01", error?.code === "PGY01", error?.code);
    check("error message is exact", error?.message === "No user with that email. Ask them to sign up first.", error?.message);
  }
  console.log("");

  console.log("=== Test 4: Invalid timezone is rejected ===");
  {
    const { error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Timezone Gym",
      p_slug: `bad-tz-${Date.now()}`,
      p_timezone: "Invalid/Timezone",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("invalid timezone error code is 22023", error?.code === "22023", error?.code);
    check("error message mentions timezone", (error?.message?.toLowerCase()?.includes("timezone") ?? false), error?.message);
  }
  console.log("");

  console.log("=== Test 5: Invalid slug is rejected ===");
  {
    const { error } = await adminClient.rpc("provision_gym", {
      p_name: "Bad Slug Gym",
      p_slug: "Bad Slug!",
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("provision_gym returns error", !!error);
    check("invalid slug error code is 22023", error?.code === "22023", error?.code);
    check("error message mentions slug", (error?.message?.toLowerCase()?.includes("slug") ?? false), error?.message);
  }
  console.log("");

  console.log("=== Test 6: Invalid primary_color is rejected ===");
  {
    const { error } = await adminClient.rpc("provision_gym", {
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
    const { error } = await adminClient.rpc("provision_gym", {
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
    const { error } = await adminClient.rpc("provision_gym", {
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
    const { error } = await adminClient.rpc("provision_gym", {
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
    const { error } = await anonClient.rpc("provision_gym", {
      p_name: "Anon Gym",
      p_slug: `anon-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("anon call returns error", !!error);
    check("anon error message mentions permission", (error?.message?.toLowerCase()?.includes("permission") ?? false) || (error?.message?.toLowerCase()?.includes("denied") ?? false), error?.message);
  }
  console.log("");

  console.log("=== Test 11: authenticated call is denied ===");
  {
    const { error } = await ownerClient.rpc("provision_gym", {
      p_name: "Authenticated Gym",
      p_slug: `auth-gym-${Date.now()}`,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("authenticated call returns error", !!error);
    check("authenticated error message mentions permission", (error?.message?.toLowerCase()?.includes("permission") ?? false) || (error?.message?.toLowerCase()?.includes("denied") ?? false), error?.message);
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

  console.log("=== Test 13: Owner sees only their gyms via RLS (not unrelated gyms) ===");
  {
    // Create an unrelated gym for a different user
    const emailOther = `other-owner-${Date.now()}@example.com`;
    const { data: otherUser, error: otherUserError } = await adminClient.auth.admin.createUser({
      email: emailOther,
      password: "test-password-other",
      email_confirm: true,
    });

    check("unrelated user created", !otherUserError && !!otherUser?.user, otherUserError?.message);

    const otherSlug = `other-gym-${Date.now()}`;
    const { error: otherGymError } = await adminClient.rpc("provision_gym", {
      p_name: "Other Gym",
      p_slug: otherSlug,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOther,
    });

    check("unrelated gym provisioned", !otherGymError, otherGymError?.message);

    const { data: gyms, error: gymsError } = await ownerClient
      .from("gyms")
      .select("id, slug");

    check("gyms query succeeds", !gymsError, gymsError?.message);
    // Owner should see: default (from 035 trigger), testSlug, testSlug2
    check("owner sees exactly 3 gyms", gyms?.length === 3, `saw ${gyms?.length} gyms`);
    check("gym slugs match owned gyms",
      (gyms?.some(g => g.slug === "default") ?? false) &&
      (gyms?.some(g => g.slug === testSlug) ?? false) &&
      (gyms?.some(g => g.slug === testSlug2) ?? false),
      `slugs: ${gyms?.map(g => g.slug).join(", ")}`);
    check("owner does NOT see unrelated gym", !(gyms?.some(g => g.slug === otherSlug) ?? true), "unrelated gym visible");

    // Cleanup other user
    if (otherUser?.user?.id) {
      await adminClient.from("gyms").delete().eq("slug", otherSlug);
      await adminClient.auth.admin.deleteUser(otherUser.user.id);
    }
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

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", brandedSlug);
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

    // Create a second test user (gets default membership via 035 trigger)
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
      // Get the default gym id for member membership check
      const { data: defaultGym } = await adminClient
        .from("gyms")
        .select("id")
        .eq("slug", "default")
        .single();
      const defaultGymId = defaultGym?.id;

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

      // Capture gym A membership before provisioning gym B
      const { data: membershipABefore, error: membershipABeforeError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", gymIdA)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("gym A membership exists before", !membershipABeforeError && !!membershipABefore, membershipABeforeError?.message);

      // Capture default-gym member-role membership before provisioning gym B (created by 035 trigger)
      const { data: defaultMembershipBefore, error: defaultMembershipBeforeError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("default member membership exists before", !defaultMembershipBeforeError && !!defaultMembershipBefore, defaultMembershipBeforeError?.message);

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
        (ownerMemberships?.some(m => m.gym_id === gymIdA) ?? false) && (ownerMemberships?.some(m => m.gym_id === gymIdB) ?? false));

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

      // Verify default member-role membership is unchanged
      const { data: defaultMembershipAfter, error: defaultMembershipAfterError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdMultiOwner)
        .single();

      check("default member membership unchanged",
        !defaultMembershipAfterError &&
        defaultMembershipAfter?.role === defaultMembershipBefore?.role &&
        defaultMembershipAfter?.status === defaultMembershipBefore?.status &&
        defaultMembershipAfter?.joined_at === defaultMembershipBefore?.joined_at,
        `before: ${JSON.stringify(defaultMembershipBefore)}, after: ${JSON.stringify(defaultMembershipAfter)}`);

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
        .select("gym_id")
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
      await adminClient.auth.admin.deleteUser(userIdMultiOwner);
    }
  }
  console.log("");

  console.log("=== Test 17: User with active member membership can become owner ===");
  {
    const ownerSlug = `owner-gym-${Date.now()}`;

    // Create a user (gets default gym member membership via 035 trigger)
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
      // Create authenticated client for the member (for checkGymOwnership)
      const memberClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });

      await memberClient.auth.signInWithPassword({
        email: emailMember,
        password: passwordMember,
      });

      // Get the default gym id
      const { data: defaultGym } = await adminClient
        .from("gyms")
        .select("id")
        .eq("slug", "default")
        .single();
      const defaultGymId = defaultGym?.id;

      // Verify default member membership exists (from 035 trigger)
      const { data: defaultMembershipBefore, error: defaultMembershipBeforeError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdMember)
        .single();

      check("default member membership exists", !defaultMembershipBeforeError && !!defaultMembershipBefore, defaultMembershipBeforeError?.message);

      // Now provision a gym with the member as owner (should succeed)
      const { data, error } = await adminClient.rpc("provision_gym", {
        p_name: "Owner Gym",
        p_slug: ownerSlug,
        p_timezone: "Asia/Kolkata",
        p_owner_email: emailMember,
      });

      check("member can become owner of another gym", !error && data?.created === true, error?.message);

      // Verify checkGymOwnership returns the provisioned gym (using owner's own session)
      const ownership = await checkGymOwnership(memberClient, userIdMember);
      check("checkGymOwnership returns the provisioned gym",
        ownership.isOwner && ownership.gymId === data?.gym_id && ownership.gymSlug === ownerSlug,
        JSON.stringify(ownership));

      // Verify default member membership is unchanged
      const { data: defaultMembershipAfter, error: defaultMembershipAfterError } = await adminClient
        .from("gym_memberships")
        .select("role, status, joined_at")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdMember)
        .single();

      check("default member membership unchanged after becoming owner",
        !defaultMembershipAfterError &&
        defaultMembershipAfter?.role === defaultMembershipBefore?.role &&
        defaultMembershipAfter?.status === defaultMembershipBefore?.status &&
        defaultMembershipAfter?.joined_at === defaultMembershipBefore?.joined_at,
        `before: ${JSON.stringify(defaultMembershipBefore)}, after: ${JSON.stringify(defaultMembershipAfter)}`);

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", ownerSlug);
      await adminClient.auth.admin.deleteUser(userIdMember);
    }
  }
  console.log("");

  console.log("=== Test 18: Different owner raises PGY03 ===");
  {
    const conflictSlug = `conflict-slug-${Date.now()}`;
    const emailOwner2 = `owner2-${Date.now()}@example.com`;

    // Create second owner
    const { data: owner2User, error: owner2Error } = await adminClient.auth.admin.createUser({
      email: emailOwner2,
      password: "test-password-owner2",
      email_confirm: true,
    });

    check("second owner created", !owner2Error && !!owner2User?.user, owner2Error?.message);

    // Provision gym with first owner
    const { error: firstProvisionError } = await adminClient.rpc("provision_gym", {
      p_name: "Conflict Gym",
      p_slug: conflictSlug,
      p_timezone: "Asia/Kolkata",
      p_owner_email: emailOwner,
    });

    check("first provision succeeds", !firstProvisionError, firstProvisionError?.message);

    // Try to provision same slug with different owner
    const { error } = await adminClient.rpc("provision_gym", {
      p_name: "Conflict Gym 2",
      p_slug: conflictSlug,
      p_timezone: "America/New_York",
      p_owner_email: emailOwner2,
    });

    check("provision_gym returns error", !!error);
    check("error code is PGY03", error?.code === "PGY03", error?.code);
    check("error message is exact", error?.message === "Gym slug already exists with a different owner", error?.message);

    // Cleanup
    await adminClient.from("gyms").delete().eq("slug", conflictSlug);
    if (owner2User?.user?.id) {
      await adminClient.auth.admin.deleteUser(owner2User.user.id);
    }
  }
  console.log("");

  console.log("=== Test 19: prosecdef is true and proconfig contains search_path ===");
  {
    try {
      const prosecdef = await execPsql("SELECT prosecdef FROM pg_proc WHERE proname = 'provision_gym' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') LIMIT 1");
      const proconfigCheck = await execPsql("SELECT 'search_path=\"\"' = any(proconfig) FROM pg_proc WHERE proname = 'provision_gym' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') LIMIT 1");

      check("prosecdef is true", prosecdef === "t", `got ${prosecdef}`);
      check("proconfig contains search_path=\"\"", proconfigCheck === "t", `got ${proconfigCheck}`);

      // Check grants
      const anonGrant = await execPsql("SELECT has_function_privilege('anon', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute')");
      const authGrant = await execPsql("SELECT has_function_privilege('authenticated', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute')");
      const serviceGrant = await execPsql("SELECT has_function_privilege('service_role', 'public.provision_gym(text,text,text,text,text,text,text,text)', 'execute')");

      check("anon has no execute privilege", anonGrant === "f", `got ${anonGrant}`);
      check("authenticated has no execute privilege", authGrant === "f", `got ${authGrant}`);
      check("service_role has execute privilege", serviceGrant === "t", `got ${serviceGrant}`);
    } catch (err) {
      check("prosecdef/proconfig/grants check failed", false, String(err));
    }
  }
  console.log("");

  console.log("=== Test 20: Existing default gym owner can provision new gym ===");
  {
    // Create a user (gets default gym member membership via 035 trigger)
    const emailDefaultOwner = `default-owner-${Date.now()}@example.com`;
    const passwordDefaultOwner = "test-password-default";
    let userIdDefaultOwner: string | null = null;

    const { data: defaultOwnerUser, error: defaultOwnerError } = await adminClient.auth.admin.createUser({
      email: emailDefaultOwner,
      password: passwordDefaultOwner,
      email_confirm: true,
    });

    check("default owner user created", !defaultOwnerError && !!defaultOwnerUser?.user, defaultOwnerError?.message);
    userIdDefaultOwner = defaultOwnerUser?.user?.id || null;

    if (userIdDefaultOwner) {
      // Get the default gym
      const { data: defaultGym, error: defaultGymError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("slug", "default")
        .single();

      check("default gym exists", !defaultGymError && !!defaultGym, defaultGymError?.message);
      const defaultGymId = defaultGym?.id;

      // Make this user an active owner of default (mirroring prod)
      // The 035 trigger already created a member row; UPDATE it to owner
      const { error: updateOwnerError } = await adminClient
        .from("gym_memberships")
        .update({
          role: "owner",
          status: "active",
        })
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdDefaultOwner);

      check("default owner setup succeeds", !updateOwnerError, updateOwnerError?.message);

      // Verify the row is now owner
      const { data: verifyOwner, error: verifyOwnerError } = await adminClient
        .from("gym_memberships")
        .select("role, status")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdDefaultOwner)
        .single();

      check("default membership is now owner", !verifyOwnerError && verifyOwner?.role === "owner" && verifyOwner?.status === "active", 
        verifyOwnerError?.message || `role=${verifyOwner?.role}, status=${verifyOwner?.status}`);

      // Capture FULL default gym membership row before (all columns via to_jsonb)
      const { data: defaultMembershipBefore, error: defaultMembershipBeforeError } = await adminClient
        .from("gym_memberships")
        .select("*")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdDefaultOwner)
        .single();

      check("default membership snapshot succeeds", !defaultMembershipBeforeError && !!defaultMembershipBefore, defaultMembershipBeforeError?.message);

      // Capture user's profiles row before (member data)
      const { data: profileBefore, error: profileBeforeError } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", userIdDefaultOwner)
        .single();

      check("profile snapshot succeeds", !profileBeforeError && !!profileBefore, profileBeforeError?.message);

      // Capture default gym row before
      const { data: defaultGymBefore, error: defaultGymBeforeError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", defaultGymId)
        .single();

      check("default gym snapshot succeeds", !defaultGymBeforeError && !!defaultGymBefore, defaultGymBeforeError?.message);

      // Provision a new gym for this user
      const ironTempleSlug = `iron-temple-${Date.now()}`;
      const { data, error } = await adminClient.rpc("provision_gym", {
        p_name: "Iron Temple Fitness",
        p_slug: ironTempleSlug,
        p_timezone: "America/New_York",
        p_owner_email: emailDefaultOwner,
      });

      check("iron temple provision created", !error && data?.created === true, error?.message);

      // Assert user has exactly 2 active owner rows: default and iron-temple
      const { data: ownerMemberships, error: ownerMembershipsError } = await adminClient
        .from("gym_memberships")
        .select("gym_id, role, status")
        .eq("user_id", userIdDefaultOwner)
        .eq("role", "owner")
        .eq("status", "active");

      check("owner memberships query succeeds", !ownerMembershipsError, ownerMembershipsError?.message);

      const ironTempleGymId = data?.gym_id;
      check("user has exactly 2 active owner rows", ownerMemberships?.length === 2, `found ${ownerMemberships?.length}`);
      check("owner rows are default and iron-temple",
        (ownerMemberships?.some(m => m.gym_id === defaultGymId) ?? false) &&
        (ownerMemberships?.some(m => m.gym_id === ironTempleGymId) ?? false),
        `gym_ids: ${ownerMemberships?.map(m => m.gym_id).join(", ")}`);

      // Verify default membership row is byte-identical
      const { data: defaultMembershipAfter, error: defaultMembershipAfterError } = await adminClient
        .from("gym_memberships")
        .select("*")
        .eq("gym_id", defaultGymId)
        .eq("user_id", userIdDefaultOwner)
        .single();

      check("default membership after snapshot succeeds", !defaultMembershipAfterError && !!defaultMembershipAfter, defaultMembershipAfterError?.message);
      check("default membership byte-identical",
        JSON.stringify(defaultMembershipBefore) === JSON.stringify(defaultMembershipAfter),
        `before: ${JSON.stringify(defaultMembershipBefore)}, after: ${JSON.stringify(defaultMembershipAfter)}`);

      // Verify profile row is byte-identical
      const { data: profileAfter, error: profileAfterError } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", userIdDefaultOwner)
        .single();

      check("profile after snapshot succeeds", !profileAfterError && !!profileAfter, profileAfterError?.message);
      check("profile byte-identical",
        JSON.stringify(profileBefore) === JSON.stringify(profileAfter),
        `before: ${JSON.stringify(profileBefore)}, after: ${JSON.stringify(profileAfter)}`);

      // Verify default gym row is byte-identical
      const { data: defaultGymAfter, error: defaultGymAfterError } = await adminClient
        .from("gyms")
        .select("*")
        .eq("id", defaultGymId)
        .single();

      check("default gym after snapshot succeeds", !defaultGymAfterError && !!defaultGymAfter, defaultGymAfterError?.message);
      check("default gym byte-identical",
        JSON.stringify(defaultGymBefore) === JSON.stringify(defaultGymAfter),
        `before: ${JSON.stringify(defaultGymBefore)}, after: ${JSON.stringify(defaultGymAfter)}`);

      // Re-run is a no-op
      const { data: data2, error: error2 } = await adminClient.rpc("provision_gym", {
        p_name: "Iron Temple Fitness Updated",
        p_slug: ironTempleSlug,
        p_timezone: "Europe/London",
        p_owner_email: emailDefaultOwner,
      });

      check("iron temple re-run is idempotent", !error2 && data2?.created === false, error2?.message);

      // Cleanup
      await adminClient.from("gyms").delete().eq("slug", ironTempleSlug);
      await adminClient.auth.admin.deleteUser(userIdDefaultOwner);
    }
  }
  console.log("");

  // Cleanup
  console.log("Cleaning up test data...");

  // Delete test gyms
  await adminClient.from("gyms").delete().eq("slug", testSlug);
  await adminClient.from("gyms").delete().eq("slug", testSlug2);

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
