/**
 * Real database tests for gyms column lock (migration 043)
 * 
 * Verifies:
 * - Owner can update brand fields directly (display_name, logo_url, primary_color, accent_color)
 * - Owner can update brand fields via set_gym_branding RPC
 * - Owner is refused (GJC12) when attempting to update non-brand columns:
 *   - id, slug, name, timezone, created_at
 * - service_role can update any column (privileged bypass)
 * - Another gym's owner cannot update this gym (RLS blocks it)
 * 
 * Run: supabase start && REAL_DB=1 npm run test:gyms-column-lock-real-db
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
  // Import and check guard (LOW-5: fail if REAL_DB=1 but guard refuses)
  const { checkRealDbTest } = await import("./lib-db-reset-guard");
  const guardResult = checkRealDbTest();
  
  if (!guardResult.allow) {
    // LOW-5: If REAL_DB=1 but guard refuses, this is a configuration error - fail the test
    if (process.env.REAL_DB === "1") {
      console.error(`\n❌ REAL_DB=1 but guard check failed: ${guardResult.reason}\n`);
      return false;
    }
    // If REAL_DB is not set, skip is OK
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
  const emailOwner = `gym-owner-lock-${Date.now()}@example.com`;
  const passwordOwner = "test-password-123";
  const emailOtherOwner = `gym-other-owner-lock-${Date.now()}@example.com`;
  const passwordOtherOwner = "test-password-456";

  let userIdOwner: string | null = null;
  let userIdOtherOwner: string | null = null;

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

  // Create other owner
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

  console.log();

  // Get signed-in clients
  const clientOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientOtherOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const { error } = await clientOtherOwner.auth.signInWithPassword({
      email: emailOtherOwner,
      password: passwordOtherOwner,
    });
    if (error) {
      console.error("Failed to sign in other owner:", error);
      return false;
    }
  }

  console.log("✓ All users signed in\n");

  // Create test gym
  console.log("TEST: Create test gym");
  const gymId = randomUUID();
  const otherGymId = randomUUID();

  {
    const { error } = await adminClient.from("gyms").insert({
      id: gymId,
      slug: `gym-lock-test-${Date.now()}`,
      name: "Lock Test Gym",
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

  // Create other gym
  {
    const { error } = await adminClient.from("gyms").insert({
      id: otherGymId,
      slug: `other-gym-lock-${Date.now()}`,
      name: "Other Lock Gym",
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

  console.log();

  // TEST: Owner can update brand fields directly
  console.log("TEST: Owner can update brand fields directly");
  {
    const { error: displayError } = await clientOwner
      .from("gyms")
      .update({ display_name: "Updated Display" })
      .eq("id", gymId);
    check("Owner can update display_name", !displayError, displayError?.message);
    
    // Read back to verify
    const { data: afterDisplay } = await clientOwner
      .from("gyms")
      .select("display_name")
      .eq("id", gymId)
      .single();
    check("display_name persisted", afterDisplay?.display_name === "Updated Display");

    const { error: logoError } = await clientOwner
      .from("gyms")
      .update({ logo_url: "https://example.com/logo.png" })
      .eq("id", gymId);
    check("Owner can update logo_url", !logoError, logoError?.message);
    
    // Read back
    const { data: afterLogo } = await clientOwner
      .from("gyms")
      .select("logo_url")
      .eq("id", gymId)
      .single();
    check("logo_url persisted", afterLogo?.logo_url === "https://example.com/logo.png");

    const { error: colorsError } = await clientOwner
      .from("gyms")
      .update({ 
        primary_color: "#FF0000",
        accent_color: "#00FF00"
      })
      .eq("id", gymId);
    check("Owner can update colors", !colorsError, colorsError?.message);
    
    // Read back
    const { data: afterColors } = await clientOwner
      .from("gyms")
      .select("primary_color, accent_color")
      .eq("id", gymId)
      .single();
    check("primary_color persisted", afterColors?.primary_color === "#FF0000");
    check("accent_color persisted", afterColors?.accent_color === "#00FF00");
  }
  console.log();

  // TEST: Owner can update via set_gym_branding RPC
  console.log("TEST: Owner can update via set_gym_branding RPC");
  {
    const { error } = await clientOwner.rpc("set_gym_branding", {
      p_gym_id: gymId,
      p_display_name: "RPC Updated",
      p_logo_url: "https://example.com/rpc-logo.png",
      p_primary_color: "#0000FF",
      p_accent_color: "#FFFF00",
    });
    check("Owner can call set_gym_branding", !error, error?.message);
  }
  console.log();

  // TEST: Owner is refused when updating id (GJC12)
  console.log("TEST: Owner blocked from updating id (GJC12)");
  {
    // Get current id before attempt
    const { data: beforeId } = await clientOwner
      .from("gyms")
      .select("id")
      .eq("id", gymId)
      .single();
    
    const newId = randomUUID();
    const { error } = await clientOwner
      .from("gyms")
      .update({ id: newId })
      .eq("id", gymId);
    check("Update id blocked", !!error);
    check("Error code is GJC12", error?.code === "GJC12");
    check("Error message mentions non-brand", 
      !!error?.message?.toLowerCase().includes("non-brand"));
    
    // Verify id unchanged
    const { data: afterId } = await clientOwner
      .from("gyms")
      .select("id")
      .eq("id", gymId)
      .single();
    check("Id unchanged after blocked update", afterId?.id === beforeId?.id);
  }
  console.log();

  // TEST: Owner blocked from updating slug
  console.log("TEST: Owner blocked from updating slug (GJC12)");
  {
    // Get current slug before attempt
    const { data: beforeSlug } = await clientOwner
      .from("gyms")
      .select("slug")
      .eq("id", gymId)
      .single();
    
    const { error } = await clientOwner
      .from("gyms")
      .update({ slug: "hacked-slug" })
      .eq("id", gymId);
    check("Update slug blocked", !!error);
    check("Error code is GJC12", error?.code === "GJC12");
    
    // Verify slug unchanged
    const { data: afterSlug } = await clientOwner
      .from("gyms")
      .select("slug")
      .eq("id", gymId)
      .single();
    check("Slug unchanged after blocked update", afterSlug?.slug === beforeSlug?.slug);
  }
  console.log();

  // TEST: Owner blocked from updating name
  console.log("TEST: Owner blocked from updating name (GJC12)");
  {
    // Get current name before attempt
    const { data: beforeName } = await clientOwner
      .from("gyms")
      .select("name")
      .eq("id", gymId)
      .single();
    
    const { error } = await clientOwner
      .from("gyms")
      .update({ name: "Hacked Name" })
      .eq("id", gymId);
    check("Update name blocked", !!error);
    check("Error code is GJC12", error?.code === "GJC12");
    
    // Verify name unchanged
    const { data: afterName } = await clientOwner
      .from("gyms")
      .select("name")
      .eq("id", gymId)
      .single();
    check("Name unchanged after blocked update", afterName?.name === beforeName?.name);
  }
  console.log();

  // TEST: Owner blocked from updating timezone
  console.log("TEST: Owner blocked from updating timezone (GJC12)");
  {
    // Get current timezone before attempt
    const { data: beforeTz } = await clientOwner
      .from("gyms")
      .select("timezone")
      .eq("id", gymId)
      .single();
    
    const { error } = await clientOwner
      .from("gyms")
      .update({ timezone: "Asia/Tokyo" })
      .eq("id", gymId);
    check("Update timezone blocked", !!error);
    check("Error code is GJC12", error?.code === "GJC12");
    
    // Verify timezone unchanged
    const { data: afterTz } = await clientOwner
      .from("gyms")
      .select("timezone")
      .eq("id", gymId)
      .single();
    check("Timezone unchanged after blocked update", afterTz?.timezone === beforeTz?.timezone);
  }
  console.log();

  // TEST: Owner blocked from updating created_at
  console.log("TEST: Owner blocked from updating created_at (GJC12)");
  {
    // Get current created_at before attempt
    const { data: beforeCreated } = await clientOwner
      .from("gyms")
      .select("created_at")
      .eq("id", gymId)
      .single();
    
    const { error } = await clientOwner
      .from("gyms")
      .update({ created_at: new Date().toISOString() })
      .eq("id", gymId);
    check("Update created_at blocked", !!error);
    check("Error code is GJC12", error?.code === "GJC12");
    
    // Verify created_at unchanged
    const { data: afterCreated } = await clientOwner
      .from("gyms")
      .select("created_at")
      .eq("id", gymId)
      .single();
    check("created_at unchanged after blocked update", afterCreated?.created_at === beforeCreated?.created_at);
  }
  console.log();

  // TEST: service_role can update any column (privileged bypass)
  console.log("TEST: service_role can update any column");
  {
    const { error: nameError } = await adminClient
      .from("gyms")
      .update({ name: "Admin Updated Name" })
      .eq("id", gymId);
    check("service_role can update name", !nameError, nameError?.message);

    const { error: slugError } = await adminClient
      .from("gyms")
      .update({ slug: `admin-slug-${Date.now()}` })
      .eq("id", gymId);
    check("service_role can update slug", !slugError, slugError?.message);

    const newTimezone = "Asia/Kolkata";
    const { error: tzError } = await adminClient
      .from("gyms")
      .update({ timezone: newTimezone })
      .eq("id", gymId);
    check("service_role can update timezone", !tzError, tzError?.message);
    
    // Read back to verify timezone persisted
    const { data: afterTz } = await adminClient
      .from("gyms")
      .select("timezone")
      .eq("id", gymId)
      .single();
    check("service_role timezone persisted", afterTz?.timezone === newTimezone);
  }
  console.log();
  
  // TEST: postgres direct update also bypasses trigger (mutant (l))
  console.log("TEST: postgres direct update works");
  {
    // Use psql to update as postgres (superuser bypass)
    const childProcess = await import("child_process");
    const { execSync } = childProcess;
    const dbUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";
    
    try {
      // Update timezone as postgres
      execSync(`psql -v ON_ERROR_STOP=1 "${dbUrl}" -c "UPDATE public.gyms SET timezone = 'America/Denver' WHERE id = '${gymId}';"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // Read back to verify
      const { data: afterPg } = await adminClient
        .from("gyms")
        .select("timezone")
        .eq("id", gymId)
        .single();
      check("postgres direct update works", afterPg?.timezone === "America/Denver");
    } catch (err) {
      check("postgres direct update works", false, `psql failed: ${err}`);
    }
  }
  console.log();
  
  // TEST: Future column update blocked (mutant (n))
  console.log("TEST: Future column update blocked");
  {
    // Always create temp_future_col to test trigger blocks it
    const childProcess2 = await import("child_process");
    const { execSync } = childProcess2;
    const dbUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";
    
    try {
      // Add the column
      execSync(`psql -v ON_ERROR_STOP=1 "${dbUrl}" -c "ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS temp_future_col text;"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // Try to update it as owner (should be blocked by trigger)
      execSync(`psql -v ON_ERROR_STOP=1 "${dbUrl}" -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '${userIdOwner}', 'role', 'authenticated')::text, false); UPDATE public.gyms SET temp_future_col = 'hacked' WHERE id = '${gymId}';"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // If we get here, the update succeeded (should not happen)
      check("Future column update blocked", false, "Update succeeded when it should have been blocked");
    } catch (err) {
      // Expected: trigger should block with GJC12
      const errStr = String(err);
      check("Future column update blocked", errStr.includes("GJC12"), `Error: ${errStr.substring(0, 100)}`);
    }
  }
  console.log();

  // TEST: Other gym's owner still cannot touch this gym (RLS)
  console.log("TEST: Other gym's owner cannot update this gym (RLS)");
  {
    // RLS blocks it before the trigger fires, so we expect 0 rows affected
    const { data, error } = await clientOtherOwner
      .from("gyms")
      .update({ display_name: "Hacked by Other Owner" })
      .eq("id", gymId)
      .select();
    check("Other owner UPDATE affects 0 rows", !error && (!data || data.length === 0));
  }
  console.log();

  // MED-2: Test CHECK constraints reject bad values on direct owner UPDATE
  console.log("TEST: CHECK constraints reject bad logo/color on direct UPDATE (MED-2)");
  {
    // Invalid logo: leading space + https
    const { error: logo1 } = await clientOwner
      .from("gyms")
      .update({ logo_url: " https://example.com/logo.png" })
      .eq("id", gymId);
    check("Logo with leading space rejected", !!logo1);
    check("SQLSTATE 23514 (check_violation)", logo1?.code === "23514");
    check("Constraint name: gyms_logo_url_format", 
      !!logo1?.message?.includes("gyms_logo_url_format"));

    // javascript: protocol
    const { error: logo2 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "javascript:alert('https://')" })
      .eq("id", gymId);
    check("javascript: logo rejected", !!logo2);
    check("SQLSTATE 23514", logo2?.code === "23514");
    check("Constraint name: gyms_logo_url_format",
      !!logo2?.message?.includes("gyms_logo_url_format"));

    // #RGB (3-digit hex) - test primary only
    const { error: color1 } = await clientOwner
      .from("gyms")
      .update({ 
        primary_color: "#fff",
        accent_color: "#000000"
      })
      .eq("id", gymId);
    check("#RGB rejected", !!color1);
    check("SQLSTATE 23514", color1?.code === "23514");
    check("Constraint name: gyms_primary_color_hex",
      !!color1?.message?.includes("gyms_primary_color_hex"));

    // Hex with trailing ;} - test primary only
    const { error: color2 } = await clientOwner
      .from("gyms")
      .update({ 
        primary_color: "#FFFFFF;}",
        accent_color: "#000000"
      })
      .eq("id", gymId);
    check("Primary hex with trailing rejected", !!color2);
    check("SQLSTATE 23514", color2?.code === "23514");

    // Hex with trailing ;} - test accent only
    const { error: color2a} = await clientOwner
      .from("gyms")
      .update({ 
        primary_color: "#FF9A2E",
        accent_color: "#000000;}"
      })
      .eq("id", gymId);
    check("Accent hex with trailing rejected", !!color2a);
    check("SQLSTATE 23514", color2a?.code === "23514");

    // 8-digit hex (RGBA)
    const { error: color3 } = await clientOwner
      .from("gyms")
      .update({ 
        primary_color: "#FFFFFFFF",
        accent_color: "#00000000"
      })
      .eq("id", gymId);
    check("8-digit hex rejected", !!color3);
    check("SQLSTATE 23514", color3?.code === "23514");

    // Uppercase HTTPS:// protocol
    const { error: logo3 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "HTTPS://example.com/logo.png" })
      .eq("id", gymId);
    check("Uppercase HTTPS:// rejected", !!logo3);
    check("SQLSTATE 23514", logo3?.code === "23514");
    check("Constraint name: gyms_logo_url_format",
      !!logo3?.message?.includes("gyms_logo_url_format"));

    // Newline in logo URL
    const { error: logo4 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "https://x\n" })
      .eq("id", gymId);
    check("Newline in logo rejected", !!logo4);
    check("SQLSTATE 23514", logo4?.code === "23514");

    // .. path traversal
    const { error: logo5 } = await clientOwner
      .from("gyms")
      .update({ logo_url: "/storage/../x" })
      .eq("id", gymId);
    check(".. path traversal rejected", !!logo5);
    check("SQLSTATE 23514", logo5?.code === "23514");
  }
  console.log();

  // TEST: Length constraints via direct UPDATE (LOW-2)
  console.log("TEST: Length constraints on direct UPDATE (LOW-2)");
  {
    // display_name over 100 characters
    const longDisplayName = "A".repeat(101);
    const { error: displayError } = await clientOwner
      .from("gyms")
      .update({ display_name: longDisplayName })
      .eq("id", gymId);
    check("display_name over 100 chars rejected", !!displayError);
    check("SQLSTATE 23514 (check_violation)", displayError?.code === "23514");
    check("Constraint name: gyms_display_name_length",
      !!displayError?.message?.includes("gyms_display_name_length"));

    // logo_url over 2048 characters
    const longLogoUrl = "https://example.com/" + "x".repeat(2030);
    const { error: logoError } = await clientOwner
      .from("gyms")
      .update({ logo_url: longLogoUrl })
      .eq("id", gymId);
    check("logo_url over 2048 chars rejected", !!logoError);
    check("SQLSTATE 23514 (check_violation)", logoError?.code === "23514");
    check("Constraint name: gyms_logo_url_length",
      !!logoError?.message?.includes("gyms_logo_url_length"));
  }
  console.log();

  // Clean up test gyms
  console.log("Cleaning up test gyms...");
  {
    const { error: gym1Error } = await adminClient.from("gyms").delete().eq("id", gymId);
    check("Test gym deleted", !gym1Error, gym1Error?.message);
    
    const { error: gym2Error } = await adminClient.from("gyms").delete().eq("id", otherGymId);
    check("Other gym deleted", !gym2Error, gym2Error?.message);
  }
  
  // TEST: Multi-gym owner (LOW-11)
  console.log("TEST: Multi-gym owner can't change other gym");
  {
    // Make ownerA also an owner of otherGym
    const { error: addMembershipError } = await adminClient
      .from("gym_memberships")
      .insert({
        gym_id: otherGymId,
        user_id: userIdOwner,
        role: "owner"
      });
    check("ownerA added to gym B", !addMembershipError, addMembershipError?.message);
    
    // Set distinct display_name for each gym
    await adminClient.from("gyms").update({ display_name: "Gym A Display" }).eq("id", gymId);
    await adminClient.from("gyms").update({ display_name: "Gym B Display" }).eq("id", otherGymId);
    
    // ownerA tries to update gym B's name (should be blocked by RLS)
    const { error: crossUpdateError, data: crossData } = await clientOwner
      .from("gyms")
      .update({ name: "Hacked Gym B" })
      .eq("id", otherGymId)
      .select();
    
    // RLS should block it (0 rows affected, not a GJC12 error)
    check("ownerA can't UPDATE gym B (RLS blocks)", !crossUpdateError && (!crossData || crossData.length === 0));
    
    // Verify both gyms kept their own values
    const { data: gymAAfter } = await adminClient.from("gyms").select("display_name").eq("id", gymId).single();
    const { data: gymBAfter } = await adminClient.from("gyms").select("display_name").eq("id", otherGymId).single();
    
    check("Gym A kept its display_name", gymAAfter?.display_name === "Gym A Display");
    check("Gym B kept its display_name", gymBAfter?.display_name === "Gym B Display");
  }
  console.log();

  // Clean up temp column
  console.log("Cleaning up temp column...");
  {
    try {
      const childProcess3 = await import("child_process");
      const { execSync: execSync3 } = childProcess3;
      const dbUrl = process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres";
      execSync3(`psql "${dbUrl}" -c "ALTER TABLE public.gyms DROP COLUMN IF EXISTS temp_future_col;"`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (err) {
      console.log(`Warning: Failed to drop temp column: ${err}`);
    }
  }

  // Clean up test gyms
  console.log("Cleaning up test gyms...");
  {
    const { error: gym1Error } = await adminClient.from("gyms").delete().eq("id", gymId);
    if (gym1Error) console.log(`Warning: Failed to delete test gym: ${gym1Error.message}`);
    
    const { error: gym2Error } = await adminClient.from("gyms").delete().eq("id", otherGymId);
    if (gym2Error) console.log(`Warning: Failed to delete other gym: ${gym2Error.message}`);
  }
  
  // Clean up test users
  console.log("Cleaning up test users...");
  if (userIdOwner) await adminClient.auth.admin.deleteUser(userIdOwner);
  if (userIdOtherOwner) await adminClient.auth.admin.deleteUser(userIdOtherOwner);
  console.log("✓ Test cleanup complete\n");

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
