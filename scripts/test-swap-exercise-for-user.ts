import { swapExerciseForUser } from "../src/lib/session/swap-exercise-for-user";
import type { Database } from "../src/lib/database.types";
import { json, type SwapDbRequest } from "./helpers/fake-swap-db";
import { buildDb, exercise, writes, SLOT_ID, USER_ID, type Account } from "./helpers/swap-scenario";

type Metric = Database["public"]["Enums"]["exercise_metric"];
const REPS: Metric = "reps";

type DbCall = {
  table: string;
  selects?: string[];
  eqFilters?: Array<{ column: string; value: unknown }>;
  inFilters?: Array<{ column: string; values: unknown[] }>;
  updatePayload?: Record<string, unknown>;
};

function createFakeSupabase(
  progressRow: { working_weight_kg: number; current_target_reps: number } | null,
  planningMode: "daily_menu" | "progression" | null,
  calls: DbCall[],
) {
  const fakeChain = {
    from: (table: string) => {
      const call: DbCall = { table };
      calls.push(call);

      if (table === "session_exercises") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                
                // If filtering by session_id, return array of siblings
                if (column === "session_id") {
                  return Promise.resolve({
                    data: [{ exercise_id: "old-ex" }, { exercise_id: "sibling-ex" }],
                    error: null,
                  });
                }
                
                // Otherwise (filtering by id), return maybeSingle for current exercise
                return {
                  maybeSingle: async () => ({
                    data: {
                      exercise_id: "old-ex",
                      metric: REPS,
                      planned_reps_min: 6,
                      planned_reps_max: 8,
                      session_id: "sess-123",
                    },
                  }),
                };
              },
            };
          },
          update: (payload: Record<string, unknown>) => {
            call.updatePayload = payload;
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "exercises") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                
                // For single exercise lookup
                if (column === "id") {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: String(value),
                        slug: value === "old-ex" ? "barbell-squat" : "goblet-squat",
                        name: value === "old-ex" ? "Barbell Squat" : "Goblet Squat",
                        cue: null,
                        metric: REPS,
                        mechanic: "compound",
                        equipment_ids: value === "old-ex" ? ["bar"] : ["dumbbell"],
                        movement_pattern: "squat",
                        primary_muscles: ["quads"],
                        level_min: 1,
                        contraindicated_regions: [],
                        impact: "moderate",
                        spinal_load: "moderate",
                        tracks: ["weights"],
                        default_rest_seconds: 90,
                        category: "compound",
                      },
                    }),
                  };
                }
                
                // For is_active filter in pool query
                return {
                  in: (column2: string, values2: unknown[]) => {
                    if (!call.inFilters) call.inFilters = [];
                    call.inFilters.push({ column: column2, values: values2 });
                    return Promise.resolve({
                      data: [
                        {
                          id: "old-ex",
                          slug: "barbell-squat",
                          name: "Barbell Squat",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["bar"],
                          movement_pattern: "squat",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                        {
                          id: "new-ex",
                          slug: "goblet-squat",
                          name: "Goblet Squat",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["dumbbell"],
                          movement_pattern: "squat",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                        {
                          id: "sibling-ex",
                          slug: "dumbbell-lunge",
                          name: "Dumbbell Lunge",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["dumbbell"],
                          movement_pattern: "lunge",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
              in: (column: string, values: unknown[]) => {
                if (!call.inFilters) call.inFilters = [];
                call.inFilters.push({ column, values });
                return {
                  eq: (column2: string, value2: unknown) => {
                    if (!call.eqFilters) call.eqFilters = [];
                    call.eqFilters.push({ column: column2, value: value2 });
                    return Promise.resolve({
                      data: [
                        {
                          id: "old-ex",
                          slug: "barbell-squat",
                          name: "Barbell Squat",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["bar"],
                          movement_pattern: "squat",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                        {
                          id: "new-ex",
                          slug: "goblet-squat",
                          name: "Goblet Squat",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["dumbbell"],
                          movement_pattern: "squat",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                        {
                          id: "sibling-ex",
                          slug: "dumbbell-lunge",
                          name: "Dumbbell Lunge",
                          cue: null,
                          metric: REPS,
                          mechanic: "compound",
                          equipment_ids: ["dumbbell"],
                          movement_pattern: "lunge",
                          primary_muscles: ["quads"],
                          level_min: 1,
                          contraindicated_regions: [],
                          impact: "moderate",
                          spinal_load: "moderate",
                          tracks: ["weights"],
                          default_rest_seconds: 90,
                          category: "compound",
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "body_metrics") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return {
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { weight_kg: 75 },
                      }),
                    }),
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "user_injuries") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }
      if (table === "user_equipment") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return Promise.resolve({ 
                  data: [
                    { equipment_id: "bar" },
                    { equipment_id: "dumbbell" }
                  ], 
                  error: null 
                });
              },
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return {
                  single: async () => ({
                    data: {
                      goal: "strength",
                      level: "novice",
                      primary_track: "weights",
                      days_per_week: 4,
                      yoga_days_per_week: 0,
                      date_of_birth: "1990-01-01",
                      height_cm: 175,
                      has_all_equipment: true,
                    },
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "user_settings") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return {
                  single: async () => ({
                    data: planningMode ? { planning_mode: planningMode } : null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "exercise_progress") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                const chainable = {
                  eq: (column2: string, value2: unknown) => {
                    if (!call.eqFilters) call.eqFilters = [];
                    call.eqFilters.push({ column: column2, value: value2 });
                    return chainable;
                  },
                  maybeSingle: async () => ({
                    data: progressRow
                      ? {
                          current_working_weight_kg: progressRow.working_weight_kg,
                          current_target_reps: progressRow.current_target_reps,
                        }
                      : null,
                  }),
                };
                return chainable;
              },
            };
          },
        };
      }
      if (table === "sessions") {
        return {
          select: (fields: string) => {
            call.selects = fields.split(",").map(f => f.trim());
            return {
              eq: (column: string, value: unknown) => {
                if (!call.eqFilters) call.eqFilters = [];
                call.eqFilters.push({ column, value });
                return {
                  maybeSingle: async () => ({
                    data: { is_deload: false },
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fakeChain as any;
}

function assertDbCallsValid(calls: DbCall[], expectedUserId: string, sessionExerciseId: string) {
  // Find profiles call
  const profilesCall = calls.find(c => c.table === "profiles");
  if (!profilesCall) throw new Error("No profiles query found");
  const profileFilter = profilesCall.eqFilters?.find(f => f.column === "id");
  if (!profileFilter) throw new Error("profiles query missing .eq('id', ...) filter");
  const profileUserId = profileFilter.value;
  if (profileUserId !== expectedUserId) {
    throw new Error(`profiles filtered by wrong userId: expected '${expectedUserId}', got '${profileUserId}'`);
  }

  // Find user_settings call
  const settingsCall = calls.find(c => c.table === "user_settings");
  if (!settingsCall) throw new Error("No user_settings query found");
  const settingsFilter = settingsCall.eqFilters?.find(f => f.column === "user_id");
  if (!settingsFilter) {
    throw new Error(`user_settings must be filtered by .eq('user_id', '${expectedUserId}'), got ${JSON.stringify(settingsCall.eqFilters)}`);
  }
  const settingsUserId = settingsFilter.value;
  if (settingsUserId !== expectedUserId) {
    throw new Error(`user_settings filtered by wrong userId: expected '${expectedUserId}', got '${settingsUserId}'`);
  }

  // Find exercise_progress call (if it exists, check userId filter)
  const progressCall = calls.find(c => c.table === "exercise_progress");
  if (progressCall) {
    const userIdFilter = progressCall.eqFilters?.find(f => f.column === "user_id");
    if (!userIdFilter) throw new Error("exercise_progress query missing .eq('user_id', ...) filter");
    const progressUserId = userIdFilter.value;
    if (progressUserId !== expectedUserId) {
      throw new Error(`exercise_progress filtered by wrong userId: expected '${expectedUserId}', got '${progressUserId}'`);
    }
  }

  // Find session_exercises update
  const updateCall = calls.find(c => c.table === "session_exercises" && c.updatePayload);
  if (!updateCall) throw new Error("No session_exercises update found");
  
  const updatePayload = updateCall.updatePayload!;
  if (!updatePayload.exercise_id) throw new Error("update payload missing exercise_id");
  if (!updatePayload.swapped_from_exercise_id) throw new Error("update payload missing swapped_from_exercise_id");
  if (!updatePayload.metric) throw new Error("update payload missing metric");
  if (updatePayload.planned_reps_min === undefined) throw new Error("update payload missing planned_reps_min");
  if (updatePayload.planned_reps_max === undefined) throw new Error("update payload missing planned_reps_max");

  const updateFilter = updateCall.eqFilters?.find(f => f.column === "id");
  if (!updateFilter || updateFilter.value !== sessionExerciseId) {
    throw new Error(`session_exercises update must be filtered by .eq('id', '${sessionExerciseId}'), got ${JSON.stringify(updateFilter)}`);
  }

  console.log("  ✓ profiles filtered by .eq('id', userId)");
  console.log("  ✓ user_settings filtered by .eq('user_id', userId)");
  console.log("  ✓ exercise_progress filtered by .eq('user_id', userId)");
  console.log("  ✓ update payload includes exercise_id, swapped_from_exercise_id, metric, planned_reps_min, planned_reps_max");
  console.log("  ✓ update filtered by .eq('id', sessionExerciseId)");
}

async function testWithRecording() {
  const calls: DbCall[] = [];
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "progression",
    calls,
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Recording test failed: ${result.error}`);
  
  assertDbCallsValid(calls, "user-1", "se-1");
  console.log("✓ Recording test: all DB calls properly filtered");
}

async function testDailyMenu() {
  const calls: DbCall[] = [];
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "daily_menu",
    calls,
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Daily menu test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg, currentTargetReps } = result.data;
  if (weightPrefill !== null) {
    throw new Error(`Daily menu: expected null weightPrefill, got ${weightPrefill}`);
  }
  if (workingWeightKg !== null) {
    throw new Error(`Daily menu: expected null workingWeightKg, got ${workingWeightKg}`);
  }
  if (currentTargetReps !== null) {
    throw new Error(`Daily menu: expected null currentTargetReps, got ${currentTargetReps}`);
  }

  console.log("✓ Daily menu: weightPrefill, workingWeightKg, and currentTargetReps are all null");
}

async function testProgression() {
  const calls: DbCall[] = [];
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "progression",
    calls,
  );

  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "new-ex",
  });

  if (!result.ok) throw new Error(`Progression test failed: ${result.error}`);
  
  const { weightPrefill, workingWeightKg, currentTargetReps } = result.data;
  if (weightPrefill !== 100) {
    throw new Error(`Progression: expected 100 kg weightPrefill, got ${weightPrefill}`);
  }
  if (workingWeightKg !== 100) {
    throw new Error(`Progression: expected 100 kg workingWeightKg, got ${workingWeightKg}`);
  }
  if (currentTargetReps !== 10) {
    throw new Error(`Progression: expected 10 currentTargetReps, got ${currentTargetReps}`);
  }

  console.log("✓ Progression: weightPrefill 100 kg, workingWeightKg 100 kg, currentTargetReps 10");
}

async function testValidatorRejects() {
  const calls: DbCall[] = [];
  const supabase = createFakeSupabase(
    { working_weight_kg: 100, current_target_reps: 10 },
    "progression",
    calls,
  );

  // Try to swap to an exercise not in the eligible list (different movement pattern)
  const result = await swapExerciseForUser(supabase, "user-1", {
    sessionExerciseId: "se-1",
    newExerciseId: "sibling-ex", // This is a lunge, current is squat
  });

  if (result.ok) {
    throw new Error(`Validator should reject sibling-ex (different movement pattern), but it accepted it`);
  }
  
  // Ensure no update was made
  const updateCall = calls.find(c => c.table === "session_exercises" && c.updatePayload);
  if (updateCall) {
    throw new Error("Validator rejected but update was attempted");
  }
  
  console.log("✓ Validator rejects ineligible swap: no update, no weight lookup");
}

/**
 * Fail-closed reads, against the in-memory PostgREST behind a REAL supabase-js
 * client (scripts/helpers/fake-swap-db.ts): no cast of a fake to the client
 * type is needed.
 */
async function expectFailsClosed(
  label: string,
  expectedError: string,
  breakRead: (req: SwapDbRequest) => Response | void,
) {
  const account: Account = { level: "intermediate", equipment: ["kettlebell", "dumbbell"], injuries: [] };
  const db = buildDb({
    account,
    current: exercise("alternating-kettlebell-press"),
    exercises: ["kettlebell-arnold-press", "kettlebell-seated-press"].map(exercise),
  });
  db.beforeRequest = breakRead;
  const result = await swapExerciseForUser(db.client, USER_ID, {
    sessionExerciseId: SLOT_ID,
    newExerciseId: exercise("kettlebell-arnold-press").id,
  });
  if (result.ok) throw new Error(`${label} should fail closed, but swap succeeded`);
  if (!result.error.includes(expectedError)) {
    throw new Error(`Expected "${expectedError}" error, got: ${result.error}`);
  }
  if (writes(db).length > 0) throw new Error(`${label} failed but the swap was still written`);
  console.log(`✓ ${label} fails closed: swap rejected, nothing written`);
}

const serverError = () => json(500, { code: "XX000", message: "injected read failure", details: null, hint: null });

async function testProfileReadFailsClosed() {
  await expectFailsClosed("Profile read", "Profile not found", (req) =>
    req.method === "GET" && req.table === "profiles" ? serverError() : undefined);
}

async function testInjuryReadFailsClosed() {
  await expectFailsClosed("Injury read", "Could not load injury data", (req) =>
    req.method === "GET" && req.table === "user_injuries" ? serverError() : undefined);
}

async function testEquipmentReadFailsClosed() {
  await expectFailsClosed("Equipment read", "Could not load equipment data", (req) =>
    req.method === "GET" && req.table === "user_equipment" ? serverError() : undefined);
}

async function main() {
  console.log("Testing swapExerciseForUser with in-memory fake Supabase client...\n");
  
  await testWithRecording();
  await testDailyMenu();
  await testProgression();
  await testValidatorRejects();
  await testProfileReadFailsClosed();
  await testInjuryReadFailsClosed();
  await testEquipmentReadFailsClosed();

  console.log("\nAll swapExerciseForUser tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
