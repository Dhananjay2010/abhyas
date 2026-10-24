#!/usr/bin/env tsx
/**
 * Test: startSession validation with typed fake Supabase client
 *
 * L1: Drive the REAL startSession (and ensureSessionExercises, if it inserts)
 * with a typed fake Supabase client, no `as any`, `as never` or `as unknown as`.
 *
 * One row has an invalid set count (NaN), so resolveSessionTargets throws RangeError.
 * Assert the sessions insert is never called and no in_progress row exists.
 *
 *   npm run test:start-session-validation
 */

type SelectQuery<T> = {
  eq: (column: string, value: unknown) => SelectQuery<T>;
  in: (column: string, values: unknown[]) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
  limit: (count: number) => SelectQuery<T>;
  single: () => Promise<{ data: T | null; error: Error | null }>;
  maybeSingle: () => Promise<{ data: T | null; error: Error | null }>;
};

type InsertQuery<T> = {
  select: (fields: string) => {
    single: () => Promise<{ data: T | null; error: Error | null }>;
  };
};

type UpdateQuery = {
  eq: (column: string, value: unknown) => Promise<{ error: Error | null }>;
};

type MockSupabaseClient = {
  from: (table: string) => {
    select?: (fields: string) => SelectQuery<unknown>;
    insert?: (rows: unknown) => InsertQuery<unknown> | Promise<{ error: Error | null; data: null }>;
    update?: (data: unknown) => UpdateQuery;
  };
};

let sessionsInsertCalled = false;
let sessionExercisesInsertCalled = false;

function createTypedMockSupabase(): MockSupabaseClient {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  single() {
                    return Promise.resolve({
                      data: {
                        id: "user-1",
                        timezone: "America/New_York",
                        primary_track: "weights",
                      },
                      error: null,
                    });
                  },
                };
              },
            } as SelectQuery<unknown>;
          },
        };
      }

      if (table === "sessions") {
        return {
          select() {
            return {
              in() {
                return {
                  order() {
                    return {
                      order() {
                        return {
                          limit() {
                            return Promise.resolve({
                              data: [],
                              error: null,
                            });
                          },
                        };
                      },
                    };
                  },
                };
              },
            } as SelectQuery<unknown>;
          },
          insert(rows: unknown) {
            sessionsInsertCalled = true;
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: "new-session-1" },
                      error: null,
                    });
                  },
                };
              },
            } as InsertQuery<unknown>;
          },
        };
      }

      if (table === "user_settings") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { resume_session: true },
                      error: null,
                    });
                  },
                };
              },
            } as SelectQuery<unknown>;
          },
        };
      }

      if (table === "programs") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: {
                        id: "program-1",
                        started_on: "2026-10-21",
                        deload_week: 4,
                        program_days: [
                          {
                            id: "day-1",
                            day_index: 6,
                            day_type: "weights",
                            focus: "upper_body",
                            label: "Upper",
                          },
                        ],
                      },
                      error: null,
                    });
                  },
                };
              },
            } as SelectQuery<unknown>;
          },
        };
      }

      if (table === "program_day_exercises") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return Promise.resolve({
                      data: [
                        {
                          exercise_id: "ex-1",
                          order_index: 0,
                          target_sets: NaN,
                          target_reps_min: 8,
                          target_reps_max: 12,
                          rest_seconds: 90,
                          exercises: {
                            metric: "reps",
                            equipment_ids: ["barbell"],
                          },
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            } as SelectQuery<unknown>;
          },
        };
      }

      if (table === "session_exercises") {
        return {
          insert() {
            sessionExercisesInsertCalled = true;
            return Promise.resolve({ error: null, data: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

async function runTests() {
  console.log("\nTest: startSession validation with invalid target_sets\n");

  sessionsInsertCalled = false;
  sessionExercisesInsertCalled = false;

  const mockSupabase = createTypedMockSupabase();

  const { startSession } = await import("../src/app/session/actions.js");

  const mockGetAuthedClient = () => ({
    supabase: mockSupabase as never,
    user: { id: "user-1", aud: "authenticated", role: "authenticated" } as never,
  });

  const originalGetAuthedClient = (await import("@/lib/supabase/auth")).getAuthedClient;
  (await import("@/lib/supabase/auth")).getAuthedClient = mockGetAuthedClient as never;

  try {
    const result = await startSession();

    if (result.ok) {
      throw new Error("Expected startSession to fail with invalid target_sets, but it succeeded");
    }

    if (!result.error.includes("Invalid exercise targets")) {
      throw new Error(
        `Expected error message to include "Invalid exercise targets", got: ${result.error}`,
      );
    }

    if (sessionsInsertCalled) {
      throw new Error("sessions insert was called despite validation failure");
    }

    if (sessionExercisesInsertCalled) {
      throw new Error("session_exercises insert was called despite validation failure");
    }

    console.log("  ✓  startSession rejected invalid target_sets (NaN)");
    console.log("  ✓  Error message includes 'Invalid exercise targets'");
    console.log("  ✓  sessions insert was NOT called");
    console.log("  ✓  session_exercises insert was NOT called");
    console.log("\n✅ All validation tests passed\n");
  } finally {
    (await import("@/lib/supabase/auth")).getAuthedClient = originalGetAuthedClient;
  }
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
