#!/usr/bin/env tsx
/**
 * Test g1-g4, 7, 7b: each deps module query has the correct filters.
 *
 * g1: finish-session-deps updateSession has .eq("status", "in_progress")
 * g2: finish-exercise-deps updateExercise has .not("status", "in", "(completed,skipped)")
 * g3: abandon-session-deps updateSession has .eq("status", "in_progress")
 * g4: close-stale-deps loadSessions and loadExercises (not testing here, PR #111 owns it)
 * 7: finish-session-deps loadTimezone reads profiles.timezone by user_id
 * 7b: finish-session-deps uses the separate loadTimezone method, not an embedded profiles join
 *
 *   npx tsx scripts/test-deps-queries.ts
 */

import { createClient } from "@supabase/supabase-js";
import { makeFinishSessionDeps } from "../src/lib/session/finish-session-deps";
import { makeFinishExerciseDeps } from "../src/lib/session/finish-exercise-deps";
import { makeAbandonSessionDeps } from "../src/lib/session/abandon-session-deps";
import type { Database } from "../src/lib/database.types";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

type RecordedRequest = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

function makeFakeSupabase() {
  const requests: RecordedRequest[] = [];

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : null;
    const headers: Record<string, string> = {};
    
    if (init?.headers) {
      const headersInit = init.headers as Record<string, string>;
      Object.entries(headersInit).forEach(([key, value]) => {
        headers[key.toLowerCase()] = value;
      });
    }

    requests.push({ url, method, body, headers });

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
    });
  };

  const client = createClient<Database>("http://fake.local", "anon", {
    auth: { persistSession: false },
    global: { fetch: stubFetch },
  });

  return { client, requests };
}

async function runTests() {
  console.log("\nTesting deps module query filters\n");

  // Test g1: finish-session-deps updateSession has .eq("status", "in_progress")
  console.log("g1. finish-session-deps updateSession filters by status=in_progress");
  {
    const { client, requests } = makeFakeSupabase();
    const deps = makeFinishSessionDeps(client);

    await deps.updateSession("session-1", {
      status: "completed",
      completed_at: "2026-10-24T15:00:00Z",
      duration_seconds: 3600,
    });

    const patchRequest = requests.find((r) => r.method === "PATCH" && r.url.includes("/rest/v1/sessions?"));
    assertTrue(patchRequest !== undefined, "PATCH request to sessions table");
    assertTrue(
      patchRequest?.url.includes("status=eq.in_progress") ?? false,
      "finish-session-deps updateSession has .eq('status', 'in_progress')"
    );
  }

  // Test g2: finish-exercise-deps updateExercise has .not("status", "in", "(completed,skipped)")
  console.log("\ng2. finish-exercise-deps updateExercise filters by status not in (completed,skipped)");
  {
    const { client, requests } = makeFakeSupabase();
    const deps = makeFinishExerciseDeps(client, async () => null);

    await deps.updateExercise("exercise-1", {
      status: "completed",
      feel: "hard",
      completed_at: "2026-10-24T15:05:00Z",
    });

    const patchRequest = requests.find((r) => r.method === "PATCH" && r.url.includes("/rest/v1/session_exercises?"));
    assertTrue(patchRequest !== undefined, "PATCH request to session_exercises table");
    const hasNotFilter = 
      (patchRequest?.url.includes("status=not.in.(completed,skipped)") ||
       patchRequest?.url.includes("status=not.in.%28completed%2Cskipped%29")) ?? false;
    assertTrue(
      hasNotFilter,
      "finish-exercise-deps updateExercise has .not('status', 'in', '(completed,skipped)')"
    );
  }

  // Test g3: abandon-session-deps updateSession has .eq("status", "in_progress")
  console.log("\ng3. abandon-session-deps updateSession filters by status=in_progress");
  {
    const { client, requests } = makeFakeSupabase();
    const deps = makeAbandonSessionDeps(client);

    await deps.updateSession("session-2", {
      status: "skipped",
      completed_at: null,
      duration_seconds: 120,
    });

    const patchRequest = requests.find((r) => r.method === "PATCH" && r.url.includes("/rest/v1/sessions?"));
    assertTrue(patchRequest !== undefined, "PATCH request to sessions table");
    assertTrue(
      patchRequest?.url.includes("status=eq.in_progress") ?? false,
      "abandon-session-deps updateSession has .eq('status', 'in_progress')"
    );
  }

  // Test 7 and 7b: finish-session-deps loadTimezone reads profiles separately
  console.log("\n7 & 7b. finish-session-deps loadTimezone queries profiles.timezone by user_id");
  {
    const { client, requests } = makeFakeSupabase();
    const deps = makeFinishSessionDeps(client);

    await deps.loadSession("session-1");
    
    const sessionsRequest = requests.find((r) => r.method === "GET" && r.url.includes("/rest/v1/sessions?"));
    assertTrue(sessionsRequest !== undefined, "loadSession queries sessions table");
    assertTrue(
      !(sessionsRequest?.url.includes("profiles") ?? false),
      "loadSession does not embed profiles (7b)"
    );
    
    requests.length = 0;
    await deps.loadTimezone("user-123");
    
    const profilesRequest = requests.find((r) => r.method === "GET" && r.url.includes("/rest/v1/profiles?"));
    assertTrue(profilesRequest !== undefined, "loadTimezone queries profiles table (7)");
    assertTrue(
      profilesRequest?.url.includes("select=timezone") ?? false,
      "loadTimezone selects timezone (7)"
    );
    assertTrue(
      profilesRequest?.url.includes("id=eq.user-123") ?? false,
      "loadTimezone filters by user_id (7)"
    );
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All deps-queries tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
