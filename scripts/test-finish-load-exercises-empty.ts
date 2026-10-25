#!/usr/bin/env tsx
/**
 * Test that finishSessionCore handles empty exercises array from loadExercises.
 *
 * Catches break g4: if loadExercises returns data: [] or exercises mapping is empty,
 * the finish deps should handle it gracefully without crashes.
 *
 *   npx tsx scripts/test-finish-load-exercises-empty.ts
 */

import { createClient } from "@supabase/supabase-js";
import { finishSessionCore } from "../src/lib/session/finish-session";
import { makeFinishSessionDeps } from "../src/lib/session/finish-session-deps";
import type { Database } from "../src/lib/database.types";

const NOW = "2026-10-25T12:00:00Z";
const NOW_FN = () => NOW;

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

function makeFakeClient(exercisesData: unknown[]) {
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/rest/v1/sessions?")) {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
        });
      }
      return new Response(
        JSON.stringify({
          id: "session-1",
          user_id: "user-123",
          started_at: "2026-10-24T14:00:00Z",
          local_date: "2026-10-24",
          status: "in_progress",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/profiles?")) {
      return new Response(
        JSON.stringify({ id: "user-123", timezone: "UTC" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/session_exercises?")) {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(exercisesData),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return createClient<Database>("http://fake.local", "anon", {
    auth: { persistSession: false },
    global: { fetch: stubFetch },
  });
}

async function runTests() {
  console.log("\nTesting finishSessionCore with empty exercises\n");

  console.log("1. loadExercises returns empty array (g4)");
  {
    const client = makeFakeClient([]);
    const deps = makeFinishSessionDeps(client);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: false,
      now: NOW_FN,
    });

    assertTrue(result.ok, "finishSessionCore should succeed with empty exercises");
    if (result.ok) {
      assertTrue(
        result.data.status === "skipped",
        "Status should be skipped for 0 sets",
      );
    }
  }

  console.log("\n2. loadExercises handles exercises with no sets");
  {
    const client = makeFakeClient([
      {
        id: "ex-1",
        rest_seconds: 60,
        session_sets: [],
      },
    ]);
    const deps = makeFinishSessionDeps(client);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 1800,
      cooldownCompleted: false,
      now: NOW_FN,
    });

    assertTrue(result.ok, "finishSessionCore should handle exercises with no sets");
    if (result.ok) {
      assertTrue(
        result.data.status === "skipped",
        "Status should be skipped when no sets logged",
      );
    }
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All loadExercises empty tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
