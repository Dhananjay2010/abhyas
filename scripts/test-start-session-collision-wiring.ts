/**
 * Test: start-session collision resolution wiring
 * 
 * Tests the real start-session deps (resolveTodayDay) with structural fake client.
 * Scenario: yesterday was scheduled Rest, user did Lower (swap), today is scheduled Lower.
 * Expected: resolveTodayDay returns Upper's programDayId, matching loadTodayPlan.
 * 
 * Run: npx tsx scripts/test-start-session-collision-wiring.ts
 */

import { strict as assert } from "node:assert";
import { resolveTodayProgramDay } from "../src/lib/program/day-plan";

console.log("Test: start-session collision resolution wiring\n");

// Minimal structural fake client
function makeFakeClient(data: {
  sessions: Array<{
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

console.log("1. Rest-day swap collision: resolveTodayDay returns Upper's programDayId");
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

  // Yesterday (Monday, index 1) was Rest, user did Lower (swap)
  const sessions = [
    {
      program_day_id: "lower-id",
      actual_type: "weights",
      local_date: "2026-10-27", // Yesterday
      status: "completed",
      user_id: "user-1",
      created_at: "2026-10-27T10:00:00Z",
    },
  ];

  const fake = makeFakeClient({ sessions, programDays });

  // Today (Tuesday, index 2) is scheduled Lower
  const result = await resolveTodayProgramDay({
    supabase: fake as never,
    programId: "prog-1",
    localToday: "2026-10-28",
    userId: "user-1",
  });

  assert.ok(result, "Should return a result");
  assert.equal(result.programDayId, "upper-id", "Should return Upper's programDayId (collision resolved)");
  assert.equal(result.label, "Upper", "Label should be Upper");
  assert.equal(result.dayType, "weights", "Day type should be weights");

  console.log("  ✓ resolveTodayDay returned Upper's programDayId after collision resolution");
})();

console.log("\n2. No swap: resolveTodayDay returns scheduled day");
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

  // Yesterday (Monday, index 1) user did nothing
  const sessions = [] as never[];

  const fake = makeFakeClient({ sessions, programDays });

  // Today (Tuesday, index 2) is scheduled Lower
  const result = await resolveTodayProgramDay({
    supabase: fake as never,
    programId: "prog-1",
    localToday: "2026-10-28",
    userId: "user-1",
  });

  assert.ok(result, "Should return a result");
  assert.equal(result.programDayId, "lower-id", "Should return Lower's programDayId (no collision)");
  assert.equal(result.label, "Lower", "Label should be Lower");

  console.log("  ✓ resolveTodayDay returned scheduled day when no collision");
})();

console.log("\n✅ All start-session collision wiring tests passed");
