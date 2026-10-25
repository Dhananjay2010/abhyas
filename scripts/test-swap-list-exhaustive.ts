#!/usr/bin/env tsx
/**
 * Item A Gate: Exhaustive swap-list vs validator consistency test.
 * 
 * Verifies that findAlternatives' offered list and swapExerciseForUser's validator
 * produce identical results (0 offered-but-refused, 0 accepted-not-offered).
 * 
 * Uses TWO INDEPENDENT computations:
 * 1. REAL buildEligibleSwapList (what findAlternatives offers)
 * 2. REAL swapExerciseForUser with in-memory Supabase client (validator)
 */

import { swapExerciseForUser } from "../src/lib/session/swap-exercise-for-user";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import type { CandidateExercise } from "../src/lib/program/generate";
import catalogue from "./fixtures/catalogue.json";
import type { Database } from "../src/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = "current" | "past";
type Metric = Database["public"]["Enums"]["exercise_metric"];

const catalogueExercises = catalogue as CandidateExercise[];
const bySlug = new Map(catalogueExercises.map(e => [e.slug, e]));
const byId = new Map(catalogueExercises.map(e => [e.id, e]));

// Test profiles covering injury/equipment/level variations
const testProfiles = [
  {
    name: "Healthy beginner, gym",
    level: "beginner" as const,
    equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar"],
    injuries: [],
  },
  {
    name: "Current knee, intermediate, home",
    level: "intermediate" as const,
    equipment: ["dumbbell", "adjustable_bench", "pull_up_bar"],
    injuries: [{ body_region: "knee" as BodyRegion, severity: "current" as InjurySeverity }],
  },
  {
    name: "Past knee, expert, gym",
    level: "expert" as const,
    equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine"],
    injuries: [{ body_region: "knee" as BodyRegion, severity: "past" as InjurySeverity }],
  },
  {
    name: "Current shoulder, beginner, bodyweight",
    level: "beginner" as const,
    equipment: [],
    injuries: [{ body_region: "shoulder" as BodyRegion, severity: "current" as InjurySeverity }],
  },
  {
    name: "Past lower_back, intermediate, DB-only",
    level: "intermediate" as const,
    equipment: ["dumbbell", "adjustable_bench"],
    injuries: [{ body_region: "lower_back" as BodyRegion, severity: "past" as InjurySeverity }],
  },
  {
    name: "Current wrist, expert, gym",
    level: "expert" as const,
    equipment: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine"],
    injuries: [{ body_region: "wrist" as BodyRegion, severity: "current" as InjurySeverity }],
  },
  {
    name: "Past knee + current shoulder, intermediate",
    level: "intermediate" as const,
    equipment: ["dumbbell", "kettlebell", "pull_up_bar"],
    injuries: [
      { body_region: "knee" as BodyRegion, severity: "past" as InjurySeverity },
      { body_region: "shoulder" as BodyRegion, severity: "current" as InjurySeverity },
    ],
  },
  {
    name: "Healthy expert, kettlebell-only",
    level: "expert" as const,
    equipment: ["kettlebell"],
    injuries: [],
  },
];

