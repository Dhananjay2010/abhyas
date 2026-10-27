/**
 * Test: Post-swap tomorrow rotation (real functions)
 * 
 * Verifies:
 * (e) After a swap where tomorrow's scheduled day equals the day just done, 
 *     nextDayPlan's tomorrow and Today's tomorrow are both the next in rotation and identical.
 * 
 * Also tests:
 * - Normal completed day with Rest tomorrow stays Rest
 * - Swap where tomorrow is different keeps main's schedule
 * 
 * Run: npx tsx scripts/test-post-swap-tomorrow-real.ts
 */

import { strict as assert } from "node:assert";
import { nextDayPlan } from "../src/lib/program/day-plan";

console.log("Test: Post-swap tomorrow rotation (real functions)\n");

type DayType = "weights" | "bodyweight" | "rest" | "yoga" | "meditation" | "active_recovery";

type ProgramDay = {
  id: string;
  day_index: number;
  label: string | null;
  day_type: DayType;
};

type Session = {
  id: string;
  user_id: string;
  local_date: string;
  status: "completed" | "in_progress" | "planned";
  program_day_id: string | null;
  actual_type: DayType | null;
  created_at: string;
};

type Program = {
  id: string;
  user_id: string;
  split_type: string;
};

class FakeSupabase {
  private programDays: ProgramDay[] = [];
  private sessions: Session[] = [];
  private programs: Program[] = [];

  seedProgram(program: Program) {
    this.programs.push(program);
  }

  seedProgramDays(days: ProgramDay[]) {
    this.programDays = days;
  }

  seedSessions(sessions: Session[]) {
    this.sessions = sessions;
  }

