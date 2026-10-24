/**
 * Knee Safety Matrix Test
 * 
 * Tests knee-safe quad behavior (restored from PR #53) across a comprehensive
 * matrix of knee-injured profiles: all combinations of level, equipment, session
 * length, and frequency.
 * 
 * Uses REAL generateProgram with the REAL catalogue (scripts/fixtures/catalogue.json).
 * 
 * Knee safety rules (from PR #53 coordinator decision):
 * 1. First lower-body main exercise is knee-safe quad from allowlist
 * 2. Knee-safe quad comes before any hinge
 * 3. No two hinges are adjacent
 * 4. Respects contraindicated_regions (no non-safe squat/lunge/jump)
 * 5. Deterministic (same input → same output)
 */
import { readFileSync } from "node:fs";
import {
  generateProgram,
  isEligible,
  type CandidateExercise,
  type GeneratorInput,
  KNEE_SAFE_QUAD_EXERCISES,
  FLOOR_PULL_DEADLIFTS,
} from "../src/lib/program/generate";

// Load real catalogue
let catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Inject synthetic untagged lunge to make the untagged-squat check bite
const syntheticLunge: CandidateExercise = {
  id: "synthetic-untagged-lunge-test",
  slug: "synthetic-untagged-lunge",
  name: "Synthetic Untagged Lunge",
  movement_pattern: "lunge",
  mechanic: "compound",
  level_min: "beginner",
  equipment_ids: [],
  primary_muscles: ["quads", "glutes"],
  tracks: ["bodyweight"],
  metric: "reps",
  contraindicated_regions: [], // NOT tagged as knee contraindicated
  impact: "low",
  spinal_load: "low",
  default_rest_seconds: 90,
  category: "strength",
};
catalogue = [...catalogue, syntheticLunge];

const byId = new Map(catalogue.map((e) => [e.id, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "knee-safety-matrix-test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: ["knee"],
    preferredSessionMinutes: 45,
    catalogue,
    ...overrides,
  };
}

console.log("\nKnee Safety Matrix Test");
console.log("=======================\n");
console.log("Knee-safe allowlist (from PR #53):", Array.from(KNEE_SAFE_QUAD_EXERCISES).join(", "));
console.log("Floor-pull deadlifts (PR #73):", Array.from(FLOOR_PULL_DEADLIFTS).join(", "));
console.log();

// Test: Every slug in FLOOR_PULL_DEADLIFTS must exist in the catalogue
console.log("Catalogue validation: Floor-pull deadlift slugs");
for (const slug of FLOOR_PULL_DEADLIFTS) {
  const exists = catalogue.some(e => e.slug === slug);
  check(`  ${slug} exists in catalogue`, exists);
}
console.log();

// Test: Synthetic untagged lunge is rejected by isEligible for knee injury
console.log("Synthetic untagged lunge rejection test");
const kneeInput = base({ currentInjuryRegions: ["knee"] });
const syntheticIsEligible = isEligible(syntheticLunge, kneeInput);
check("Synthetic untagged lunge rejected for knee injury", !syntheticIsEligible,
  syntheticIsEligible ? "ERROR: untagged lunge was eligible!" : "Correctly rejected");
console.log();

// QA-reported issue: Box Squat on days 1 and 5 (gym equipment, current knee injury)
console.log("QA Repro: No Box Squat on days 1 and 5 (gym equipment, current knee injury)");
const testSeeds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
];

for (const seed of testSeeds) {
  const qaInput = base({
    userId: seed,
    goal: "general_fitness",
    level: "intermediate",
    hasAllEquipment: true,
    equipmentIds: [],
    primaryTrack: "weights",
    daysPerWeek: 5,
    preferredSessionMinutes: 60,
    currentInjuryRegions: ["knee"],
  });

  const qaPlan = generateProgram(qaInput);
  const weightDays = qaPlan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
  
  // Check days 1 and 5 specifically
  if (weightDays.length >= 1) {
    const day1 = weightDays[0];
    const hasBoxSquat1 = day1.exercises.some(ex => {
      const e = byId.get(ex.exerciseId);
      return e?.slug === "box-squat";
    });
    check(`  Seed ${seed.substring(0, 8)} ${day1.label}: no box-squat`, !hasBoxSquat1);
  }
  
  if (weightDays.length >= 5) {
    const day5 = weightDays[4];
    const hasBoxSquat5 = day5.exercises.some(ex => {
      const e = byId.get(ex.exerciseId);
      return e?.slug === "box-squat";
    });
    check(`  Seed ${seed.substring(0, 8)} ${day5.label}: no box-squat`, !hasBoxSquat5);
  }
}
console.log();

