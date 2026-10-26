/**
 * Real behavioral test of startSessionCore with createClient<Database> stub fetch.
 *
 * Uses createClient<Database> with stub-fetch recorder to drive the REAL
 * startSessionCore function, which is the core session insertion logic called by
 * the exported startSession() server action.
 *
 * Tests:
 * 1. Fresh start: returns new sessionId
 * 2. Insert failure: returns {ok: false, error}
 * 3. Resume path (23505 duplicate): returns existing sessionId after re-read
 *
 * Mutant coverage:
 * (a) Core call replaced with empty result -> FAIL assertion on fresh start
 * (b) Core error mapped to ok -> FAIL assertion on insert failure
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

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
      const headers = new Headers(init?.headers);
      const accept = headers.get("accept");
      const wantsSingle = accept?.includes("application/vnd.pgrst.object+json");
      
      if (wantsSingle) {
        const result = options.existingSession || null;
        return new Response(JSON.stringify(result), {
          status: result ? 200 : 406,
          headers: { "Content-Type": "application/vnd.pgrst.object+json" },
        });
      } else {
        const data = options.existingSession ? [options.existingSession] : [];
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json", "Content-Range": `0-${data.length - 1}/${data.length}` },
        });
      }
    }

    if (table === "sessions" && method === "POST") {
      if (options.insertFails) {
        return new Response(
          JSON.stringify({ code: "23505", message: "duplicate key", details: null, hint: null }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      
      const headers = new Headers(init?.headers);
      const accept = headers.get("accept");
      const wantsSingle = accept?.includes("application/vnd.pgrst.object+json");
      const selectParam = filters.select;
      
      let result;
      if (wantsSingle) {
        result = selectParam === "id" ? { id: "sess-new-123" } : { ...body, id: "sess-new-123" };
      } else {
        result = selectParam === "id" ? [{ id: "sess-new-123" }] : [{ ...body, id: "sess-new-123" }];
      }
      
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: {
          "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json",
          ...(wantsSingle ? {} : { "Content-Range": "0-0/1" }),
        },
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

  const { startSessionCore } = await import("@/lib/session/start-session-core");
  const result = await startSessionCore(client, "user-1", {
    user_id: "user-1",
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: "2026-10-26",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-26T10:00:00Z",
  });

  if (!result.ok) {
    throw new Error(`Test fresh start failed: expected ok=true, got error: ${result.error}`);
  }
  if (result.sessionId !== "sess-new-123") {
    throw new Error(`Test fresh start failed: expected sessionId=sess-new-123, got ${result.sessionId}`);
  }

  console.log("✓ Test fresh start: returns new sessionId");
}

async function testInsertFailure() {
  requests.length = 0;
  const stubFetch = createStubFetch({ insertFails: true });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  const { startSessionCore } = await import("@/lib/session/start-session-core");
  const result = await startSessionCore(client, "user-1", {
    user_id: "user-1",
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: "2026-10-26",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-26T10:00:00Z",
  });

  if (result.ok) {
    throw new Error(`Test insert failure failed: expected ok=false, got ok=true`);
  }
  if (!result.error) {
    throw new Error(`Test insert failure failed: expected error message`);
  }

  console.log("✓ Test insert failure: returns {ok: false, error}");
}

async function testResumePath() {
  requests.length = 0;
  const existingSession = {
    id: "sess-existing-456",
    user_id: "user-1",
    local_date: "2026-10-26",
    created_at: "2026-10-26T09:00:00Z",
  };
  const stubFetch = createStubFetch({ insertFails: true, existingSession: existingSession as typeof existingSession & { program_id: string; program_day_id: string; status: string; planned_type: string; actual_type: string | null; started_at: string | null; completed_at: string | null } });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  const { startSessionCore } = await import("@/lib/session/start-session-core");
  
  const result = await startSessionCore(client, "user-1", {
    user_id: "user-1",
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: "2026-10-26",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-26T10:00:00Z",
  });

  if (!result.ok) {
    throw new Error(`Test resume path failed: expected ok=true, got error: ${result.error}`);
  }
  if (result.sessionId !== "sess-existing-456") {
    throw new Error(`Test resume path failed: expected sessionId=sess-existing-456, got ${result.sessionId}`);
  }

  console.log("✓ Test resume path: handles 23505 duplicate and returns existing sessionId");
}

async function main() {
  await testFreshStart();
  await testInsertFailure();
  await testResumePath();
  console.log("\nAll tests passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
