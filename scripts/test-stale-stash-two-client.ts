#!/usr/bin/env tsx

/**
 * Test: Stale-stash two-client scenario - per-item restore should not clobber
 * concurrent additions made by other clients.
 * 
 * Behavioural test: Calls real core functions and real restore logic.
 */

import { strict as assert } from "assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { setEquipmentItemCore } from "../src/lib/settings/equipment-core";
import { setInjuryCore } from "../src/lib/settings/injury-core";
import { replayPendingOps, type PendingChange } from "../src/lib/settings/restore-pending";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testEquipmentTwoClient() {
  console.log("━━━ TEST: Equipment two-client stale-stash (per-item restore) ━━━\n");

  // Create test user
  const testEmail = `test-equipment-stash-${Date.now()}@example.com`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}`);

  try {
    // Create profile
    await supabase.from("profiles").insert({
      id: userId,
      onboarding_completed_at: new Date().toISOString(),
      timezone: "America/New_York",
    });

    // Get equipment IDs (dumbbells and barbell)
    const { data: equipment } = await supabase
      .from("equipment")
      .select("id, name")
      .in("name", ["Dumbbells", "Barbell"])
      .order("name");

    if (!equipment || equipment.length < 2) {
      throw new Error("Missing equipment data (need Dumbbells and Barbell)");
    }

    const dumbbellId = equipment.find((e) => e.name === "Dumbbells")!.id;
    const barbellId = equipment.find((e) => e.name === "Barbell")!.id;

    console.log(`Equipment IDs: Dumbbells=${dumbbellId}, Barbell=${barbellId}`);

    // Initial state: both clients see dumbbells enabled (using real core function)
    await setEquipmentItemCore(supabase, userId, dumbbellId, true);

    console.log(`\nInitial state: [Dumbbells]`);

    // CLIENT A: Toggles dumbbells OFF and stashes the operation (simulating 401)
    console.log(`\nClient A: Toggles dumbbells OFF (stashes operation due to 401)`);
    const stashedOperations: PendingChange[] = [
      {
        key: "equipment",
        type: "equipment",
        patch: { operation: "setItem", equipmentId: dumbbellId, enabled: false },
        timestamp: Date.now(),
      },
    ];

    // CLIENT B: Adds barbell via real setEquipmentItemCore
    console.log(`Client B: Adds barbell via setEquipmentItemCore`);
    await setEquipmentItemCore(supabase, userId, barbellId, true);

    // Verify both are in DB
    const { data: afterB } = await supabase
      .from("user_equipment")
      .select("equipment_id")
      .eq("user_id", userId)
      .order("equipment_id");

    console.log(`\nAfter Client B: ${afterB?.length || 0} items in DB`);
    console.log(`  Equipment IDs: ${afterB?.map((e) => e.equipment_id).join(", ")}`);

    assert.equal(afterB?.length, 2, "Should have 2 items (dumbbells + barbell)");

    // CLIENT A: Restores stashed operations (using real replayPendingOps)
    console.log(`\nClient A: Restores stashed operations (calling real replayPendingOps)`);
    await replayPendingOps(stashedOperations, {
      updateProfileSettings: async () => ({ ok: true }),
      updateSessionSettings: async () => ({ ok: true }),
      setEquipmentItem: async (input) => {
        const result = await setEquipmentItemCore(supabase, userId, input.equipmentId, input.enabled);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      },
      setHasAllEquipment: async () => ({ ok: true }),
      setInjury: async () => ({ ok: true }),
    });

    // Final verification: barbell should still be there, dumbbells should be off
    const { data: final } = await supabase
      .from("user_equipment")
      .select("equipment_id")
      .eq("user_id", userId)
      .order("equipment_id");

    console.log(`\nAfter Client A restore: ${final?.length || 0} items in DB`);
    console.log(`  Equipment IDs: ${final?.map((e) => e.equipment_id).join(", ")}`);

    // Assertions
    assert.equal(final?.length, 1, "Should have 1 item (barbell only, dumbbells removed)");
    assert.equal(final?.[0].equipment_id, barbellId, "Barbell should still be present");
    assert(
      !final?.some((e) => e.equipment_id === dumbbellId),
      "Dumbbells should be removed (per A's operation)"
    );

    console.log(`\n✅ Equipment two-client test passed!`);
    console.log(`   Per-item restore did not clobber concurrent addition (barbell)`);
  } finally {
    // Cleanup
    await supabase.auth.admin.deleteUser(userId);
    console.log(`\nCleaned up test user: ${userId}`);
  }
}

async function testInjuriesTwoClient() {
  console.log("\n━━━ TEST: Injuries two-client stale-stash (per-item restore) ━━━\n");

  // Create test user
  const testEmail = `test-injuries-stash-${Date.now()}@example.com`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create test user: ${authError?.message}`);
  }

  const userId = authData.user.id;
  console.log(`Created test user: ${userId}`);

  try {
    // Create profile
    await supabase.from("profiles").insert({
      id: userId,
      onboarding_completed_at: new Date().toISOString(),
      timezone: "America/New_York",
    });

    // Initial state: both clients see knee injury (past) (using real core function)
    await setInjuryCore(supabase, userId, "knee", true, "past");

    console.log(`\nInitial state: [knee: past]`);

    // CLIENT A: Removes knee and stashes the operation (simulating 401)
    console.log(`\nClient A: Removes knee (stashes operation due to 401)`);
    const stashedOperations: PendingChange[] = [
      {
        key: "injury",
        type: "injury",
        patch: { operation: "setInjury", bodyRegion: "knee", present: false },
        timestamp: Date.now(),
      },
    ];

    // CLIENT B: Adds shoulder injury via real setInjuryCore
    console.log(`Client B: Adds shoulder (current) via setInjuryCore`);
    await setInjuryCore(supabase, userId, "shoulder", true, "current");

    // Verify both are in DB
    const { data: afterB } = await supabase
      .from("user_injuries")
      .select("body_region, severity")
      .eq("user_id", userId)
      .order("body_region");

    console.log(`\nAfter Client B: ${afterB?.length || 0} injuries in DB`);
    afterB?.forEach((i) => console.log(`  ${i.body_region}: ${i.severity}`));

    assert.equal(afterB?.length, 2, "Should have 2 injuries (knee + shoulder)");

    // CLIENT A: Restores stashed operations (using real replayPendingOps)
    console.log(`\nClient A: Restores stashed operations (calling real replayPendingOps)`);
    await replayPendingOps(stashedOperations, {
      updateProfileSettings: async () => ({ ok: true }),
      updateSessionSettings: async () => ({ ok: true }),
      setEquipmentItem: async () => ({ ok: true }),
      setHasAllEquipment: async () => ({ ok: true }),
      setInjury: async (input) => {
        const result = await setInjuryCore(supabase, userId, input.bodyRegion, input.present, input.severity);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      },
    });

    // Final verification: shoulder should still be there, knee should be removed
    const { data: final } = await supabase
      .from("user_injuries")
      .select("body_region, severity")
      .eq("user_id", userId)
      .order("body_region");

    console.log(`\nAfter Client A restore: ${final?.length || 0} injuries in DB`);
    final?.forEach((i) => console.log(`  ${i.body_region}: ${i.severity}`));

    // Assertions
    assert.equal(final?.length, 1, "Should have 1 injury (shoulder only)");
    assert.equal(final?.[0].body_region, "shoulder", "shoulder should still be present");
    assert.equal(final?.[0].severity, "current", "shoulder severity should be current");
    assert(
      !final?.some((i) => i.body_region === "knee"),
      "knee should be removed (per A's operation)"
    );

    console.log(`\n✅ Injuries two-client test passed!`);
    console.log(`   Per-item restore did not clobber concurrent addition (shoulder)`);
  } finally {
    // Cleanup
    await supabase.auth.admin.deleteUser(userId);
    console.log(`\nCleaned up test user: ${userId}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Stale-stash Two-Client Tests (Real Core Functions)");
  console.log("═══════════════════════════════════════════════════════\n");

  await testEquipmentTwoClient();
  await testInjuriesTwoClient();

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ✓ All two-client tests passed");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