// Test matrix: level × equipment × session length × frequency × seed × goal
const levels: GeneratorInput["level"][] = ["beginner", "intermediate", "expert"];
const equipmentProfiles: Array<{ name: string; hasAll: boolean; ids: string[] }> = [
  { name: "gym", hasAll: true, ids: [] },
  { name: "home-dumbbell", hasAll: false, ids: ["dumbbell"] },
  { name: "bodyweight", hasAll: false, ids: [] },
];
const sessionLengths = [30, 45, 60, 75];
const frequencies = [2, 3, 4, 5];
const goals: GeneratorInput["goal"][] = ["general_fitness", "muscle_gain"];

let profilesTested = 0;
let profilesPassed = 0;

for (const seed of testSeeds) {
  for (const goal of goals) {
    for (const level of levels) {
      for (const equipment of equipmentProfiles) {
        for (const sessionMinutes of sessionLengths) {
          for (const daysPerWeek of frequencies) {
            profilesTested++;
            
            const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min-${goal}-s${seed.substring(0,8)}`;
            const input = base({
              userId: seed,
              goal,
              level,
              hasAllEquipment: equipment.hasAll,
              equipmentIds: equipment.ids,
              primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
              daysPerWeek,
              preferredSessionMinutes: sessionMinutes,
              currentInjuryRegions: ["knee"],
            });
            
            const plan = generateProgram(input);
            
            let profileFailed = false;
            
            const lowerDays = plan.days.filter(d => 
              d.focus === "lower" || d.focus === "legs" || d.focus === "full_body"
            );
            
            // Fail if profile has no lower/full_body days
            if (lowerDays.length === 0) {
              check(`${profileId}: has at least one lower/full_body day`, false,
                "Profile has no lower/full_body days");
              profileFailed = true;
              // Don't continue - test must fail
            }
            
            // Fail if any lower/full day is empty
            for (const day of lowerDays) {
              if (day.exercises.length === 0) {
                check(`${profileId} ${day.label}: has exercises`, false, "Empty day");
                profileFailed = true;
              }
            }
            
            // Rule 1: First exercise on Lower/Full days is knee-safe quad
            for (const day of lowerDays) {
              if (day.exercises.length === 0) continue;
              
              const firstEx = byId.get(day.exercises[0].exerciseId);
              if (!firstEx) {
                check(`${profileId} ${day.label}: first exercise exists`, false, "exercise not found in catalogue");
                profileFailed = true;
                continue;
              }
              
              const isKneeSafe = KNEE_SAFE_QUAD_EXERCISES.has(firstEx.slug);
              if (!isKneeSafe) {
                check(`${profileId} ${day.label}: first exercise is knee-safe`, false, 
                  `Got ${firstEx.name} [${firstEx.slug}]`);
                profileFailed = true;
              }
            }
            
            // Rule 2: Knee-safe quad comes before any hinge
            for (const day of lowerDays) {
              const firstHingeIndex = day.exercises.findIndex(e => {
                const ex = byId.get(e.exerciseId);
                return ex && ex.movement_pattern === "hinge";
              });
              
              if (firstHingeIndex !== -1) {
                const kneeSafeBeforeHinge = day.exercises.slice(0, firstHingeIndex).some(e => {
                  const ex = byId.get(e.exerciseId);
                  return ex && KNEE_SAFE_QUAD_EXERCISES.has(ex.slug);
                });
                
                if (!kneeSafeBeforeHinge) {
                  check(`${profileId} ${day.label}: knee-safe quad before hinge`, false,
                    `First hinge at position ${firstHingeIndex + 1}, no knee-safe before it`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 3: No adjacent hinges
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (let i = 0; i < day.exercises.length - 1; i++) {
                const current = byId.get(day.exercises[i].exerciseId);
                const next = byId.get(day.exercises[i + 1].exerciseId);
                
                if (current?.movement_pattern === "hinge" && next?.movement_pattern === "hinge") {
                  check(`${profileId} ${day.label}: no adjacent hinges`, false,
                    `${current.name} then ${next.name} at positions ${i + 1}-${i + 2}`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 4: All exercises respect contraindicated_regions
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (const ex of day.exercises) {
                const exercise = byId.get(ex.exerciseId);
                if (!exercise) continue;
                
                // Check explicit contraindications
                if (exercise.contraindicated_regions.includes("knee")) {
                  check(`${profileId} ${day.label}: ${exercise.name} not contraindicated for knee`, false,
                    "Explicitly contraindicated");
                  profileFailed = true;
                }
              }
            }
            
            // Rule 5 (Safety from PR #53): Beginners get no high-impact exercises
            if (level === "beginner") {
              for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
                for (const ex of day.exercises) {
                  const exercise = byId.get(ex.exerciseId);
                  if (!exercise) continue;
                  
                  if (exercise.impact === "high") {
                    check(`${profileId} ${day.label}: beginner has no high-impact`, false,
                      `${exercise.name} has impact=high`);
                    profileFailed = true;
                  }
                }
              }
            }
            
            // Rule 6 (PR #73 follow-up): All squat/lunge pattern exercises must be in KNEE_SAFE_QUAD_EXERCISES
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (const ex of day.exercises) {
                const exercise = byId.get(ex.exerciseId);
                if (!exercise) continue;
                
                if (exercise.movement_pattern === "squat" || exercise.movement_pattern === "lunge") {
                  if (!KNEE_SAFE_QUAD_EXERCISES.has(exercise.slug)) {
                    check(`${profileId} ${day.label}: squat/lunge in allowlist`, false,
                      `${exercise.name} [${exercise.slug}] is ${exercise.movement_pattern} but not in allowlist`);
                    profileFailed = true;
                  }
                }
              }
            }
            
            // Rule 7 (PR #73 follow-up): Floor-pull deadlifts NEVER appear (all slots, not just main)
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (const ex of day.exercises) {
                const exercise = byId.get(ex.exerciseId);
                if (!exercise) continue;
                
                if (FLOOR_PULL_DEADLIFTS.has(exercise.slug)) {
                  check(`${profileId} ${day.label}: no floor-pull deadlift anywhere`, false,
                    `${exercise.name} [${exercise.slug}] at slot ${ex.orderIndex + 1}`);
                  profileFailed = true;
                }
              }
            }
            
            if (!profileFailed) {
              profilesPassed++;
            }
          }
        }
      }
    }
  }
}

check(`All ${profilesTested} knee profiles passed`, profilesPassed === profilesTested,
  `Only ${profilesPassed} of ${profilesTested} passed`);

console.log(`\nMatrix summary: tested ${profilesTested} profiles, ${profilesPassed} passed\n`);

// Additional safety test: Lower_back injury excludes loaded windmill/side-bend (PR #53)
console.log("Lower_back Safety Test (PR #53 restoration)");
console.log("─".repeat(60));

let lowerBackTested = 0;
let lowerBackPassed = 0;

for (const level of levels) {
  for (const equipment of equipmentProfiles) {
    for (const sessionMinutes of sessionLengths) {
      for (const daysPerWeek of frequencies) {
        lowerBackTested++;
        
        const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min-lowerback`;
        const input = base({
          userId: `lower-back-safety-${profileId}`,
          level,
          hasAllEquipment: equipment.hasAll,
          equipmentIds: equipment.ids,
          primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
          daysPerWeek,
          preferredSessionMinutes: sessionMinutes,
          currentInjuryRegions: ["lower_back"],
        });
        
        const plan = generateProgram(input);
        
        let profileFailed = false;
        
        // Check: no loaded windmill or side-bend exercises
        for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
          for (const ex of day.exercises) {
            const exercise = byId.get(ex.exerciseId);
            if (!exercise) continue;
            
            const nameLower = exercise.name.toLowerCase();
            const slugLower = exercise.slug.toLowerCase();
            const isLoadedWindmillOrSideBend = 
              (nameLower.includes("windmill") || slugLower.includes("windmill") ||
               nameLower.includes("side bend") || slugLower.includes("side-bend")) &&
              exercise.equipment_ids.length > 0;
            
            if (isLoadedWindmillOrSideBend) {
              check(`${profileId} ${day.label}: no loaded windmill/side-bend`, false,
                `Got ${exercise.name}`);
              profileFailed = true;
            }
          }
        }
        
        if (!profileFailed) {
          lowerBackPassed++;
        }
      }
    }
  }
}

check(`All ${lowerBackTested} lower_back profiles passed`, lowerBackPassed === lowerBackTested,
  `Only ${lowerBackPassed} of ${lowerBackTested} passed`);

console.log(`\nLower_back summary: tested ${lowerBackTested} profiles, ${lowerBackPassed} passed\n`);

// Knee + Lower_back combined injury test
console.log("Knee + Lower_back Combined Injury Test");
console.log("─".repeat(60));

let combinedTested = 0;
let combinedPassed = 0;

for (const level of levels) {
  for (const equipment of equipmentProfiles) {
    for (const sessionMinutes of [45, 60]) { // Reduced for speed
      for (const daysPerWeek of [3, 4]) { // Reduced for speed
        combinedTested++;
        
        const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min-knee+lowerback`;
        const input = base({
          userId: `combined-injury-${profileId}`,
          level,
          hasAllEquipment: equipment.hasAll,
          equipmentIds: equipment.ids,
          primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
          daysPerWeek,
          preferredSessionMinutes: sessionMinutes,
          currentInjuryRegions: ["knee", "lower_back"],
        });
        
        const plan = generateProgram(input);
        
        let profileFailed = false;
        
        const lowerDays = plan.days.filter(d => 
          d.focus === "lower" || d.focus === "legs" || d.focus === "full_body"
        );
        
        // Check knee rules
        for (const day of lowerDays) {
          if (day.exercises.length === 0) continue;
          
          const firstEx = byId.get(day.exercises[0].exerciseId);
          if (firstEx && !KNEE_SAFE_QUAD_EXERCISES.has(firstEx.slug)) {
            check(`${profileId} ${day.label}: first is knee-safe`, false, `Got ${firstEx.name}`);
            profileFailed = true;
          }
        }
        
        // Check lower_back rules
        for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
          for (const ex of day.exercises) {
            const exercise = byId.get(ex.exerciseId);
            if (!exercise) continue;
            
            const nameLower = exercise.name.toLowerCase();
            const slugLower = exercise.slug.toLowerCase();
            const isLoadedWindmillOrSideBend = 
              (nameLower.includes("windmill") || slugLower.includes("windmill") ||
               nameLower.includes("side bend") || slugLower.includes("side-bend")) &&
              exercise.equipment_ids.length > 0;
            
            if (isLoadedWindmillOrSideBend) {
              check(`${profileId} ${day.label}: no loaded windmill/side-bend`, false);
              profileFailed = true;
            }
          }
        }
        
        if (!profileFailed) {
          combinedPassed++;
        }
      }
    }
  }
}

check(`All ${combinedTested} combined knee+lower_back profiles passed`, combinedPassed === combinedTested,
  `Only ${combinedPassed} of ${combinedTested} passed`);

console.log(`\nCombined injury summary: tested ${combinedTested} profiles, ${combinedPassed} passed\n`);

// Determinism test over the full 864-profile matrix
console.log("Determinism check (full 864-profile matrix)");
console.log("─".repeat(60));

let deterministicTests = 0;
let deterministicFailures = 0;

for (const seed of testSeeds) {
  for (const goal of goals) {
    for (const level of levels) {
      for (const equipment of equipmentProfiles) {
        for (const sessionMinutes of sessionLengths) {
          for (const daysPerWeek of frequencies) {
            deterministicTests++;
            
            const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min-${goal}-s${seed.substring(0,8)}`;
            const input = base({
              userId: seed,
              goal,
              level,
              hasAllEquipment: equipment.hasAll,
              equipmentIds: equipment.ids,
              primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
              daysPerWeek,
              preferredSessionMinutes: sessionMinutes,
              currentInjuryRegions: ["knee"],
            });
            
            const plan1 = generateProgram(input);
            const plan2 = generateProgram(input);
            
            const stringify = (plan: ReturnType<typeof generateProgram>) =>
              JSON.stringify(
                plan.days.map((d) => ({
                  label: d.label,
                  exercises: d.exercises.map((e) => ({
                    id: e.exerciseId,
                    sets: e.targetSets,
                    repsMin: e.targetRepsMin,
                    repsMax: e.targetRepsMax,
                  })),
                }))
              );
            
            const isDeterministic = stringify(plan1) === stringify(plan2);
            if (!isDeterministic) {
              check(`${profileId}: deterministic`, false, "Plans differ on repeated generation");
              deterministicFailures++;
            }
          }
        }
      }
    }
  }
}

check(
  `All ${deterministicTests} profiles are deterministic`,
  deterministicFailures === 0,
  deterministicFailures > 0 ? `${deterministicFailures} profiles failed` : ""
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
