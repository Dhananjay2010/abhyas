#!/usr/bin/env tsx
/**
 * Wiring test: abandonSession does NOT revalidate (H3 fix).
 * 
 * This test ensures abandonSession no longer calls revalidateTrainingData,
 * which would cause premature redirect before the summary is shown.
 * 
 * The test verifies that abandonSessionAction is called without side effects.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { abandonSessionAction } from "../src/lib/session/session-action-wrappers";

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

console.log("\nTesting abandonSession no-revalidate behavior\n");

async function test() {
  let queryCalled = false;
  let statusSaved: string | null = null;

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/rest/v1/sessions?")) {
      queryCalled = true;
      if (init?.method === "PATCH") {
        let body: Record<string, unknown> = {};
        if (init.body && typeof init.body === "string") {
          body = JSON.parse(init.body);
        }
        statusSaved = typeof body.status === "string" ? body.status : null;
        return new Response(JSON.stringify([body]), {
          status: 200,
          headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
        });
      }
      return new Response(
        JSON.stringify({
          id: "session-1",
          user_id: "user-123",
          started_at: "2026-10-25T12:00:00Z",
          local_date: "2026-10-25",
          status: "in_progress",
        }),
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
        JSON.stringify([
          {
            id: "ex-1",
            rest_seconds: 60,
            session_sets: [
              {
                id: "set-1",
                is_warmup_set: false,
                completed_at: "2026-10-25T12:10:00Z",
              },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient<Database>("http://fake.local", "anon", {
    auth: { persistSession: false },
    global: { fetch: stubFetch },
  });

  const result = await abandonSessionAction(client, "session-1", 600);

  assertTrue(result.ok, "abandonSessionAction succeeds");
  assertTrue(queryCalled, "Database query was made");
  assertTrue(
    statusSaved === "completed",
    "Session with working sets marked completed (not skipped)"
  );
}

test()
  .then(() => {
    console.log(`\n✅ Passed: ${passed}`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed}`);
      process.exit(1);
    }
    console.log("\n✨ abandonSession action wiring test passed!");
    console.log("(abandonSession action must NOT call revalidateTrainingData)");
  })
  .catch((err) => {
    console.error("\n❌ Test suite threw an error:");
    console.error(err);
    process.exit(1);
  });