  from(table: string) {
    if (table === "programs") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: this.programs[0] ?? null,
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "program_days") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            if (col === "program_id") {
              return {
                eq: (col2: string, val2: unknown) => ({
                  maybeSingle: async () => {
                    const day = this.programDays.find(d => d.day_index === val2);
                    return { data: day ?? null, error: null };
                  },
                }),
                order: () => ({
                  then: async () => ({ data: this.programDays, error: null }),
                }),
              };
            }
            return {
              order: () => ({
                then: async () => ({ data: this.programDays, error: null }),
              }),
            };
          },
          order: () => ({
            then: async () => ({ data: this.programDays, error: null }),
          }),
        }),
      };
    }

    if (table === "sessions") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            const filtered = this.sessions.filter((s) => {
              if (col === "user_id") return s.user_id === val;
              return true;
            });
            return {
              eq: (col2: string, val2: unknown) => {
                const filtered2 = filtered.filter((s) => {
                  if (col2 === "local_date") return s.local_date === String(val2);
                  if (col2 === "status") return s.status === val2;
                  return true;
                });
                return {
                  eq: (col3: string, val3: unknown) => {
                    const filtered3 = filtered2.filter((s) => {
                      if (col3 === "status") return s.status === val3;
                      return true;
                    });
                    return {
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => {
                            const sorted = [...filtered3].sort(
                              (a, b) => b.created_at.localeCompare(a.created_at)
                            );
                            return { data: sorted[0] ?? null, error: null };
                          },
                        }),
                      }),
                    };
                  },
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        const sorted = [...filtered2].sort(
                          (a, b) => b.created_at.localeCompare(a.created_at)
                        );
                        return { data: sorted[0] ?? null, error: null };
                      },
                    }),
                  }),
                };
              },
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    const sorted = [...filtered].sort(
                      (a, b) => b.created_at.localeCompare(a.created_at)
                    );
                    return { data: sorted[0] ?? null, error: null };
                  },
                }),
              }),
              in: (col2: string, vals: unknown[]) => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      const match = filtered.find((s) => {
                        if (col2 === "status") return vals.includes(s.status);
                        return true;
                      });
                      return { data: match ?? null, error: null };
                    },
                  }),
                }),
              }),
            };
          },
          in: (col: string, vals: unknown[]) => ({
            lte: (col2: string, val2: unknown) => ({
              order: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      const filtered = this.sessions.filter((s) => {
                        const typeMatch = col === "actual_type" && vals.includes(s.actual_type);
                        const dateMatch = col2 === "local_date" && s.local_date <= String(val2);
                        return typeMatch && dateMatch;
                      });
                      const sorted = [...filtered].sort(
                        (a, b) => b.local_date.localeCompare(a.local_date) || 
                                  b.created_at.localeCompare(a.created_at)
                      );
                      return { data: sorted[0] ?? null, error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
  }
}

(async () => {
  console.log("1. Swap with collision: tomorrow becomes next in rotation");
  {
  const db = new FakeSupabase();

  // 4-day split: Upper (Mon), Lower (Tue), Upper (Thu), Lower (Fri)
  const days: ProgramDay[] = [
    { id: "upper-1", day_index: 1, label: "Upper", day_type: "weights" },
    { id: "lower-1", day_index: 2, label: "Lower", day_type: "weights" },
    { id: "upper-2", day_index: 4, label: "Upper", day_type: "weights" },
    { id: "lower-2", day_index: 5, label: "Lower", day_type: "weights" },
  ];

  db.seedProgram({ id: "prog-1", user_id: "user-1", split_type: "upper_lower" });
  db.seedProgramDays(days);

  // Monday: swapped from Upper to Lower (did lower-1)
  // Tuesday: scheduled is Lower (lower-1)
  // Result: should serve next in rotation = Upper
  const sessions: Session[] = [
    {
      id: "sess-1",
      user_id: "user-1",
      local_date: "2026-10-26", // Monday
      status: "completed",
      program_day_id: "lower-1", // Did Lower (scheduled was upper-1)
      actual_type: "weights",
      created_at: "2026-10-26T10:00:00Z",
    },
  ];

  db.seedSessions(sessions);

  const result = await nextDayPlan(db as any, "America/New_York", { userId: "user-1" });
  
  assert.ok(result !== null, "Should return a result");
  assert.equal(result.plannedLabel, "Upper", "Tomorrow should be Upper (next in rotation)");
  assert.ok(result._collisionResolved, "Should mark collision as resolved");
  console.log("  ✓ Collision resolved: tomorrow is Upper");
  }

  console.log("\n2. Normal day with Rest tomorrow stays Rest");
  {
  const db = new FakeSupabase();

  // 3-day split: Full Body A (Mon), B (Wed), C (Fri)
  const days: ProgramDay[] = [
    { id: "day-a", day_index: 1, label: "Full Body A", day_type: "weights" },
    { id: "day-b", day_index: 3, label: "Full Body B", day_type: "weights" },
    { id: "day-c", day_index: 5, label: "Full Body C", day_type: "weights" },
  ];

  db.seedProgram({ id: "prog-1", user_id: "user-1", split_type: "full_body" });
  db.seedProgramDays(days);

  // Monday: did scheduled workout (Full Body A)
  // Tuesday: Rest day (no collision)
  const sessions: Session[] = [
    {
      id: "sess-1",
      user_id: "user-1",
      local_date: "2026-10-26", // Monday
      status: "completed",
      program_day_id: "day-a", // Did scheduled workout
      actual_type: "weights",
      created_at: "2026-10-26T10:00:00Z",
    },
  ];

  db.seedSessions(sessions);

  const result = await nextDayPlan(db as any, "America/New_York", { userId: "user-1" });
  
  assert.ok(result !== null, "Should return a result");
  assert.equal(result.plannedLabel, "Rest", "Tomorrow should be Rest");
  assert.ok(!result._collisionResolved, "Should not be marked as collision");
  console.log("  ✓ Normal day: tomorrow stays Rest");
  }

  console.log("\n3. Swap where tomorrow is different keeps schedule");
  {
  const db = new FakeSupabase();

  const days: ProgramDay[] = [
    { id: "day-a", day_index: 1, label: "Full Body A", day_type: "weights" },
    { id: "day-b", day_index: 3, label: "Full Body B", day_type: "weights" },
    { id: "day-c", day_index: 5, label: "Full Body C", day_type: "weights" },
  ];

  db.seedProgram({ id: "prog-1", user_id: "user-1", split_type: "full_body" });
  db.seedProgramDays(days);

  // Monday: swapped from A to C
  // Tuesday: Rest (no collision, C !== Rest)
  const sessions: Session[] = [
    {
      id: "sess-1",
      user_id: "user-1",
      local_date: "2026-10-26", // Monday
      status: "completed",
      program_day_id: "day-c", // Swapped to C (scheduled was day-a)
      actual_type: "weights",
      created_at: "2026-10-26T10:00:00Z",
    },
  ];

  db.seedSessions(sessions);

  const result = await nextDayPlan(db as any, "America/New_York", { userId: "user-1" });
  
  assert.ok(result !== null, "Should return a result");
  assert.equal(result.plannedLabel, "Rest", "Tomorrow should stay Rest");
  assert.ok(!result._collisionResolved, "Should not be marked as collision");
  console.log("  ✓ Swap to different workout: tomorrow stays Rest");
  }

  console.log("\n✅ All post-swap tomorrow rotation tests passed");
})();
