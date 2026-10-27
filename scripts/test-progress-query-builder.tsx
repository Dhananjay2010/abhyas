/**
 * MEDIUM-1: Extract progress query builder and test .eq('user_id') filter.
 * 
 * The session/[id]/page.tsx builds a progress query that must filter by user_id.
 * This test uses a REAL Supabase client with recordingFetch to verify the query structure.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { buildExerciseProgressQuery } from "@/lib/session/progress-query";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing exercise progress query builder with real Supabase client\n");

// Recording fetch captures HTTP requests
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

// --- Test 1: Query with real Supabase client ---
async function testRealClient() {
  recordedUrl = null;
  
  const client = createClient<Database>(
    "http://localhost:54321",
    "anon-key-placeholder",
    {
      global: {
        fetch: recordingFetch,
      },
    }
  );

  const userId = "test-user-123";
  await buildExerciseProgressQuery(client, userId);

  check("Query was made", recordedUrl !== null);
  
  if (recordedUrl) {
    const url = new URL(recordedUrl);
    
    check(
      "Query path is /rest/v1/exercise_progress",
      url.pathname === "/rest/v1/exercise_progress"
    );
    
    const selectParam = url.searchParams.get("select");
    check(
      "Query has select param with correct columns",
      selectParam === "exercise_id,current_working_weight_kg,current_target_reps"
    );
    
    const userIdParam = url.searchParams.get("user_id");
    check(
      "Query has user_id=eq.<userId> (security filter)",
      userIdParam === `eq.${userId}`
    );
    
    console.log("  Recorded URL:", recordedUrl);
  }
}

// --- Test 2: Different user ID ---
async function testDifferentUserId() {
  recordedUrl = null;
  
  const client = createClient<Database>(
    "http://localhost:54321",
    "anon-key-placeholder",
    {
      global: {
        fetch: recordingFetch,
      },
    }
  );

  const userId = "another-user-456";
  await buildExerciseProgressQuery(client, userId);

  if (recordedUrl) {
    const url = new URL(recordedUrl);
    const userIdParam = url.searchParams.get("user_id");
    check(
      "Query filters by the provided user_id",
      userIdParam === `eq.${userId}`
    );
  }
}

// Run tests
(async () => {
  await testRealClient();
  await testDifferentUserId();

  console.log("");
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass).length;

  if (failed > 0) {
    console.error(`\n${failed} failed, ${passed} passed\n`);
    process.exit(1);
  }

  console.log(`${passed} passed, ${failed} failed\n`);
})();
