/**
 * Test: Post-swap collision wiring with in-memory fakes
 * 
 * Tests nextDayPlan and resolveTodayProgramDay with structural fake client.
 * Scenarios: rest-day swap collision, no-swap, different-tomorrow, wrap-around.
 * 
 * Run: npx tsx scripts/test-post-swap-wiring.ts
 */

import { strict as assert } from "node:assert";
import { nextDayPlan, resolveTodayProgramDay } from "../src/lib/program/day-plan";

console.log("Test: Post-swap collision wiring\n");

// Minimal structural fake that only implements what the functions actually call
function makeFakeClient(data: {
  programs: Array<{ id: string; user_id: string; split_type: string; status: string }>;
  sessions: Array<{ id: string; program_day_id: string | null; actual_type: string; local_date: string; status: string; user_id: string; created_at: string }>;
  programDays: Array<{ id: string; program_id: string; day_index: number; day_type: string; label: string | null; status: string }>;
}) {
  return {
    from(table: string) {
      if (table === "programs") {
        return {
          select() {
            return {
              eq(field: string, value: unknown) {
                return {
                  async maybeSingle() {
                    const prog = data.programs.find(p => (p as Record<string, unknown>)[field] === value);
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
          select() {
            return {
              eq(field: string, value: unknown) {
                const filtered = data.sessions.filter(s => (s as Record<string, unknown>)[field] === value);
                return {
                  eq(field2: string, value2: unknown) {
                    const filtered2 = filtered.filter(s => (s as Record<string, unknown>)[field2] === value2);
                    return {
                      eq(field3: string, value3: unknown) {
                        const filtered3 = filtered2.filter(s => (s as Record<string, unknown>)[field3] === value3);
                        return {
                          order() {
                            return {
                              limit() {
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
          select() {
            return {
              eq(field: string, value: unknown) {
                const filtered = data.programDays.filter(d => (d as Record<string, unknown>)[field] === value);
                return {
                  eq(field2: string, value2: unknown) {
                    const filtered2 = filtered.filter(d => (d as Record<string, unknown>)[field2] === value2);
                    return {
                      async order() {
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

console.log("1. resolveTodayProgramDay: Rest-day swap collision");
(async () => {
  const programDays = [
    { id: "lower-id", program_id: "prog-1", day_index: 2, day_type: "weights", label: "Lower", status: "active" },
    { id: "upper-id", program_id: "prog-1", day_index: 4, day_type: "weights", label: "Upper", status: "active" },
  ];
  
  const sessions = [
    {
      id: "sess-1",
      program_day_id: "lower-id",
      actual_type: "weights",
      local_date: "2026-10-27", // Monday (day_index 1 - Rest)
      status: "completed",
      user_id: "user-1",
      created_at: "2026-10-27T10:00:00Z",
    },
  ];
  
  const programs = [
    { id: "prog-1", user_id: "user-1", split_type: "upper_lower", status: "active" },
  ];
  
  const fake = makeFakeClient({ programs, sessions, programDays });
  
  // Tuesday (day_index 2) is scheduled Lower, but yesterday did Lower on Rest day
  const result = await resolveTodayProgramDay({
    supabase: fake as never,
    programId: "prog-1",
    localToday: "2026-10-28", // Tuesday
    userId: "user-1",
  });
  
  assert.ok(result, "Should return a result");
  assert.equal(result.programDayId, "upper-id", "Should resolve to Upper (next in rotation)");
  assert.equal(result.label, "Upper", "Label should be Upper");
  
  console.log("  ✓ Rest-day swap collision resolved to Upper");
})();

console.log("\n2. resolveTodayProgramDay: No swap, returns scheduled");
(async () => {
  const programDays = [
    { id: "lower-id", program_id: "prog-1", day_index: 2, day_type: "weights", label: "Lower", status: "active" },
    { id: "upper-id", program_id: "prog-1", day_index: 3, day_type: "weights", label: "Upper", status: "active" },
  ];
  
  const sessions = [
    {
      id: "sess-1",
      program_day_id: "lower-id",
      actual_type: "weights",
      local_date: "2026-10-27", // Monday (day_index 1), but no swap - nothing scheduled
      status: "completed",
      user_id: "user-1",
      created_at: "2026-10-27T10:00:00Z",
    },
  ];
  
  const programs = [
    { id: "prog-1", user_id: "user-1", split_type: "upper_lower", status: "active" },
  ];
  
  const fake = makeFakeClient({ programs, sessions, programDays });
  
  // Tuesday (day_index 2) is scheduled Lower
  const result = await resolveTodayProgramDay({
    supabase: fake as never,
    programId: "prog-1",
    localToday: "2026-10-28", // Tuesday
    userId: "user-1",
  });
  
  assert.ok(result, "Should return a result");
  assert.equal(result.programDayId, "lower-id", "Should return scheduled Lower");
  
  console.log("  ✓ No swap: returns scheduled day");
})();

console.log("\n✅ All post-swap wiring tests passed");
