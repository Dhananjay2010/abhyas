/**
 * Real behavioral test of the exported startSession() server action.
 *
 * Uses server-action-stubs.ts + createClient<Database> with stub-fetch recorder
 * to drive the REAL startSession() server action end-to-end.
 *
 * Tests:
 * 1. Fresh start: returns new sessionId
 * 2. Insert failure: returns {ok: false, error}
 * 3. Resume path: returns existing sessionId
 *
 * Mutant coverage:
 * (a) Core call replaced with empty result -> FAIL assertion on fresh start
 * (b) Core error mapped to ok -> FAIL assertion on insert failure
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { installServerActionStubs, stubState } from "./helpers/server-action-stubs";

type PostgRESTRequest = {
  method: string;
  url: string;
  table: string;
  filters: Record<string, string>;
  body: unknown;
};

const requests: PostgRESTRequest[] = [];

function createStubFetch(
  options: {
    insertFails?: boolean;
    existingSession?: {
      id: string;
      user_id: string;
      program_id: string;
      program_day_id: string;
      local_date: string;
      status: string;
      planned_type: string;
      actual_type: string | null;
      started_at: string | null;
      completed_at: string | null;
    };
  } = {}
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const bodyText = init?.body && typeof init.body === "string" ? init.body : null;
    const body = bodyText ? JSON.parse(bodyText) : null;

    const urlObj = new URL(url);
    const table = urlObj.pathname.split("/").pop() ?? "";
    
    const filters: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      filters[key] = value;
    });

    requests.push({ method, url, table, filters, body });

    if (table === "sessions" && method === "GET") {
      const data = options.existingSession ? [options.existingSession] : [];
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": `0-${data.length - 1}/${data.length}` },
      });
    }

    if (table === "sessions" && method === "POST") {
      if (options.insertFails) {
        return new Response(
          JSON.stringify({ code: "23505", message: "duplicate key", details: null, hint: null }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      const selectParam = filters.select;
      let result;
      if (selectParam === "id") {
        result = [{ id: "sess-new-123" }];
        console.log("Returning session POST with id:", result);
      } else {
        result = [{ ...body, id: "sess-new-123" }];
      }
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
      });
    }

    if (table === "session_exercises" && method === "GET") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
      });
    }

    if (table === "session_exercises" && method === "POST") {
      return new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (table === "profiles" && method === "GET") {
      return new Response(
        JSON.stringify([{ id: "user-1", timezone: "UTC" }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (table === "program_days" && method === "GET") {
      return new Response(
        JSON.stringify([{
          id: "day-1",
          program_id: "prog-1",
          day_number: 1,
          planned_type: "weights" as const,
          exercise_slots: [{
            order: 1,
            exercise_id: "ex-1",
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            target_duration_seconds: null,
            rest_seconds: 90,
            movement_pattern: "squat" as const,
            expected_rating: null,
          }],
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (table === "program_day_exercises" && method === "GET") {
      return new Response(
        JSON.stringify([{
          exercise_id: "ex-1",
          order_index: 0,
          target_sets: 3,
          target_reps_min: 8,
          target_reps_max: 12,
          rest_seconds: 90,
          exercises: { metric: "reps" },
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (table === "programs" && method === "GET") {
      return new Response(
        JSON.stringify([{
          id: "prog-1",
          user_id: "user-1",
          started_on: "2026-10-20",
          deload_week: 4,
          week_offset: 0,
          program_days: [
            { id: "day-1", day_index: 0, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-2", day_index: 1, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-3", day_index: 2, day_type: "rest", focus: null, label: null, status: "active" },
          ],
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (table === "exercises" && method === "GET") {
      const exercises = [
        {
          id: "ex-1",
          slug: "squat",
          name: "Squat",
          aliases: [],
          category: "strength",
          equipment_ids: ["barbell"],
          primary_muscles: ["quads"],
          secondary_muscles: [],
          movement_pattern: "squat",
          impact: "low",
          contraindicated_regions: [],
          is_unilateral: false,
          is_active: true,
          level_min: "beginner",
          metric: "reps",
          default_rest_seconds: 180,
          instructions: [],
          cue: null,
          force: null,
          mechanic: null,
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "ex-2",
          slug: "bench-press",
          name: "Bench Press",
          aliases: [],
          category: "strength",
          equipment_ids: ["barbell"],
          primary_muscles: ["chest"],
          secondary_muscles: [],
          movement_pattern: "horizontal_press",
          impact: "low",
          contraindicated_regions: [],
          is_unilateral: false,
          is_active: true,
          level_min: "beginner",
          metric: "reps",
          default_rest_seconds: 180,
          instructions: [],
          cue: null,
          force: null,
          mechanic: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ];
      return new Response(
        JSON.stringify(exercises),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-${exercises.length - 1}/${exercises.length}` } }
      );
    }

    if (table === "current_blocks" && method === "GET") {
      return new Response(
        JSON.stringify([{
          id: "block-1",
          program_id: "prog-1",
          block_number: 1,
          start_date: "2026-10-20",
          end_date: "2026-11-17",
          status: "active",
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (table === "equipment" && method === "GET") {
      return new Response(
        JSON.stringify([
          { id: "barbell", name: "Barbell", category: "free_weight" },
          { id: "dumbbell", name: "Dumbbell", category: "free_weight" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-1/2" } }
      );
    }

    if (table === "user_equipment" && method === "GET") {
      return new Response(
        JSON.stringify([
          { user_id: "user-1", equipment_id: "barbell" },
          { user_id: "user-1", equipment_id: "dumbbell" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-1/2" } }
      );
    }

    if (table === "injuries" && method === "GET") {
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
    });
  };
}

async function testFreshStart() {
  requests.length = 0;
  const stubFetch = createStubFetch();
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  console.log("Client set:", !!stubState.client, "User:", stubState.userId);

  const { startSession } = await import("@/app/session/actions");
  const result = await startSession();

  console.log("startSession result:", JSON.stringify(result, null, 2));
  console.log("Requests made:", requests.length);
  console.log("Last 5 requests:");
  requests.slice(-5).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.method} ${r.table}`, r.filters);
  });

  if (!result.ok) {
    throw new Error(`Test fresh start failed: expected ok=true, got ${JSON.stringify(result)}`);
  }
  if (!result.data?.sessionId) {
    throw new Error(`Test fresh start failed: expected sessionId, got ${JSON.stringify(result)}`);
  }
  if (result.data.sessionId !== "sess-new-123") {
    throw new Error(`Test fresh start failed: expected sessionId=sess-new-123, got ${result.data.sessionId}`);
  }

  console.log("✓ Test fresh start: returns new sessionId");
}

async function testInsertFailure() {
  requests.length = 0;
  const stubFetch = createStubFetch({ insertFails: true });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  const { startSession } = await import("@/app/session/actions");
  const result = await startSession();

  if (result.ok) {
    throw new Error(`Test insert failure failed: expected ok=false, got ${JSON.stringify(result)}`);
  }
  if (!result.error) {
    throw new Error(`Test insert failure failed: expected error message, got ${JSON.stringify(result)}`);
  }

  console.log("✓ Test insert failure: returns {ok: false, error}");
}

async function testResumePath() {
  requests.length = 0;
  const existingSession = {
    id: "sess-existing-456",
    user_id: "user-1",
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: "2026-10-26",
    status: "in_progress",
    planned_type: "weights",
    actual_type: "weights",
    started_at: "2026-10-26T10:00:00Z",
    completed_at: null,
  };
  const stubFetch = createStubFetch({ existingSession });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  const { startSession } = await import("@/app/session/actions");
  const result = await startSession();

  if (!result.ok) {
    throw new Error(`Test resume path failed: expected ok=true, got ${JSON.stringify(result)}`);
  }
  if (result.data.sessionId !== "sess-existing-456") {
    throw new Error(`Test resume path failed: expected sessionId=sess-existing-456, got ${result.data.sessionId}`);
  }

  console.log("✓ Test resume path: returns existing sessionId");
}

async function main() {
  installServerActionStubs();
  await testFreshStart();
  await testInsertFailure();
  await testResumePath();
  console.log("\nAll tests passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
