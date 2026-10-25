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

  console.log("1. Session started yesterday in America/Los_Angeles is treated as stale (7, 7b)");
  {
    // Scenario: Started at 23:30 PDT yesterday, now it's 00:30 PDT today
    // In PDT (UTC-7) these are different days -> stale
    // Pin the timestamps:
    // - started_at: 2026-10-25T06:30:00Z (= 2026-10-24 23:30 PDT)
    // - now:        2026-10-25T07:30:00Z (= 2026-10-25 00:30 PDT)
    // This is a 1-hour elapsed session, but crosses midnight in PDT so it's stale.
    
    const startedAt = "2026-10-25T06:30:00Z";
    const nowPinned = "2026-10-25T07:30:00Z";
    const localDate = "2026-10-24"; // Started on 2026-10-24 in PDT

    const { client, getSavedDuration } = makeFakeClient("America/Los_Angeles", startedAt, localDate);
    const deps = makeFinishSessionDeps(client);
    // Inject pinned "now"
    deps.now = () => nowPinned;

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 3600, // 1 hour elapsed
      cooldownCompleted: false,
    });

    if (result.ok) {
      assertTrue(true, "finishSessionCore should succeed");
      // The session is stale (crossed midnight in PDT), so duration should be capped
      // With 1 set and 60s rest, capped duration should be much less than 3600s
      const duration = getSavedDuration();
      assertTrue(
        duration !== null && duration !== undefined && duration < 3600,
        "Duration should be capped for stale session (not the full hour)",
        `Got ${duration}s, expected < 3600s`
      );
      assertTrue(
        duration !== null && duration !== undefined && duration < 300,
        "Duration should be based on set time + rest, not actual elapsed",
        `Got ${duration}s`
      );
    } else {
      console.error("❌ finishSessionCore failed:", result.error);
      failed++;
    }
  }

  console.log("\n2. Null timezone falls back to Asia/Kolkata (default), not America/Los_Angeles");
  {
    // Pin timestamps for deterministic test
    // If timezone is null and falls back to Asia/Kolkata, this same-day session should NOT be stale
    const startedAt = "2026-10-24T16:00:00Z"; // 21:30 IST
    const nowPinned = "2026-10-24T18:00:00Z"; // 23:30 IST (same day in IST)
    const localDate = "2026-10-24";

    const { client, getSavedDuration } = makeFakeClient(null, startedAt, localDate);
    const deps = makeFinishSessionDeps(client);
    deps.now = () => nowPinned;

    const result = await finishSessionCore(deps, {
      sessionId: "session-1",
      durationSeconds: 7200,
      cooldownCompleted: false,
    });

    assertTrue(result.ok, "finishSessionCore should succeed with null timezone");
    // Since it's same-day in the fallback timezone, duration should NOT be capped
    const duration = getSavedDuration();
    assertTrue(
      duration === 7200,
      "Duration should NOT be capped for same-day session in fallback timezone",
      `Got ${duration}s, expected 7200s`
    );
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
