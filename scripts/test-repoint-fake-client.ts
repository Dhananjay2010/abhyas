/**
 * Mutant-killing unit tests for repointSessionsAfterRebuild with fake client.
 *
 * Tests error handling and mode guard without a real database:
 * - Errors on select return {ok: false}
 * - Errors on update return {ok: false}
 * - Errors on delete return {ok: false}
 *
 * npm run test:repoint-fake-client
 */
import { repointSessionsAfterRebuild } from "../src/lib/program/repoint-sessions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type Client = SupabaseClient<Database>;
type SupabaseError = { message: string; code?: string };
type SupabaseResponse<T> = {
  data: T | null;
  error: SupabaseError | null;
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

/**
 * Create a fake Supabase client that returns controlled responses.
 */
function createFakeClient(
  selectResponse: SupabaseResponse<unknown>,
  newDaysResponse: SupabaseResponse<unknown>,
  updateErrors: SupabaseError[] = [],
  deleteError: SupabaseError | null = null,
): {
  from: (table: string) => {
    select?: (query: string) => {
      eq: (column: string, value: unknown) => {
        eq?: (column2: string, value2: unknown) => {
          gte?: (column3: string, value3: unknown) => Promise<SupabaseResponse<unknown>>;
        };
        order?: (column: string) => Promise<SupabaseResponse<unknown>>;
      };
    };
    update?: (data: unknown) => {
      eq: (column: string, value: unknown) => Promise<SupabaseResponse<unknown>>;
    };
    delete?: () => {
      in: (column: string, values: unknown[]) => Promise<SupabaseResponse<unknown>>;
    };
  };
} {
  let updateCallCount = 0;

  return {
    from(table: string) {
      if (table === "sessions") {
        return {
          select(query: string) {
            return {
              eq(column: string, value: unknown) {
                return {
                  eq(column2: string, value2: unknown) {
                    return {
                      gte(column3: string, value3: unknown) {
                        return Promise.resolve(selectResponse);
                      },
                    };
                  },
                };
              },
            };
          },
          update(data: unknown) {
            return {
              eq(column: string, value: unknown) {
                const error = updateErrors[updateCallCount] || null;
                updateCallCount++;
                return Promise.resolve({ data: null, error });
              },
            };
          },
          delete() {
            return {
              in(column: string, values: unknown[]) {
                return Promise.resolve({ data: null, error: deleteError });
              },
            };
          },
        };
      } else if (table === "program_days") {
        return {
          select(query: string) {
            return {
              eq(column: string, value: unknown) {
                return {
                  order(column: string) {
                    return Promise.resolve(newDaysResponse);
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

console.log("\n1. Error on sessions select returns {ok: false}");
{
  const client = createFakeClient(
    { data: null, error: { message: "Database connection failed", code: "CONNECTION_ERROR" } },
    { data: [], error: null },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: false", result.ok === false);
      check("error message included", result.error?.includes("Database connection failed") ?? false);
    });
}

console.log("\n2. Error on program_days select returns {ok: false}");
{
  const client = createFakeClient(
    { data: [{ id: "s1", local_date: "2026-10-24", actual_type: "weights", planned_type: "weights", program_day_id: "old-day", program_days: { label: "Upper", day_index: 1 }, session_exercises: [] }], error: null },
    { data: null, error: { message: "Failed to fetch program days", code: "FETCH_ERROR" } },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: false", result.ok === false);
      check("error message included", result.error?.includes("Failed to fetch program days") ?? false);
    });
}

console.log("\n3. Error on update returns {ok: false}");
{
  const client = createFakeClient(
    {
      data: [
        {
          id: "s1",
          local_date: "2026-10-24",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      error: null,
    },
    {
      data: [{ id: "new-day", day_index: 1, day_type: "weights", label: "Upper" }],
      error: null,
    },
    [{ message: "Update failed: permission denied", code: "PERMISSION_DENIED" }],
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: false", result.ok === false);
      check("error indicates update failure", result.error?.includes("session updates failed") ?? false);
    });
}

console.log("\n4. Error on delete returns {ok: false}");
{
  const client = createFakeClient(
    {
      data: [
        {
          id: "s1",
          local_date: "2026-10-24",
          actual_type: "bodyweight",
          planned_type: "bodyweight",
          program_day_id: "old-day",
          program_days: { label: "Full Body", day_index: 2 },
          session_exercises: [],
        },
      ],
      error: null,
    },
    {
      data: [{ id: "new-day", day_index: 1, day_type: "weights", label: "Upper" }],
      error: null,
    },
    [],
    { message: "Delete failed: row locked", code: "ROW_LOCKED" },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: false", result.ok === false);
      check("error indicates delete failure", result.error?.includes("session updates failed") ?? false);
    });
}

console.log("\n5. Empty sessions list returns {ok: true}");
{
  const client = createFakeClient(
    { data: [], error: null },
    { data: [{ id: "new-day", day_index: 1, day_type: "weights", label: "Upper" }], error: null },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: true for empty sessions", result.ok === true);
    });
}

console.log("\n6. Empty new days list returns {ok: true}");
{
  const client = createFakeClient(
    {
      data: [
        {
          id: "s1",
          local_date: "2026-10-24",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      error: null,
    },
    { data: [], error: null },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: true for empty new days", result.ok === true);
    });
}

console.log("\n7. Successful re-point returns {ok: true}");
{
  const client = createFakeClient(
    {
      data: [
        {
          id: "s1",
          local_date: "2026-10-24",
          actual_type: "weights",
          planned_type: "weights",
          program_day_id: "old-day",
          program_days: { label: "Upper", day_index: 1 },
          session_exercises: [],
        },
      ],
      error: null,
    },
    {
      data: [{ id: "new-day", day_index: 1, day_type: "weights", label: "Upper" }],
      error: null,
    },
  );

  repointSessionsAfterRebuild(client as unknown as Client, "user1", "program1", "2026-10-24")
    .then((result) => {
      check("returns ok: true on success", result.ok === true);
      check("no error on success", result.error === undefined);
    });
}

// Wait for all async checks to complete
setTimeout(() => {
  if (failures > 0) {
    console.log(`\n❌ ${failures} failure(s)`);
    process.exit(1);
  } else {
    console.log("\n✅ All checks passed");
  }
}, 100);
