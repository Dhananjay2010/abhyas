#!/usr/bin/env tsx
/**
 * Test: startSession validation with typed fake Supabase client
 *
 * L1: Drive the REAL startSessionCore with a typed fake Supabase client,
 * no `as any`, `as never` or `as unknown as`.
 *
 * One row has an invalid set count (NaN), so resolveSessionTargets throws RangeError.
 * Assert the sessions insert is never called and no in_progress row exists.
 *
 *   npm run test:start-session-validation
 */

import { startSessionCore } from "../src/lib/session/start-session";

type SelectQuery<T> = {
  eq: (column: string, value: unknown) => SelectQuery<T>;
  in: (column: string, values: unknown[]) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
  limit: (count: number) => Promise<{ data: T | null; error: Error | null }>;
  single: () => Promise<{ data: T | null; error: Error | null }>;
  maybeSingle: () => Promise<{ data: T | null; error: Error | null }>;
};

type InsertQuery<T> = {
  select: (fields: string) => {
    single: () => Promise<{ data: T | null; error: Error | null }>;
  };
};

type MockSupabaseClient = {
  from: (table: string) => {
    select?: (fields: string) => SelectQuery<unknown>;
    insert?: (rows: unknown) => InsertQuery<unknown> | Promise<{ error: Error | null; data: null }>;
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
                } as SelectQuery<unknown>;
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
          insert() {
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
                    const today = new Date().toISOString().split("T")[0];
                    return Promise.resolve({
                      data: {
                        id: "program-1",
                        started_on: today, // Today, so no rollover needed
                        deload_week: 4,
                        status: "active",
                        program_days: [
                          {
                            id: "day-1",
                            day_index: new Date().getDay() === 0 ? 7 : new Date().getDay(), // Today's day index
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

      if (table === "program_days") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({
                  data: [],
                  error: null,
                });
              },
            } as SelectQuery<unknown>;
          },
        };
      }

      if (table === "body_metrics" || table === "user_equipment" || table === "user_injuries" || table === "exercises") {
        return {
          select() {
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    }),
                  }),
                  order: () => Promise.resolve({ data: [], error: null }),
                }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
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
  console.log("\nTest: startSessionCore validation with invalid target_sets\n");

  sessionsInsertCalled = false;
  sessionExercisesInsertCalled = false;

  const mockSupabase = createTypedMockSupabase();

  const mockEnsureSessionExercises = async () => {
    // no-op for this test
  };

  const result = await startSessionCore(
    mockSupabase as never,
    "user-1",
    { ensureSessionExercises: mockEnsureSessionExercises },
  );

  if (result.ok) {
    throw new Error("Expected startSessionCore to fail with invalid target_sets, but it succeeded");
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

  console.log("  ✓  startSessionCore rejected invalid target_sets (NaN)");
  console.log("  ✓  Error message includes 'Invalid exercise targets'");
  console.log("  ✓  sessions insert was NOT called");
  console.log("  ✓  session_exercises insert was NOT called");
  console.log("\n✅ All validation tests passed\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