// Create fake Supabase client that returns the right data for each test case
function createFakeSupabase(
  currentExercise: CandidateExercise,
  _candidateExercise: CandidateExercise,
  pool: CandidateExercise[],
  sessionSiblings: string[],
  profile: {
    goal: string;
    level: string;
    primary_track: string;
    days_per_week: number;
    yoga_days_per_week: number;
    date_of_birth: string | null;
    height_cm: number | null;
    has_all_equipment: boolean;
  },
  equipmentIds: string[],
  injuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }>,
) {
  const fakeChain = {
    from: (table: string) => {
      if (table === "session_exercises") {
        return {
          select: (_fields: string) => {
            return {
              eq: (column: string, _value: unknown) => {
                // If filtering by session_id, return array of siblings
                if (column === "session_id") {
                  return Promise.resolve({
                    data: sessionSiblings.map(id => ({ exercise_id: id })),
                    error: null,
                  });
                }
                
                // Otherwise (filtering by id), return maybeSingle for current exercise
                return {
                  maybeSingle: async () => ({
                    data: {
                      exercise_id: currentExercise.id,
                      metric: currentExercise.metric as Metric,
                      planned_reps_min: 6,
                      planned_reps_max: 8,
                      session_id: "sess-123",
                    },
                  }),
                };
              },
            };
          },
          update: (_payload: Record<string, unknown>) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      
      if (table === "exercises") {
        return {
          select: (_fields: string) => {
            return {
              eq: (column: string, value: unknown) => {
                // Single exercise lookup
                if (column === "id") {
                  const ex = byId.get(value as string);
                  return {
                    maybeSingle: async () => ({
                      data: ex ? { ...ex } : null,
                    }),
                  };
                }
                
                // is_active filter for pool query
                if (column === "is_active") {
                  return {
                    in: (_column2: string, _values2: unknown[]) => {
                      return Promise.resolve({
                        data: pool.map(e => ({ ...e })),
                        error: null,
                      });
                    },
                  };
                }
                
                return Promise.resolve({ data: null, error: null });
              },
              in: (_column: string, _values: unknown[]) => {
                return {
                  eq: (_column2: string, _value2: unknown) => {
                    return Promise.resolve({
                      data: pool.map(e => ({ ...e })),
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
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return {
                  order: (_column: string, _options: unknown) => ({
                    limit: (_n: number) => ({
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
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return Promise.resolve({ data: injuries, error: null });
              },
            };
          },
        };
      }
      
      if (table === "user_equipment") {
        return {
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return Promise.resolve({ 
                  data: equipmentIds.map(id => ({ equipment_id: id })), 
                  error: null 
                });
              },
            };
          },
        };
      }
      
      if (table === "profiles") {
        return {
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return {
                  single: async () => ({
                    data: profile,
                  }),
                };
              },
            };
          },
        };
      }
      
      if (table === "user_settings") {
        return {
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                return {
                  single: async () => ({
                    data: { planning_mode: "progression" },
                  }),
                };
              },
            };
          },
        };
      }
      
      if (table === "exercise_progress") {
        return {
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                const chainable = {
                  eq: (_column2: string, _value2: unknown) => {
                    return chainable;
                  },
                  maybeSingle: async () => ({
                    data: null,
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
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
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
      
      if (table === "exercise_history") {
        return {
          select: (_fields: string) => {
            return {
              eq: (_column: string, _value: unknown) => {
                const chainable = {
                  eq: (_column2: string, _value2: unknown) => {
                    return chainable;
                  },
                  order: (_column: string, _options: unknown) => chainable,
                  limit: (_n: number) => chainable,
                  maybeSingle: async () => ({
                    data: null,
                  }),
                };
                return chainable;
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

console.log("Item A Gate: Swap list vs validator exhaustive consistency test");
console.log("─".repeat(70));

async function main() {
  let totalOfferedButRefused = 0;
  let totalAcceptedNotOffered = 0;
  let testsRun = 0;

  // Test ALL catalogue exercises as current exercise
  const testCases = catalogueExercises
    .filter(e => e.movement_pattern) // Must have a pattern
    .map(e => ({ slug: e.slug, pattern: e.movement_pattern }));

  for (const profile of testProfiles) {
    for (const testCase of testCases) {
      const currentExercise = bySlug.get(testCase.slug);
      if (!currentExercise) {
        console.log(`\n⚠️  Skipping ${testCase.slug} (not in catalogue)`);
        continue;
      }

      testsRun++;

      // Build GeneratorInput
      const generatorInput = buildGeneratorInput({
        userId: "test-user",
        profile: {
          goal: "muscle_gain",
          level: profile.level,
          primary_track: "weights",
          days_per_week: 4,
          yoga_days_per_week: 0,
          date_of_birth: "1990-01-01",
          height_cm: 175,
          has_all_equipment: false,
        },
        equipmentIds: profile.equipment,
        injuries: profile.injuries,
        weightKg: 75,
      });

      // Get swap patterns
      const patterns = getSwapPatterns(currentExercise.movement_pattern, generatorInput);
      
      // Build pool (same as findAlternatives does)
      const pool = catalogueExercises.filter(e => 
        patterns.includes(e.movement_pattern) && e.id !== currentExercise.id
      );

      // COMPUTATION 1: Build eligible swap list (what findAlternatives offers)
      const offeredList = buildEligibleSwapList({
        currentExercise,
        sessionExerciseId: "test-session-ex-id",
        generatorInput,
        pool,
        alreadyInSession: new Set([currentExercise.id]),
      });

      const offeredIds = new Set(offeredList.map(e => e.id));

      // COMPUTATION 2: Test each candidate with REAL swapExerciseForUser validator
      const acceptedIds = new Set<string>();
      
      const profileData = {
        goal: "muscle_gain",
        level: profile.level,
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        date_of_birth: "1990-01-01",
        height_cm: 175,
        has_all_equipment: false,
      };
      
      for (const candidate of pool) {
        const fakeSupabase = createFakeSupabase(
          currentExercise,
          candidate,
          pool,
          [currentExercise.id], // siblings in session
          profileData,
          profile.equipment,
          profile.injuries,
        );
        
        const result = await swapExerciseForUser(fakeSupabase, "test-user", {
          sessionExerciseId: "test-session-ex-id",
          newExerciseId: candidate.id,
        });
        
        if (result.ok) {
          acceptedIds.add(candidate.id);
        }
      }

      // Check for mismatches
      const offeredButRefused = [...offeredIds].filter(id => !acceptedIds.has(id));
      const acceptedNotOffered = [...acceptedIds].filter(id => !offeredIds.has(id));

      totalOfferedButRefused += offeredButRefused.length;
      totalAcceptedNotOffered += acceptedNotOffered.length;

      if (offeredButRefused.length > 0 || acceptedNotOffered.length > 0) {
        console.log(`\n❌ MISMATCH: ${profile.name} → ${testCase.slug}`);
        if (offeredButRefused.length > 0) {
          const slugs = offeredButRefused
            .map(id => catalogueExercises.find(e => e.id === id)?.slug || id)
            .slice(0, 3);
          console.log(`   Offered but refused: ${offeredButRefused.length} (${slugs.join(", ")}...)`);
        }
        if (acceptedNotOffered.length > 0) {
          const slugs = acceptedNotOffered
            .map(id => catalogueExercises.find(e => e.id === id)?.slug || id)
            .slice(0, 3);
          console.log(`   Accepted not offered: ${acceptedNotOffered.length} (${slugs.join(", ")}...)`);
        }
      }
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`Tests run: ${testsRun}`);
  console.log(`Offered but refused: ${totalOfferedButRefused}`);
  console.log(`Accepted not offered: ${totalAcceptedNotOffered}`);

  let failures = 0;
  function check(label: string, ok: boolean, detail: string = ""): void {
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` -- ${detail}` : ""}`);
  }

  check("Gate: 0 offered-but-refused", totalOfferedButRefused === 0);
  check("Gate: 0 accepted-not-offered", totalAcceptedNotOffered === 0);

  console.log(`\n${failures === 0 ? "✅ PASSED" : `❌ FAILED: ${failures} check(s) failed`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
