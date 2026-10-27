#!/usr/bin/env tsx
/**
 * L4B-4 Behavioral Kill: Test buildProgressionFeedbackForUser with imperial units
 * 
 * Uses real createClient<Database> with fakeFetch to test the full path.
 * No casts, no fake query builders — typed fetch intercepts REST requests.
 * 
 * Mutant: getProfileUnits(supabase, userId) → Promise.resolve<UnitsPreference>("metric")
 * Expected: Test FAILS with assertion error (message shows kg instead of lb).
 */

import { createClient } from "@supabase/supabase-js";
import { buildProgressionFeedbackForUser } from "../src/lib/session/progression-feedback.js";
import type { Database } from "../src/lib/database.types";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) {
    failures++;
    console.log(`❌ FAIL: ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

// Canned data for each table (supports query filtering via table name)
const DATA: Record<string, unknown> = {
  profiles: [{ id: "user1", units: "imperial" }],
  user_settings: [{ user_id: "user1", planning_mode: "progression", per_set_logging: true }],
  session_exercises: [{
    id: "se1",
    session_id: "s1",
    exercise_id: "e1",
    planned_sets: 3,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "compound",
      movement_pattern: "horizontal_press",
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
  }],
  sessions: [{ is_deload: false, local_date: "2026-10-26", program_id: "p1" }],
  session_sets: [
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
  ],
  exercise_progress: [{
    user_id: "user1",
    exercise_id: "e1",
    current_working_weight_kg: "40",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "40",
    best_reps: 12,
    best_e1rm: "56",
    total_sessions: 5,
    weight_at_failure_start_kg: null,
  }],
};

// PostgREST fake fetch
const fakeFetch: typeof fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const urlStr = input instanceof Request ? input.url : (typeof input === "string" ? input : input.toString());
  const path = new URL(urlStr).pathname;
  const table = path.split("/").pop() ?? "";
  
  // Get headers from Request or init
  let headers: HeadersInit | undefined;
  if (input instanceof Request) {
    headers = input.headers;
  } else if (init?.headers) {
    headers = init.headers;
  }
  
  // Return single object if Accept includes vnd.pgrst.object
  let accept = "";
  if (headers) {
    if (headers instanceof Headers) {
      accept = headers.get("Accept") || headers.get("accept") || "";
    } else if (typeof headers === "object") {
      const h = headers as Record<string, string>;
      accept = h.Accept || h.accept || "";
    }
  }
  const isSingle = accept.includes("vnd.pgrst.object");
  
  const data = DATA[table];
  if (data === undefined) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // If data is already an array, return it as-is (for session_sets)
  // If isSingle is requested, return the first element or the object
  let body;
  if (Array.isArray(data)) {
    body = isSingle ? data[0] : data;
  } else {
    body = isSingle ? data : [data];
  }
  
  return new Response(JSON.stringify(body), {
    status: init?.method === "POST" || init?.method === "PATCH" ? 201 : 200,
    headers: { "Content-Type": "application/json" },
  });
};

console.log("=== L4B-4: buildProgressionFeedbackForUser with real createClient ===\n");

(async () => {
  try {
    const supabase = createClient<Database>("http://fake.local", "anon-key", {
      global: { fetch: fakeFetch as typeof fetch },
      auth: { persistSession: false },
    });
    
    console.log("Executing buildProgressionFeedbackForUser with imperial units...");
    
    const result = await buildProgressionFeedbackForUser(
      supabase as Parameters<typeof buildProgressionFeedbackForUser>[0],
      "user1",
      "se1",
      "right",
    );
    
    if (!result) {
      console.error("❌ FAIL: No result returned");
      process.exit(1);
    }
    
    console.log(`  Message: "${result.message}"\n`);
    
    check("Message contains 'lb'", result.message.includes("lb"), result.message);
    check("Message does NOT contain 'kg'", !result.message.includes("kg"), result.message);
    check("Message shows '93.5 lb' (40 kg → 42.5 kg)", result.message.includes("93.5 lb"), result.message);
    
    console.log("\n=== SUMMARY ===");
    if (failures > 0) {
      console.log(`FAILED: ${failures} checks`);
      console.log("Mutant L4B-4 would cause this test to FAIL (assertion error, exit 1)");
      process.exit(1);
    } else {
      console.log("✅ ALL PASS");
      console.log("Kills L4B-4: getProfileUnits(...) → Promise.resolve('metric') → test FAILS");
      process.exit(0);
    }
  } catch (err) {
    console.error("❌ EXCEPTION:", err);
    console.error("Stack:", (err as Error).stack);
    process.exit(1);
  }
})();
