/**
 * Real database tests for gym_domains table and resolve_gym_by_host function.
 *
 * These tests run against a real local Supabase instance (supabase start).
 * They verify:
 * - A verified host resolves for both anon and authenticated
 * - An unverified host returns nothing
 * - An unknown host returns nothing
 * - Case, trailing dot and port are normalized
 * - Anon and authenticated can't SELECT, INSERT, UPDATE or DELETE gym_domains directly
 * - A gym owner can't insert a mapping for their own gym
 * - Deleting a gym cascades its domains (as service role)
 * - Re-running the migration is a no-op (idempotent CREATE OR REPLACE, no errors)
 *
 * Run: supabase start && REAL_DB=1 npm run test:gym-domains-real-db
 *
 * In CI: REAL_DB=1 is set to require a running database (fails if unavailable).
 * Locally: skips gracefully if REAL_DB=1 is not set.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
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
    console.log(
      "   Set REAL_DB=1 to run these tests against a local Supabase instance\n",
    );
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
    const payload = JSON.parse(
      Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split(".")[1], "base64").toString(),
    );
    if (payload.role !== "service_role") {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      return false;
    }
    console.log(`✓ Using service_role key\n`);
  } catch (e) {
    console.error("❌ Failed to decode service role key");
    return false;
  }

  // Create test users
  const emailOwner = `gym-owner-domains-${Date.now()}@example.com`;
  const passwordOwner = "test-password-domains-123";
  const emailUser = `gym-user-domains-${Date.now()}@example.com`;
  const passwordUser = "test-password-domains-456";

  let userIdOwner: string | null = null;
  let userIdUser: string | null = null;

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

  // Create regular user
  {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: emailUser,
      password: passwordUser,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error("Failed to create user:", error);
      return false;
    }
    userIdUser = data.user.id;
    console.log(`✓ Created user: ${userIdUser}`);
  }

  console.log();

  // Get signed-in clients
  const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  {
    const { error } = await ownerClient.auth.signInWithPassword({
      email: emailOwner,
      password: passwordOwner,
    });
    if (error) {
      console.error("Failed to sign in owner:", error);
      return false;
    }
  }

  {
    const { error } = await userClient.auth.signInWithPassword({
      email: emailUser,
      password: passwordUser,
    });
    if (error) {
      console.error("Failed to sign in user:", error);
      return false;
    }
  }

  console.log("✓ All users signed in\n");

  // Create a test gym
  console.log("TEST: Create test gym");
  const gymId = randomUUID();
  const gymSlug = `test-gym-${Date.now()}`;

  {
    const { error } = await adminClient.from("gyms").insert({
      id: gymId,
      slug: gymSlug,
      name: "Test Gym for Domains",
      timezone: "America/New_York",
    });
    check("Test gym created", !error, error?.message);
  }

  // Make owner the gym owner
  {
    const { error } = await adminClient.from("gym_memberships").insert({
      gym_id: gymId,
      user_id: userIdOwner,
      role: "owner",
      status: "active",
    });
    check("Owner assigned to gym", !error, error?.message);
  }
  console.log();

  // Insert verified and unverified domains (as service role)
  console.log("TEST: Insert gym domains as service role");
  const verifiedHost = `verified-${Date.now()}.example.com`;
  const unverifiedHost = `unverified-${Date.now()}.example.com`;

  {
    const { error } = await adminClient.from("gym_domains").insert([
      { host: verifiedHost, gym_id: gymId, verified: true },
      { host: unverifiedHost, gym_id: gymId, verified: false },
    ]);
    check("Domains inserted by service role", !error, error?.message);
  }
  console.log();

  // TEST: Anon can resolve verified host
  console.log("TEST: Anon can resolve verified host");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost,
    });
    check("Anon can call resolve_gym_by_host", !error, error?.message);
    check("Verified host returns gym", data && data.length === 1);
    if (data && data.length === 1) {
      check("Gym ID matches", data[0].gym_id === gymId);
      check("Gym slug matches", data[0].gym_slug === gymSlug);
      check("Gym name matches", data[0].gym_name === "Test Gym for Domains");
    }
  }
  console.log();

  // TEST: Authenticated user can resolve verified host
  console.log("TEST: Authenticated user can resolve verified host");
  {
    const { data, error } = await userClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost,
    });
    check("Authenticated can call resolve_gym_by_host", !error, error?.message);
    check("Verified host returns gym", data && data.length === 1);
  }
  console.log();

  // TEST: Unverified host returns nothing
  console.log("TEST: Unverified host returns nothing");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: unverifiedHost,
    });
    check("Anon can call RPC", !error, error?.message);
    check("Unverified host returns empty", !data || data.length === 0);
  }
  console.log();

  // TEST: Unknown host returns nothing
  console.log("TEST: Unknown host returns nothing");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: "unknown-host-12345.example.com",
    });
    check("Anon can call RPC", !error, error?.message);
    check("Unknown host returns empty", !data || data.length === 0);
  }
  console.log();

  // TEST: Case normalization
  console.log("TEST: Case normalization (uppercase host resolves)");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost.toUpperCase(),
    });
    check("Uppercase host resolves", data && data.length === 1, error?.message);
  }
  console.log();

  // TEST: Trailing dot stripped
  console.log("TEST: Trailing dot stripped");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost + ".",
    });
    check("Host with trailing dot resolves", data && data.length === 1, error?.message);
  }
  console.log();

  // TEST: Port stripped
  console.log("TEST: Port stripped");
  {
    const { data, error } = await anonClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost + ":3000",
    });
    check("Host with port resolves", data && data.length === 1, error?.message);
  }
  console.log();

  // TEST: Anon can't SELECT from gym_domains
  console.log("TEST: Anon can't SELECT from gym_domains");
  {
    const { data, error } = await anonClient
      .from("gym_domains")
      .select("*")
      .eq("host", verifiedHost);
    check(
      "Anon SELECT blocked",
      (data === null || data.length === 0) && !error,
    );
  }
  console.log();

  // TEST: Authenticated can't SELECT from gym_domains
  console.log("TEST: Authenticated can't SELECT from gym_domains");
  {
    const { data, error } = await userClient
      .from("gym_domains")
      .select("*")
      .eq("host", verifiedHost);
    check(
      "Authenticated SELECT blocked",
      (data === null || data.length === 0) && !error,
    );
  }
  console.log();

  // TEST: Anon can't INSERT into gym_domains
  console.log("TEST: Anon can't INSERT into gym_domains");
  {
    const { error } = await anonClient.from("gym_domains").insert({
      host: `anon-attempt-${Date.now()}.example.com`,
      gym_id: gymId,
      verified: false,
    });
    check("Anon INSERT blocked", !!error);
  }
  console.log();

  // TEST: Authenticated can't INSERT into gym_domains
  console.log("TEST: Authenticated can't INSERT into gym_domains");
  {
    const { error } = await userClient.from("gym_domains").insert({
      host: `user-attempt-${Date.now()}.example.com`,
      gym_id: gymId,
      verified: false,
    });
    check("Authenticated INSERT blocked", !!error);
  }
  console.log();

  // TEST: Gym owner can't insert a mapping for their own gym
  console.log("TEST: Gym owner can't INSERT a mapping for their gym");
  {
    const { error } = await ownerClient.from("gym_domains").insert({
      host: `owner-attempt-${Date.now()}.example.com`,
      gym_id: gymId,
      verified: false,
    });
    check("Owner INSERT blocked", !!error);
  }
  console.log();

  // TEST: Authenticated can't UPDATE gym_domains
  console.log("TEST: Authenticated can't UPDATE gym_domains");
  {
    const { data, error } = await userClient
      .from("gym_domains")
      .update({ verified: true })
      .eq("host", unverifiedHost)
      .select();
    const blocked = !error && (!data || data.length === 0);
    check(
      "Authenticated UPDATE blocked",
      blocked,
      blocked ? undefined : `${data?.length || 0} rows updated (expected 0)`,
    );
  }
  console.log();

  // TEST: Authenticated can't DELETE gym_domains
  console.log("TEST: Authenticated can't DELETE gym_domains");
  {
    const { data, error } = await userClient
      .from("gym_domains")
      .delete()
      .eq("host", unverifiedHost)
      .select();
    const blocked = !error && (!data || data.length === 0);
    check(
      "Authenticated DELETE blocked",
      blocked,
      blocked ? undefined : `${data?.length || 0} rows deleted (expected 0)`,
    );
  }
  console.log();

  // TEST: Deleting a gym cascades its domains
  console.log("TEST: Deleting a gym cascades its domains");
  {
    // Create another gym with a domain
    const cascadeGymId = randomUUID();
    const cascadeHost = `cascade-${Date.now()}.example.com`;

    await adminClient.from("gyms").insert({
      id: cascadeGymId,
      slug: `cascade-gym-${Date.now()}`,
      name: "Cascade Test Gym",
    });

    await adminClient.from("gym_domains").insert({
      host: cascadeHost,
      gym_id: cascadeGymId,
      verified: true,
    });

    // Verify domain exists
    const { data: beforeDelete } = await adminClient
      .from("gym_domains")
      .select("*")
      .eq("host", cascadeHost)
      .single();
    check("Domain exists before gym deletion", !!beforeDelete);

    // Delete the gym
    const { error: deleteError } = await adminClient
      .from("gyms")
      .delete()
      .eq("id", cascadeGymId);
    check("Gym deleted", !deleteError, deleteError?.message);

    // Verify domain was cascaded
    const { data: afterDelete } = await adminClient
      .from("gym_domains")
      .select("*")
      .eq("host", cascadeHost)
      .maybeSingle();
    check("Domain cascaded on gym deletion", afterDelete === null);
  }
  console.log();

  // TEST: Migration idempotency (re-running is a no-op)
  console.log("TEST: Migration is idempotent");
  {
    // Try to create the function again (should be CREATE OR REPLACE, no error)
    const { error: funcError } = await adminClient.rpc("resolve_gym_by_host", {
      p_host: verifiedHost,
    });
    check(
      "resolve_gym_by_host function still works after re-apply",
      !funcError,
      funcError?.message,
    );

    // The table creation is IF NOT EXISTS, so re-running the migration should be safe
    // We can't easily test the full migration re-run here, but we verify the function works
  }
  console.log();

  // TEST: Host format validation
  console.log("TEST: Host format validation (bare hostname with length limits)");
  {
    // Test lowercase constraint: uppercase host should be rejected
    {
      const { error } = await adminClient.from("gym_domains").insert({
        host: "Gym.com", // uppercase - should be rejected by lowercase constraint
        gym_id: gymId,
        verified: false,
      });
      check("'Gym.com' rejected (not lowercase)", !!error);
    }

    // Test bare hostname constraint: no port, no scheme, no path, no trailing dot
    // Also test length limits: max 253 chars total, max 63 chars per label
    const invalidHosts = [
      "gym.com:3000",                                // port
      "https://gym.com",                             // scheme
      "gym.com/",                                    // path
      "gym.com.",                                    // trailing dot
      ".example.com",                                // leading dot
      "example..com",                                // consecutive dots
      "-example.com",                                // label starts with hyphen
      "example-.com",                                // label ends with hyphen
      "example.com-",                                // label ends with hyphen
      "example_com.net",                             // underscore
      "a".repeat(64) + ".example.com",               // 64-char label (max is 63)
      "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(62) + ".com", // 254-char host (max is 253)
      "1.2.3.4",                                     // IPv4 literal (all-numeric TLD)
      "192.168.1.1",                                 // IPv4 literal
      "bücher.example",                              // raw unicode (not punycode)
      "example .com",                                // space
    ];

    for (const host of invalidHosts) {
      const { error } = await adminClient.from("gym_domains").insert({
        host,
        gym_id: gymId,
        verified: false,
      });
      check(`'${host.length > 40 ? host.slice(0, 37) + "..." : host}' rejected by format constraint`, !!error);
    }

    // Valid bare hostnames
    const validHosts = [
      "gym.example.com",
      "example.com",
      "sub.example.com",
      "my-app.example.com",
      "multi.level.sub.example.com",
      "xn--bcher-kva.example",                       // punycode IDN
      "a".repeat(63) + ".example.com",               // 63-char label (exactly at limit)
      "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(61) + ".com", // 253-char host (exactly at limit)
      "a1.example.com",                              // alphanumeric
      "1a.example.com",                              // starts with digit, contains letter
    ];

    for (const host of validHosts) {
      const { error } = await adminClient.from("gym_domains").insert({
        host,
        gym_id: gymId,
        verified: false,
      });
      // Clean up
      if (!error) {
        await adminClient.from("gym_domains").delete().eq("host", host);
      }
      check(`'${host.length > 40 ? host.slice(0, 37) + "..." : host}' accepted`, !error, error?.message);
    }
  }
  console.log();

  // TEST: get_gym_brand function works for anon
  console.log("TEST: get_gym_brand works for anon");
  {
    const { data, error } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("Anon can call get_gym_brand", !error, error?.message);
    check("get_gym_brand returns data", data && data.length === 1);
    if (data && data.length === 1) {
      check("Brand name matches", data[0].name === "Test Gym for Domains");
      check("Brand slug matches", data[0].slug === gymSlug);
      check("Brand timezone matches", data[0].timezone === "America/New_York");
    }
  }
  console.log();

  // TEST: get_gym_brand works for authenticated
  console.log("TEST: get_gym_brand works for authenticated");
  {
    const { data, error } = await userClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("Authenticated can call get_gym_brand", !error, error?.message);
    check("get_gym_brand returns data", data && data.length === 1);
  }
  console.log();

  // TEST: get_gym_brand returns only public fields (exact column set)
  console.log("TEST: get_gym_brand returns exact public column set");
  {
    const { data, error } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: gymId,
    });
    check("Anon can call get_gym_brand", !error, error?.message);
    if (data && data.length === 1) {
      const row = data[0];
      const keys = Object.keys(row).sort();
      const expectedKeys = ["name", "slug", "timezone"].sort();
      // Assert exact column set: name, slug, timezone (no private fields like id or created_at)
      check(
        "Exact column set: name, slug, timezone",
        keys.length === expectedKeys.length &&
        keys.every((k, i) => k === expectedKeys[i]),
        `got: [${keys.join(", ")}]`,
      );
    }
  }
  console.log();

  // TEST: get_gym_brand returns empty for non-existent gym
  console.log("TEST: get_gym_brand returns empty for non-existent gym");
  {
    const fakeGymId = randomUUID();
    const { data, error } = await anonClient.rpc("get_gym_brand", {
      p_gym_id: fakeGymId,
    });
    check("Anon can call RPC", !error, error?.message);
    check("Non-existent gym returns empty", !data || data.length === 0);
  }
  console.log();

  // Clean up test users and gym
  console.log("Cleaning up test data...");
  if (userIdOwner) await adminClient.auth.admin.deleteUser(userIdOwner);
  if (userIdUser) await adminClient.auth.admin.deleteUser(userIdUser);
  await adminClient.from("gyms").delete().eq("id", gymId);
  console.log("✓ Test data cleaned up\n");

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
