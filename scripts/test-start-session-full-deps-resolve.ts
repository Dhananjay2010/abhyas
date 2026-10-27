#!/usr/bin/env tsx
/**
 * Test: buildStartSessionFullDeps.resolveTodayDay passes through result (mutant B)
 * 
 * Mutant (B): If buildStartSessionFullDeps.resolveTodayDay always returns null,
 * this test FAILS because it asserts the real resolver's result passes through.
 */

import { strict as assert } from "node:assert";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

// Fake Supabase client that simulates a swap collision:
// - Today is Tuesday 2026-10-27 (index 2)
// - Yesterday was Monday 2026-10-26 (index 1), scheduled for "day-monday-rest" (rest)
// - Yesterday completed "day-tuesday-push" (weights) — swapped from today
// - Today is scheduled for "day-tuesday-push" (weights)
// - Collision: today's scheduled day was completed yesterday via swap
// - Should rotate to "day-wednesday-legs" (weights, different label)
function makeFakeSupabaseWithCollision() {
  const stubFetch: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    
    if (url.includes("/program_days")) {
      return new Response(JSON.stringify([
        { id: "day-monday-rest", day_index: 1, day_type: "rest", label: null },
        { id: "day-tuesday-push", day_index: 2, day_type: "weights", label: "Push" },
        { id: "day-wednesday-legs", day_index: 3, day_type: "weights", label: "Legs" },
        { id: "day-thursday-pull", day_index: 4, day_type: "weights", label: "Pull" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    if (url.includes("/sessions")) {
      return new Response(JSON.stringify([
        { program_day_id: "day-tuesday-push", actual_type: "weights" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };
  
  return createClient<Database>("http://stub.local", "anon", {
    global: { fetch: stubFetch },
  });
}

function makeFakeSupabaseNoCollision() {
  const stubFetch: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    
    if (url.includes("/program_days")) {
      return new Response(JSON.stringify([
        { id: "day-monday-push", day_index: 1, day_type: "weights", label: "Push" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    if (url.includes("/sessions")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };
  
  return createClient<Database>("http://stub.local", "anon", {
    global: { fetch: stubFetch },
  });
}

(async () => {
  console.log("Test: buildStartSessionFullDeps.resolveTodayDay passthrough (mutant B)\n");

  console.log("1. When resolver finds collision, resolveTodayDay returns the resolved ID");
  {
    const deps = buildStartSessionFullDeps(makeFakeSupabaseWithCollision(), "user-123", Date.now());
    const result = await deps.resolveTodayDay?.("prog-456", "2026-10-27");

    assert.ok(result !== null && result !== undefined, "resolveTodayDay must return non-null when collision detected");
    assert.strictEqual(result?.programDayId, "day-wednesday-legs", "must rotate to next training day after collision");
    assert.strictEqual(result?.dayType, "weights", "must pass through dayType");
    assert.strictEqual(result?.label, "Legs", "must pass through rotated label");

    console.log("  ✓ Collision detected: resolver result passes through unchanged");
  }

  console.log("\n2. When no collision, resolveTodayDay returns null");
  {
    const deps = buildStartSessionFullDeps(makeFakeSupabaseNoCollision(), "user-123", Date.now());
    const result = await deps.resolveTodayDay?.("prog-456", "2026-10-27");

    assert.strictEqual(result, null, "resolveTodayDay must return null when no collision");

    console.log("  ✓ No collision: returns null as expected");
  }

  console.log("\n✅ Mutant B would fail: returning null unconditionally breaks test 1");
})().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});

export {};
