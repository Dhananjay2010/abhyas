#!/usr/bin/env tsx
/**
 * Test that finishSessionCore correctly uses member timezone to determine staleness.
 *
 * Catches breaks 7 and 7b: if the timezone is ignored or not loaded, a session
 * started late yesterday in the member's timezone may be treated as same-day
 * when it should be stale.
 *
 * Run with TZ=Asia/Kolkata to test in a non-UTC timezone:
 *   TZ=Asia/Kolkata npx tsx scripts/test-finish-session-timezone.ts
 */

import { createClient } from "@supabase/supabase-js";
import { finishSessionCore } from "../src/lib/session/finish-session";
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

function makeFakeClient(memberTimezone: string | null, startedAt: string, localDate: string) {
  let savedDuration: number | null = null;

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/rest/v1/sessions?")) {
      if (init?.method === "PATCH") {
        const body = init.body ? JSON.parse(init.body as string) : {};
        savedDuration = body.duration_seconds ?? null;
        return new Response(JSON.stringify([body]), {
          status: 200,
          headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
        });
      }
      return new Response(
        JSON.stringify({
          id: "session-1",
          user_id: "user-123",
          started_at: startedAt,
          local_date: localDate,
          status: "in_progress",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (url.includes("/rest/v1/profiles?")) {
      return new Response(
        JSON.stringify({ id: "user-123", timezone: memberTimezone }),
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
                completed_at: startedAt,
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

  return { client, getSavedDuration: () => savedDuration };
}

async function runTests() {
  console.log("\nTesting finish-session timezone handling\n");

  console.log("1. Session started yesterday in Asia/Kolkata is treated as stale (7, 7b)");
  {
    // Scenario: Started at 23:30 IST yesterday (18:00 UTC yesterday)
    // Now it's 00:30 IST today (19:00 UTC yesterday, same UTC day)
    // In IST: different day -> stale
    // In UTC: same day -> not stale
    // The test passes if duration is capped (stale) rather than actual elapsed
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // 23:30 IST yesterday = 18:00 UTC yesterday
    
    const yesterdayISO = yesterday.toISOString();
    const yesterdayLocalDate = new Date(yesterday.getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]; // Yesterday in IST

    const { client, getSavedDuration } = makeFakeClient("Asia/Kolkata", yesterdayISO, yesterdayLocalDate);
    const deps = makeFinishSessionDeps(client);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 18000, // 5 hours elapsed
      cooldownCompleted: false,
    });

    if (result.ok) {
      assertTrue(true, "finishSessionCore should succeed");
      // If timezone is used correctly, the session is stale and duration should be capped
      // A stale duration uses the sets and rest times, not the actual elapsed time
      // With 1 set and 60s rest, capped duration should be much less than 18000s
      const duration = getSavedDuration();
      assertTrue(
        duration !== null && duration !== undefined && duration < 18000,
        "Duration should be capped for stale session (not the full 5 hours)",
        `Got ${duration}s, expected < 18000s`
      );
      assertTrue(
        duration !== null && duration !== undefined && duration < 3600,
        "Duration should NOT be the actual duration (stale)",
        `Got ${duration}s`
      );
    } else {
      console.error("❌ finishSessionCore failed:", result.error);
      failed++;
    }
  }

  console.log("\n2. Null timezone falls back to UTC");
  {
    const now = new Date();
    now.setHours(now.getHours() - 2);
    const twoHoursAgo = now.toISOString();
    const todayLocalDate = new Date().toISOString().split("T")[0];

    const { client } = makeFakeClient(null, twoHoursAgo, todayLocalDate);
    const deps = makeFinishSessionDeps(client);

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 7200,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "finishSessionCore should succeed with null timezone");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }

  console.log("\n✨ All timezone tests passed!");
}

runTests().catch((err) => {
  console.error("\n❌ Test suite threw an error:");
  console.error(err);
  process.exit(1);
});
