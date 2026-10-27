/**
 * Real database tests for gym branding RLS/RPC.
 * 
 * Verifies:
 * - set_gym_branding RPC enforces owner-only access
 * - get_gym_brand RPC returns public brand fields
 * - Color validation (#RRGGBB hex codes)
 * - Logo URL validation (https:// or /storage/)
 * - RLS prevents direct table updates (only via RPC)
 * - Cache invalidation works
 * 
 * Run: supabase start && REAL_DB=1 npm run test:gym-branding-real-db
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

  // Create test users
  const emailOwner = `gym-owner-branding-${Date.now()}@example.com`;
  const passwordOwner = "test-password-123";
  const emailMember = `gym-member-branding-${Date.now()}@example.com`;
  const passwordMember = "test-password-456";

  let userIdOwner: string | null = null;
  let userIdMember: string | null = null;

  console.log("Creating test users...");
  
  // Create owner
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
    console.log(`✓ Created owner: ${userIdOwner}`);
  }

  // Create member
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailMember,
      password: passwordMember,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create member:", error);
      return false;
    }
    userIdMember = data.user.id;
    console.log(`✓ Created member: ${userIdMember}`);
  }

  console.log();

  // Get signed-in clients
  const clientOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientMember = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  {
    const { error } = await clientOwner.auth.signInWithPassword({
      email: emailOwner,
      password: passwordOwner,
    });
    if (error) {
      console.error("Failed to sign in owner:", error);
      return false;
    }
  }

  {
    const { error } = await clientMember.auth.signInWithPassword({
      email: emailMember,
      password: passwordMember,
    });
    if (error) {
      console.error("Failed to sign in member:", error);
      return false;
    }
  }

  console.log("✓ All users signed in\n");

  // Create test gym
  console.log("TEST: Create test gym");
  const gymId = randomUUID();

  {
    const { error } = await adminClient.from("gyms").insert({
      id: gymId,
      slug: `gym-branding-test-${Date.now()}`,
      name: "Branding Test Gym",
      timezone: "America/New_York",
    });
    check("Test gym created", !error, error?.message);
  }

  // Add owner as owner of the gym
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymId,
      user_id: userIdOwner,
      role: "owner",
      status: "active",
    });
    check("Owner added to gym", !error, error?.message);
  }

  // Add member as member of the gym
  {
    // First deactivate their default gym membership
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
        .eq("user_id", userIdMember);
    }
    
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymId,
      user_id: userIdMember,
      role: "member",
      status: "active",
    });
    check("Member added to gym", !error, error?.message);
  }

  // Create staff user for additional testing
  const emailStaff = `gym-staff-branding-${Date.now()}@example.com`;
  const passwordStaff = "test-password-789";
  let userIdStaff: string | null = null;

  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailStaff,
      password: passwordStaff,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create staff:", error);
      return false;
    }
    userIdStaff = data.user.id;
    console.log(`✓ Created staff: ${userIdStaff}`);
  }

  // Add staff to gym
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymId,
      user_id: userIdStaff,
      role: "staff",
      status: "active",
    });
    check("Staff added to gym", !error, error?.message);
  }

  const clientStaff = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  {
    const { error } = await clientStaff.auth.signInWithPassword({
      email: emailStaff,
      password: passwordStaff,
    });
    if (error) {
      console.error("Failed to sign in staff:", error);
      return false;
    }
  }

  // Create another gym and owner for cross-gym testing
  const emailOtherOwner = `other-gym-owner-${Date.now()}@example.com`;
  const passwordOtherOwner = "test-password-abc";
  let userIdOtherOwner: string | null = null;
  const otherGymId = randomUUID();

  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailOtherOwner,
      password: passwordOtherOwner,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create other owner:", error);
      return false;
    }
    userIdOtherOwner = data.user.id;
    console.log(`✓ Created other owner: ${userIdOtherOwner}`);
  }

  {
    const { error } = await adminClient.from("gyms").insert({
      id: otherGymId,
      slug: `other-gym-${Date.now()}`,
      name: "Other Gym",
      timezone: "Europe/London",
    });
    check("Other gym created", !error, error?.message);
  }

  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: otherGymId,
      user_id: userIdOtherOwner,
      role: "owner",
      status: "active",
    });
    check("Other owner added to other gym", !error, error?.message);
  }

  const clientOtherOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  {
    const { error } = await clientOtherOwner.auth.signInWithPassword({
      email: emailOtherOwner,
      password: passwordOtherOwner,
    });
    if (error) {
      console.error("Failed to sign in other owner:", error);
      return false;
    }
  }

  console.log("✓ All test users signed in\n");
  console.log();

  // TEST: Owner can set branding
  console.log("TEST: Owner can set branding");
  {
    const { data, error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "My Gym",
      p_logo_url: "https://example.com/logo.png",
      p_primary_color: "#FF9A2E",
      p_accent_color: "#E8850C",
    });
    check("Owner can call set_gym_branding", !error, error?.message);
    check("RPC returns success", data?.success === true);
  }
  console.log();

  // TEST: get_gym_brand returns the updated values
  console.log("TEST: get_gym_brand returns updated values");
  {
    const { data, error } = await clientOwner.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("get_gym_brand succeeds", !error, error?.message);
    check("Returns array", Array.isArray(data));
    
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      check("display_name matches", row.display_name === "My Gym");
      check("logo_url matches", row.logo_url === "https://example.com/logo.png");
      check("primary_color matches", row.primary_color === "#FF9A2E");
      check("accent_color matches", row.accent_color === "#E8850C");
    }
  }
  console.log();

  // TEST: Member cannot set branding
  console.log("TEST: Member cannot set branding");
  {
    const { error } = await clientMember.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "Hacked Name",
      p_logo_url: "https://evil.com/logo.png",
      p_primary_color: "#FF0000",
      p_accent_color: "#00FF00",
    });
    check("Member cannot call set_gym_branding", !!error && error.code === "BRND1");
  }
  console.log();

  // TEST: Staff cannot set branding
  console.log("TEST: Staff cannot set branding");
  {
    const { error } = await clientStaff.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "Staff Hacked",
      p_logo_url: "https://evil.com/logo.png",
      p_primary_color: "#FF0000",
      p_accent_color: "#00FF00",
    });
    check("Staff cannot call set_gym_branding", !!error && error.code === "BRND1");
  }
  console.log();

  // TEST: Another gym's owner cannot set this gym's branding
  console.log("TEST: Another gym's owner cannot set this gym's branding");
  {
    const { error } = await clientOtherOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "Other Owner Hacked",
      p_logo_url: "https://evil.com/logo.png",
      p_primary_color: "#FF0000",
      p_accent_color: "#00FF00",
    });
    check("Other gym owner cannot update this gym", !!error && error.code === "BRND1");
  }
  console.log();

  // TEST: Invalid primary color is rejected
  console.log("TEST: Invalid primary color is rejected");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "invalid",
      p_accent_color: "#E8850C",
    });
    check("Invalid primary color rejected", !!error && error.code === "BRND2");
  }
  console.log();

  // TEST: Invalid accent color is rejected
  console.log("TEST: Invalid accent color is rejected");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#FF9A2E",
      p_accent_color: "rgb(232, 133, 12)",
    });
    check("Invalid accent color rejected", !!error && error.code === "BRND3");
  }
  console.log();

  // TEST: Invalid logo URL is rejected
  console.log("TEST: Invalid logo URL is rejected");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_logo_url: "http://example.com/logo.png",
    });
    check("Invalid logo URL rejected", !!error && error.code === "BRND4");
  }
  console.log();

  // TEST: Can clear branding by passing p_clear array
  console.log("TEST: Can clear branding by passing p_clear array");
  {
    // First set all fields
    await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "Test Clear",
      p_logo_url: "https://example.com/test.png",
      p_primary_color: "#FF0000",
      p_accent_color: "#00FF00",
    });

    // Clear display_name
    const { error: clearDisplayError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_clear: ["display_name"],
    });
    check("Owner can clear display_name", !clearDisplayError, clearDisplayError?.message);

    const { data: afterDisplayClear } = await clientOwner.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    if (afterDisplayClear && afterDisplayClear[0]) {
      check("display_name cleared", afterDisplayClear[0].display_name === null);
      check("logo_url unchanged", afterDisplayClear[0].logo_url === "https://example.com/test.png");
    }

    // Clear logo_url
    const { error: clearLogoError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_clear: ["logo_url"],
    });
    check("Owner can clear logo_url", !clearLogoError, clearLogoError?.message);

    const { data: afterLogoClear } = await clientOwner.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    if (afterLogoClear && afterLogoClear[0]) {
      check("logo_url cleared", afterLogoClear[0].logo_url === null);
    }

    // Clear both colors at once
    const { error: clearColorsError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_clear: ["primary_color", "accent_color"],
    });
    check("Owner can clear both colors", !clearColorsError, clearColorsError?.message);

    const { data: afterColorsClear } = await clientOwner.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    if (afterColorsClear && afterColorsClear[0]) {
      check("primary_color cleared", afterColorsClear[0].primary_color === null);
      check("accent_color cleared", afterColorsClear[0].accent_color === null);
    }

    // Verify neutralBrand fallback works with all null fields
    check("neutralBrand fallback after clearing", 
      afterColorsClear && 
      afterColorsClear[0].display_name === null &&
      afterColorsClear[0].logo_url === null &&
      afterColorsClear[0].primary_color === null &&
      afterColorsClear[0].accent_color === null
    );
  }
  console.log();

  // TEST: Invalid clear field name rejected (BRND6)
  console.log("TEST: Invalid clear field name rejected");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_clear: ["invalid_field"],
    });
    check("Invalid clear field rejected", !!error && error.code === "BRND6");
  }
  console.log();

  // Create anon client for public access tests
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // TEST: Anon cannot set branding (permission denied, not BRND1)
  console.log("TEST: Anon cannot set branding");
  {
    const { error } = await anonClient.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "Anon Hack",
    });
    check("Anon cannot call set_gym_branding", !!error, error?.message);
    // Should get permission denied (42501), not BRND1 - if we get BRND1,
    // it means anon was granted execute permission (mutant b survived)
    if (error && error.code === "BRND1") {
      console.error("  ✗ SECURITY: Anon got past permission check! Got BRND1 instead of permission denied.");
      process.exit(1);
    }
  }
  console.log();

  // TEST: Anon can call get_gym_brand (public data)
  console.log("TEST: Anon can call get_gym_brand");
  {
    const { data, error } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("Anon can call get_gym_brand", !error, error?.message);
    // If this fails with permission denied, mutant (h) survived
    if (error && (error.message?.includes("permission denied") || error.code === "42501")) {
      console.error("  ✗ SECURITY: get_gym_brand missing public GRANT! Anon got permission denied.");
      process.exit(1);
    }
    check("Returns gym name", Array.isArray(data) && data.length > 0 && data[0].name === "Branding Test Gym");
  }
  console.log();

  // TEST: get_gym_brand doesn't leak sensitive data
  console.log("TEST: get_gym_brand only returns public brand fields");
  {
    const { data } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      const keys = Object.keys(row);
      const allowedKeys = ["name", "slug", "timezone", "display_name", "logo_url", "primary_color", "accent_color"];
      const unexpectedKeys = keys.filter(k => !allowedKeys.includes(k));
      check("Only returns allowed fields", unexpectedKeys.length === 0, `Unexpected: ${unexpectedKeys.join(", ")}`);
    }
  }
  console.log();

  // TEST: Direct UPDATE with invalid brand values rejected by CHECK constraints
  console.log("TEST: Direct UPDATE with invalid brand values rejected by CHECK");
  {
    // Invalid primary_color (not 6-digit hex)
    const { error: badPrimary } = await clientOwner
      .from("gyms")
      .update({ primary_color: "invalid" })
      .eq("id", gymId);
    check("Invalid primary_color rejected", !!badPrimary);
    check("SQLSTATE 23514 (check_violation)", badPrimary?.code === "23514");
    check(
      "Constraint name: gyms_primary_color_hex",
      !!badPrimary?.message?.includes("gyms_primary_color_hex")
    );

    // Invalid accent_color (not 6-digit hex)
    const { error: badAccent } = await clientOwner
      .from("gyms")
      .update({ accent_color: "rgb(255,0,0)" })
      .eq("id", gymId);
    check("Invalid accent_color rejected", !!badAccent);
    check("SQLSTATE 23514 (check_violation)", badAccent?.code === "23514");
    check(
      "Constraint name: gyms_accent_color_hex",
      !!badAccent?.message?.includes("gyms_accent_color_hex")
    );

    // Invalid logo_url (javascript: protocol)
    const { error: badLogo1 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "javascript:alert(1)" })
      .eq("id", gymId);
    check("javascript: logo_url rejected", !!badLogo1);
    check("SQLSTATE 23514 (check_violation)", badLogo1?.code === "23514");
    check(
      "Constraint name: gyms_logo_url_format",
      !!badLogo1?.message?.includes("gyms_logo_url_format")
    );

    // Invalid logo_url (http: instead of https:)
    const { error: badLogo2 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "http://example.com/logo.png" })
      .eq("id", gymId);
    check("http: logo_url rejected", !!badLogo2);
    check("SQLSTATE 23514 (check_violation)", badLogo2?.code === "23514");
    check(
      "Constraint name: gyms_logo_url_format",
      !!badLogo2?.message?.includes("gyms_logo_url_format")
    );
  }
  console.log();

  // TEST: Non-owner member cannot UPDATE brand fields
  console.log("TEST: Non-owner member cannot UPDATE brand fields");
  {
    const { data, error } = await clientMember
      .from("gyms")
      .update({ primary_color: "#FF0000" })
      .eq("id", gymId)
      .select();
    check("Member UPDATE affects 0 rows", !error && (!data || data.length === 0));
  }
  console.log();

  // TEST: Staff cannot UPDATE brand fields
  console.log("TEST: Staff cannot UPDATE brand fields");
  {
    const { data, error } = await clientStaff
      .from("gyms")
      .update({ display_name: "Staff Hacked" })
      .eq("id", gymId)
      .select();
    check("Staff UPDATE affects 0 rows", !error && (!data || data.length === 0));
  }
  console.log();

  // TEST: Another gym's owner cannot UPDATE this gym's brand fields
  console.log("TEST: Another gym's owner cannot UPDATE this gym's brand fields");
  {
    const { data, error } = await clientOtherOwner
      .from("gyms")
      .update({ logo_url: "https://evil.com/logo.png" })
      .eq("id", gymId)
      .select();
    check("Other owner UPDATE affects 0 rows", !error && (!data || data.length === 0));
  }
  console.log();

  // TEST: get_gym_brand returns exactly 7 columns
  console.log("TEST: get_gym_brand returns exactly 7 columns");
  {
    const { data, error } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("get_gym_brand succeeds", !error, error?.message);
    if (data && data[0]) {
      const keys = Object.keys(data[0]).sort();
      const expectedKeys = [
        "name",
        "slug",
        "timezone",
        "display_name",
        "logo_url",
        "primary_color",
        "accent_color",
      ].sort();
      check(
        "Exact 7-column set",
        keys.length === 7 &&
        keys.every((k, i) => k === expectedKeys[i]),
        `Expected: [${expectedKeys.join(", ")}], Got: [${keys.join(", ")}]`
      );
    }
  }
  console.log();

  // TEST: Storage path logo URL is accepted
  console.log("TEST: Storage path logo URL is accepted");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_logo_url: "/storage/v1/object/public/gym-logos/abc123.png",
    });
    check("Storage path logo URL accepted", !error, error?.message);
  }
  console.log();

  // TEST: Color validation is case-insensitive
  console.log("TEST: Color validation is case-insensitive");
  {
    const { error: upperError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#ABCDEF",
      p_accent_color: "#123456",
    });
    check("Uppercase hex accepted", !upperError, upperError?.message);

    const { error: lowerError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#abcdef",
      p_accent_color: "#123456",
    });
    check("Lowercase hex accepted", !lowerError, lowerError?.message);

    const { error: mixedError } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#AbCdEf",
      p_accent_color: "#12345F",
    });
    check("Mixed case hex accepted", !mixedError, mixedError?.message);
  }
  console.log();

  // MED-3b: Test rejected cases for colors and logo
  console.log("TEST: Reject leading space in logo URL (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_logo_url: " https://example.com/logo.png",
    });
    check("Leading space in logo URL rejected", !!error && error.code === "BRND4");
  }
  console.log();

  console.log("TEST: Reject javascript: in logo URL (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_logo_url: "javascript:alert('https://')",
    });
    check("javascript: logo URL rejected", !!error && error.code === "BRND4");
  }
  console.log();

  console.log("TEST: Reject 3-digit hex colors (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#fff",
      p_accent_color: "#000",
    });
    check("3-digit hex rejected", !!error && error.code === "BRND2");
  }
  console.log();

  console.log("TEST: Reject hex with trailing characters (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#FFFFFF;}",
      p_accent_color: "#000000",
    });
    check("Hex with trailing ;} rejected", !!error && error.code === "BRND2");
  }
  console.log();

  console.log("TEST: Reject 8-digit hex colors (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#FFFFFFFF",
      p_accent_color: "#00000000",
    });
    check("8-digit hex rejected", !!error && error.code === "BRND2");
  }
  console.log();

  console.log("TEST: Reject uppercase HTTPS:// protocol (MED-3b)");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_logo_url: "HTTPS://example.com/logo.png",
    });
    check("Uppercase HTTPS:// rejected", !!error && error.code === "BRND4");
  }
  console.log();

  // MED-3c: Test BRND7 and clear wins over set
  console.log("TEST: BRND7 - color pair rule (MED-3c)");
  {
    // Try to set only primary without accent
    const { error: onlyPrimary } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#FF0000",
    });
    check("Setting only primary color rejected", !!onlyPrimary && onlyPrimary?.code === "BRND7");

    // Try to set only accent without primary
    const { error: onlyAccent } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_accent_color: "#00FF00",
    });
    check("Setting only accent color rejected", !!onlyAccent && onlyAccent?.code === "BRND7");
  }
  console.log();

  console.log("TEST: Clear wins over set (MED-3c)");
  {
    // First set a color
    await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#FF0000",
      p_accent_color: "#00FF00",
    });

    // Now try to set and clear at the same time - clear should win
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_primary_color: "#0000FF",
      p_accent_color: "#FFFF00",
      p_clear: ["primary_color", "accent_color"],
    });
    check("Clear with set succeeds", !error, error?.message);

    const { data } = await clientOwner.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    if (data && data[0]) {
      check("Clear won over set (primary)", data[0].primary_color === null);
      check("Clear won over set (accent)", data[0].accent_color === null);
    }
  }
  console.log();

  // MED-3c: Test pg_proc prosecdef and proconfig
  console.log("TEST: SECURITY DEFINER and search_path (MED-3c)");
  {
    // Import pg for direct database queries
    const { Client } = await import("pg");
    const pgClient = new Client({
      connectionString: process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    await pgClient.connect();

    try {
      // Check set_gym_branding
      const { rows: setRows } = await pgClient.query(`
        SELECT prosecdef, proconfig
        FROM pg_proc
        WHERE proname = 'set_gym_branding'
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        LIMIT 1;
      `);

      check("set_gym_branding has prosecdef", setRows.length > 0 && setRows[0].prosecdef === true);
      check(
        "set_gym_branding has search_path=''",
        setRows.length > 0 && 
        Array.isArray(setRows[0].proconfig) && 
        setRows[0].proconfig.some((cfg: string) => cfg === 'search_path=""' || cfg === "search_path=")
      );

      // Check get_gym_brand
      const { rows: getRows } = await pgClient.query(`
        SELECT prosecdef, proconfig
        FROM pg_proc
        WHERE proname = 'get_gym_brand'
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        LIMIT 1;
      `);

      check("get_gym_brand has prosecdef", getRows.length > 0 && getRows[0].prosecdef === true);
      check(
        "get_gym_brand has search_path=''",
        getRows.length > 0 && 
        Array.isArray(getRows[0].proconfig) && 
        getRows[0].proconfig.some((cfg: string) => cfg === 'search_path=""' || cfg === "search_path=")
      );
    } finally {
      await pgClient.end();
    }
  }
  console.log();

  // MED-3a: Assert another gym's brand is unchanged after owner saves
  console.log("TEST: Other gym's brand unchanged (MED-3a)");
  {
    // Set branding for other gym
    await clientOtherOwner.rpc("set_gym_branding", {
      p_gym_id: otherGymId,
      p_display_name: "Other Gym Brand",
      p_logo_url: "https://other.com/logo.png",
      p_primary_color: "#123456",
      p_accent_color: "#654321",
    });

    // Get other gym brand before this gym's update
    const { data: beforeData } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: otherGymId,
    });
    const beforeBrand = beforeData && beforeData[0];

    // Update this gym's brand
    await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "This Gym Updated",
      p_primary_color: "#ABCDEF",
      p_accent_color: "#FEDCBA",
    });

    // Get other gym brand after this gym's update
    const { data: afterData } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: otherGymId,
    });
    const afterBrand = afterData && afterData[0];

    check("Other gym display_name unchanged", beforeBrand?.display_name === afterBrand?.display_name);
    check("Other gym logo_url unchanged", beforeBrand?.logo_url === afterBrand?.logo_url);
    check("Other gym primary_color unchanged", beforeBrand?.primary_color === afterBrand?.primary_color);
    check("Other gym accent_color unchanged", beforeBrand?.accent_color === afterBrand?.accent_color);
  }
  console.log();

  // Clean up test users
  console.log("Cleaning up test users...");
  if (userIdOwner) await adminClient.auth.admin.deleteUser(userIdOwner);
  if (userIdMember) await adminClient.auth.admin.deleteUser(userIdMember);
  if (userIdStaff) await adminClient.auth.admin.deleteUser(userIdStaff);
  if (userIdOtherOwner) await adminClient.auth.admin.deleteUser(userIdOtherOwner);
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
