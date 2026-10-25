/**
 * This demonstrates what happens when .eq('user_id', userId) is removed
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// BROKEN VERSION: Missing .eq('user_id', userId)
function buildExerciseProgressQueryBROKEN(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  return supabase
    .from("exercise_progress")
    .select("exercise_id, current_working_weight_kg, current_target_reps");
    // MISSING: .eq("user_id", userId);
}

let recordedUrl: string | null = null;

function recordingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  recordedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return Promise.resolve(
    new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
}

(async () => {
  const client = createClient<Database>(
    "http://localhost:54321",
    "anon-key-placeholder",
    {
      global: {
        fetch: recordingFetch,
      },
    }
  );

  await buildExerciseProgressQueryBROKEN(client, "test-user-123");

  if (recordedUrl) {
    const url = new URL(recordedUrl);
    const userIdParam = url.searchParams.get("user_id");
    
    console.log("Recorded URL:", recordedUrl);
    console.log("\nQuery params:");
    console.log("  select:", url.searchParams.get("select"));
    console.log("  user_id:", userIdParam);
    
    if (!userIdParam) {
      console.error("\n✗ SECURITY ISSUE: Missing user_id=eq.<userId> filter!");
      console.error("   This would allow users to see other users' exercise progress!");
      process.exit(1);
    }
  }
})();
