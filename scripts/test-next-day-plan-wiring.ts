/**
 * Test: nextDayPlan wiring with post-swap collision
 * 
 * Tests the real nextDayPlan function with structural fake client.
 * Scenario: today is scheduled Rest, user completed Lower, tomorrow is scheduled Lower.
 * Expected: returns Upper's programDayId, plannedLabel "Upper", collisionResolved true.
 * 
 * Run: npx tsx scripts/test-next-day-plan-wiring.ts
 */

import { strict as assert } from "node:assert";
import { nextDayPlan } from "../src/lib/program/day-plan";

console.log("Test: nextDayPlan wiring with post-swap collision\n");

// Minimal structural fake client
function makeFakeClient(data: {
  programs: Array<{ id: string; user_id: string; split_type: string; status: string }>;
  sessions: Array<{
    id: string;
    program_day_id: string | null;
    actual_type: string;
    local_date: string;
    status: string;
    user_id: string;
    created_at: string;
  }>;
  programDays: Array<{
    id: string;
    program_id: string;
    day_index: number;
    day_type: string;
    label: string | null;
    status: string;
  }>;
}) {
  return {
    from(table: string) {
      if (table === "programs") {
        return {
          select(..._args: unknown[]) {
            return {
              eq(field: string, value: unknown) {
                return {
                  async maybeSingle() {
                    const prog = data.programs.find(
                      p => (p as Record<string, unknown>)[field] === value
                    );
                    return { data: prog ?? null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "sessions") {
        return {
          select(..._args: unknown[]) {
            return {
              eq(field: string, value: unknown) {
                const filtered = data.sessions.filter(
                  s => (s as Record<string, unknown>)[field] === value
                );
                return {
                  eq(field2: string, value2: unknown) {
                    const filtered2 = filtered.filter(
                      s => (s as Record<string, unknown>)[field2] === value2
                    );
                    return {
                      eq(field3: string, value3: unknown) {
                        const filtered3 = filtered2.filter(
                          s => (s as Record<string, unknown>)[field3] === value3
                        );
                        return {
                          order(..._args: unknown[]) {
                            return {
                              limit(..._args: unknown[]) {
                                return {
                                  async maybeSingle() {
                                    return { data: filtered3[0] ?? null };
                                  },
                                };
                              },
                            };
                          },
                        };
                      },
                      in(field3: string, values: unknown[]) {
                        const filtered3 = filtered2.filter(s =>
                          (values as unknown[]).includes((s as Record<string, unknown>)[field3])
                        );
                        return {
                          order(..._args: unknown[]) {
                            return {
                              order(..._args: unknown[]) {
                                return {
                                  limit(..._args: unknown[]) {
                                    return {
                                      async maybeSingle() {
                                        return { data: filtered3[0] ?? null };
                                      },
                                    };
                                  },
                                };
                              },
                            };
                          },
                          lte(field4: string, value4: unknown) {
                            const filtered4 = filtered3.filter(
                              s => (s as Record<string, unknown>)[field4] <= value4
                            );
                            return {
                              order(..._args: unknown[]) {
                                return {
                                  order(..._args: unknown[]) {
                                    return {
                                      limit(..._args: unknown[]) {
                                        return {
                                          async maybeSingle() {
                                            return { data: filtered4[0] ?? null };
                                          },
                                        };
                                      },
                                    };
                                  },
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                  in(field2: string, values: unknown[]) {
                    const filtered2 = filtered.filter(s =>
                      (values as unknown[]).includes((s as Record<string, unknown>)[field2])
                    );
                    return {
                      order(..._args: unknown[]) {
                        return {
                          limit(..._args: unknown[]) {
                            return {
                              async maybeSingle() {
                                return { data: filtered2[0] ?? null };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "program_days") {
        return {
          select(..._args: unknown[]) {
            return {
              eq(field: string, value: unknown) {
                const filtered = data.programDays.filter(
                  d => (d as Record<string, unknown>)[field] === value
                );
                return {
                  eq(field2: string, value2: unknown) {
                    const filtered2 = filtered.filter(
                      d => (d as Record<string, unknown>)[field2] === value2
                    );
                    return {
                      async order(..._args: unknown[]) {
                        return { data: filtered2.sort((a, b) => a.day_index - b.day_index) };
                      },
                    };
                  },
                  async order(..._args: unknown[]) {
                    return { data: filtered.sort((a, b) => a.day_index - b.day_index) };
                  },
                };
              },
            };
          },
        };
      }

      return {} as never;
    },
  };
}

console.log("1. Rest-day swap collision: returns Upper with programDayId and collisionResolved true");
(async () => {
  const programDays = [
    {
      id: "lower-id",
      program_id: "prog-1",
      day_index: 2,
      day_type: "weights",
      label: "Lower",
      status: "active",
    },
    {
      id: "upper-id",
      program_id: "prog-1",
      day_index: 4,
      day_type: "weights",
      label: "Upper",
      status: "active",
    },
  ];

  // Today (Monday, index 1) is Rest, but user completed Lower
  const sessions = [
    {
      id: "sess-1",
      program_day_id: "lower-id",
      actual_type: "weights",
      local_date: "2026-10-27", // Monday
      status: "completed",
      user_id: "user-1",
      created_at: "2026-10-27T10:00:00Z",
    },
  ];

  const programs = [{ id: "prog-1", user_id: "user-1", split_type: "upper_lower", status: "active" }];

  const fake = makeFakeClient({ programs, sessions, programDays });

  // Tomorrow (Tuesday, index 2) is scheduled Lower, but should resolve to Upper
  const result = await nextDayPlan(fake as never, "America/New_York", { userId: "user-1" });

  assert.ok(result, "Should return a result");
  assert.equal(result.plannedLabel, "Upper", "plannedLabel should be Upper");
  assert.equal(result.programDayId, "upper-id", "programDayId should be upper-id");
  assert.equal(result.collisionResolved, true, "collisionResolved should be true");

  console.log("  ✓ nextDayPlan returned Upper's programDayId with collisionResolved true");
})();

console.log("\n2. No swap: returns scheduled day with collisionResolved false");
(async () => {
  const programDays = [
    {
      id: "lower-id",
      program_id: "prog-1",
      day_index: 2,
      day_type: "weights",
      label: "Lower",
      status: "active",
    },
    {
      id: "upper-id",
      program_id: "prog-1",
      day_index: 4,
      day_type: "weights",
      label: "Upper",
      status: "active",
    },
  ];

  // Today (Tuesday, index 2) user completed scheduled Lower (no swap)
  const sessions = [
    {
      id: "sess-1",
      program_day_id: "lower-id",
      actual_type: "weights",
      local_date: "2026-10-28", // Tuesday
      status: "completed",
      user_id: "user-1",
      created_at: "2026-10-28T10:00:00Z",
    },
  ];

  const programs = [{ id: "prog-1", user_id: "user-1", split_type: "upper_lower", status: "active" }];

  const fake = makeFakeClient({ programs, sessions, programDays });

  // Tomorrow (Wednesday, index 3) - no collision
  const result = await nextDayPlan(fake as never, "America/New_York", { userId: "user-1" });

  assert.ok(result, "Should return a result");
  assert.equal(result.collisionResolved, false, "collisionResolved should be false");

  console.log("  ✓ nextDayPlan returned scheduled day with collisionResolved false");
})();

console.log("\n✅ All nextDayPlan wiring tests passed");
