#!/usr/bin/env tsx
/**
 * Test that finish-session-deps correctly maps rest_seconds from query results.
 *
 * Catches break 12a: if the deps mapping drops rest_seconds, stale sessions
 * won't add rest intervals and will end immediately at last set.
 *
 *   npx tsx scripts/test-finish-rest-seconds-mapping.ts
 */

import { createClient } from "@supabase/supabase-js";
import { makeFinishSessionDeps } from "../src/lib/session/finish-session-deps";
import type { Database } from "../src/lib/database.types";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

type RecordedRequest = {
  url: string;
  method: string;
  body: unknown;
};

function makeFakeClient(restSeconds: number | null) {
  const requests: RecordedRequest[] = [];

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    
    let body: unknown = null;
    if (init?.body && typeof init.body === "string") {
      body = JSON.parse(init.body);
    }

    requests.push({ url, method, body });

    if (url.includes("/rest/v1/sessions?")) {
      return new Response(
        JSON.stringify({
          id: "session-1",
          user_id: "user-1",
          started_at: "2026-10-24T08:00:00Z",
          status: "in_progress",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/profiles?")) {
      return new Response(
        JSON.stringify({ id: "user-1", timezone: "UTC" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/session_exercises?")) {
      return new Response(
        JSON.stringify([
          {
            id: "ex-1",
            order_index: 0,
            rest_seconds: restSeconds,
            session_sets: [
              {
                id: "set-1",
                is_warmup_set: false,
                completed_at: "2026-10-24T08:30:00Z",
              },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/session_sets?")) {
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", {
    auth: { persistSession: false },
    global: { fetch: stubFetch },
  });

  return { client, requests };
}

async function runTests() {
  console.log("\nTesting finish-session-deps rest_seconds mapping\n");

  console.log("1. loadExercises includes rest_seconds when present (12a)");
  {
    const { client } = makeFakeClient(120);
    const deps = makeFinishSessionDeps(client);

    const result = await deps.loadExercises("session-1");

    assertTrue(result.error === null, "loadExercises should succeed");
    if (result.data && result.data.length > 0) {
      const exercise = result.data[0];
      assertTrue(
        "rest_seconds" in exercise,
        "Exercise should have rest_seconds field",
      );
      assertTrue(
        exercise.rest_seconds === 120,
        "Exercise rest_seconds should match query result",
        `Got ${exercise.rest_seconds}`,
      );
    } else {
      console.error("❌ loadExercises returned no data");
      failed++;
    }
  }

  console.log("\n2. loadExercises handles null rest_seconds");
  {
    const { client } = makeFakeClient(null);
    const deps = makeFinishSessionDeps(client);

    const result = await deps.loadExercises("session-1");

    assertTrue(result.error === null, "loadExercises should succeed with null rest_seconds");
    if (result.data && result.data.length > 0) {
      const exercise = result.data[0];
      assertTrue(
        "rest_seconds" in exercise,
        "Exercise should have rest_seconds field even when null",
      );
      assertTrue(
        exercise.rest_seconds === null,
        "Exercise rest_seconds should be null",
        `Got ${exercise.rest_seconds}`,
      );
    } else {
      console.error("❌ loadExercises returned no data");
      failed++;
    }
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All rest_seconds mapping tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
