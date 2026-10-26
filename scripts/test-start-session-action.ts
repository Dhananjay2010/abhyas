/**
 * Real behavioral test of the exported startSession() server action.
 *
 * Uses server-action-stubs.ts to stub request-scoped edges (auth, rate-limit,
 * revalidate) and createClient<Database> with stub fetch to provide a fake
 * Supabase client. Mocks Date.now() to control the clock. Then imports and
 * calls the REAL startSession() from src/app/session/actions.ts.
 *
 * Tests:
 * 1. Fresh start: returns new sessionId from inserted session
 * 2. Insert failure: returns {ok: false, error} when session insert fails
 * 3. Resume path: returns existing sessionId on 23505 duplicate
 *
 * Mutant coverage:
 * (a) Core call replaced with empty result -> FAIL assertion on fresh start
 * (b) Core error mapped to ok -> FAIL assertion on insert failure
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { installServerActionStubs, stubState } from "./helpers/server-action-stubs";

const FIXED_DATE_MS = new Date("2026-10-20T10:00:00Z").getTime(); // Monday Oct 20, 2026
let originalDateNow: () => number;
let originalDateConstructor: DateConstructor;

function mockClock(timestampMs: number) {
  originalDateNow = Date.now;
  originalDateConstructor = Date;
  Date.now = () => timestampMs;
  const RealDate = originalDateConstructor;
  const FixedDate = new Proxy(RealDate, {
    construct(target, args: [] | [string | number] | [number, number] | [number, number, number] | [number, number, number, number] | [number, number, number, number, number] | [number, number, number, number, number, number] | [number, number, number, number, number, number, number]) {
      if (args.length === 0) {
        return new target(timestampMs);
      }
      if (args.length === 1) {
        return new target(args[0]);
      }
      if (args.length === 2) {
        return new target(args[0], args[1]);
      }
      if (args.length === 3) {
        return new target(args[0], args[1], args[2]);
      }
      if (args.length === 4) {
        return new target(args[0], args[1], args[2], args[3]);
      }
      if (args.length === 5) {
        return new target(args[0], args[1], args[2], args[3], args[4]);
      }
      if (args.length === 6) {
        return new target(args[0], args[1], args[2], args[3], args[4], args[5]);
      }
      return new target(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    }
  });
  globalThis.Date = FixedDate;
}

function restoreClock() {
  if (originalDateNow) {
    Date.now = originalDateNow;
  }
  if (originalDateConstructor) {
    globalThis.Date = originalDateConstructor;
  }
}

function createStubFetch(
  options: {
    insertFails?: boolean;
    existingSession?: {
      id: string;
      user_id: string;
      local_date: string;
      created_at: string;
    };
  } = {}
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const bodyText = init?.body && typeof init.body === "string" ? init.body : null;
    const body = bodyText ? JSON.parse(bodyText) : null;

    const headers = new Headers(init?.headers);
    const accept = headers.get("accept");
    const wantsSingle = accept?.includes("application/vnd.pgrst.object+json");

    if (url.includes("/sessions") && method === "GET") {
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

    if (url.includes("/sessions") && method === "POST") {
      if (options.insertFails) {
        return new Response(
          JSON.stringify({ code: "23505", message: "duplicate key", details: null, hint: null }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
      
      const result = wantsSingle ? { id: "sess-new-123" } : [{ id: "sess-new-123" }];
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: {
          "Content-Type": wantsSingle ? "application/vnd.pgrst.object+json" : "application/json",
          ...(wantsSingle ? {} : { "Content-Range": "0-0/1" }),
        },
      });
    }

    if (url.includes("/session_exercises") && method === "GET") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
      });
    }

    if (url.includes("/session_exercises") && method === "POST") {
      return new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/profiles") && method === "GET") {
      return new Response(
        JSON.stringify([{ id: "user-1", timezone: "UTC" }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (url.includes("/program_days") && method === "GET") {
      return new Response(
        JSON.stringify([{
          id: "day-1",
          program_id: "prog-1",
          day_number: 1,
          planned_type: "weights",
          exercise_slots: [{
            order: 1,
            exercise_id: "ex-1",
            target_sets: 3,
            target_reps_min: 8,
            target_reps_max: 12,
            target_duration_seconds: null,
            rest_seconds: 90,
            movement_pattern: "squat",
            expected_rating: null,
          }],
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (url.includes("/program_day_exercises") && method === "GET") {
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

    if (url.includes("/programs") && method === "GET") {
      return new Response(
        JSON.stringify([{
          id: "prog-1",
          user_id: "user-1",
          started_on: "2026-10-20",
          deload_week: 4,
          week_offset: 0,
          program_days: [
            { id: "day-1", day_index: 1, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-2", day_index: 2, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-3", day_index: 3, day_type: "rest", focus: null, label: null, status: "active" },
            { id: "day-4", day_index: 4, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-5", day_index: 5, day_type: "weights", focus: null, label: null, status: "active" },
            { id: "day-6", day_index: 6, day_type: "rest", focus: null, label: null, status: "active" },
            { id: "day-7", day_index: 7, day_type: "rest", focus: null, label: null, status: "active" },
          ],
        }]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } }
      );
    }

    if (url.includes("/exercises") && method === "GET") {
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

    if (url.includes("/current_blocks") && method === "GET") {
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

    if (url.includes("/equipment") && method === "GET") {
      return new Response(
        JSON.stringify([
          { id: "barbell", name: "Barbell", category: "free_weight" },
          { id: "dumbbell", name: "Dumbbell", category: "free_weight" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-1/2" } }
      );
    }

    if (url.includes("/user_equipment") && method === "GET") {
      return new Response(
        JSON.stringify([
          { user_id: "user-1", equipment_id: "barbell" },
          { user_id: "user-1", equipment_id: "dumbbell" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-1/2" } }
      );
    }

    if (url.includes("/injuries") && method === "GET") {
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
  const stubFetch = createStubFetch();
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  mockClock(FIXED_DATE_MS);
  try {
    const { startSession } = await import("@/app/session/actions");
    const result = await startSession();

    if (!result.ok) {
      throw new Error(`Test fresh start failed: expected ok=true, got error: ${result.error}`);
    }
    if (!result.data?.sessionId) {
      throw new Error(`Test fresh start failed: expected sessionId in data`);
    }
    if (result.data.sessionId !== "sess-new-123") {
      throw new Error(`Test fresh start failed: expected sessionId=sess-new-123, got ${result.data.sessionId}`);
    }

    console.log("✓ Test fresh start: returns new sessionId");
  } finally {
    restoreClock();
  }
}

async function testInsertFailure() {
  const stubFetch = createStubFetch({ insertFails: true });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  mockClock(FIXED_DATE_MS);
  try {
    const { startSession } = await import("@/app/session/actions");
    const result = await startSession();

    if (result.ok) {
      throw new Error(`Test insert failure failed: expected ok=false, got ok=true`);
    }
    if (!result.error) {
      throw new Error(`Test insert failure failed: expected error message`);
    }

    console.log("✓ Test insert failure: returns {ok: false, error}");
  } finally {
    restoreClock();
  }
}

async function testResumePath() {
  const existingSession = {
    id: "sess-existing-456",
    user_id: "user-1",
    local_date: "2026-10-20",
    created_at: "2026-10-20T09:00:00Z",
  };
  const stubFetch = createStubFetch({ insertFails: true, existingSession });
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: stubFetch },
  });

  stubState.client = client;
  stubState.userId = "user-1";

  mockClock(FIXED_DATE_MS);
  try {
    const { startSession } = await import("@/app/session/actions");
    const result = await startSession();

    if (!result.ok) {
      throw new Error(`Test resume path failed: expected ok=true, got error: ${result.error}`);
    }
    if (!result.data?.sessionId) {
      throw new Error(`Test resume path failed: expected sessionId in data`);
    }
    if (result.data.sessionId !== "sess-existing-456") {
      throw new Error(`Test resume path failed: expected sessionId=sess-existing-456, got ${result.data.sessionId}`);
    }

    console.log("✓ Test resume path: handles 23505 duplicate and returns existing sessionId");
  } finally {
    restoreClock();
  }
}

async function testWeekdayIndependence() {
  console.log("\nWeekday independence check:");
  
  const weekdays = [
    { name: "Monday", date: "2026-10-26T10:00:00Z" },
    { name: "Tuesday", date: "2026-10-27T10:00:00Z" },
    { name: "Wednesday", date: "2026-10-28T10:00:00Z" },
    { name: "Thursday", date: "2026-10-29T10:00:00Z" },
    { name: "Friday", date: "2026-10-30T10:00:00Z" },
    { name: "Saturday", date: "2026-10-31T10:00:00Z" },
    { name: "Sunday", date: "2026-11-01T10:00:00Z" },
    { name: "Future date (3 months ahead)", date: "2027-01-26T10:00:00Z" },
  ];

  for (const { name, date } of weekdays) {
    const timestampMs = new Date(date).getTime();
    const stubFetch = createStubFetch();
    const client = createClient<Database>("http://localhost:54321", "test-key", {
      global: { fetch: stubFetch },
    });

    stubState.client = client;
    stubState.userId = "user-1";

    mockClock(timestampMs);
    try {
      delete require.cache[require.resolve("@/app/session/actions")];
      const { startSession } = await import("@/app/session/actions");
      const result = await startSession();

      if (!result.ok || !result.data?.sessionId) {
        throw new Error(`Weekday test failed for ${name}: ${JSON.stringify(result)}`);
      }
      console.log(`  ✓ ${name}: ${date} → sessionId=${result.data.sessionId}`);
    } finally {
      restoreClock();
    }
  }
}

async function main() {
  installServerActionStubs();
  await testFreshStart();
  await testInsertFailure();
  await testResumePath();
  await testWeekdayIndependence();
  console.log("\nAll tests passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
