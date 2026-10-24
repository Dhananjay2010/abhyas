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
} from "../src/lib/program/generate";

// Hard-coded expected knee-safe slugs (independent test oracle)
// Adding box-squat to this list must make the test FAIL (not just a separate check)
const EXPECTED_KNEE_SAFE_QUAD_EXERCISES = new Set([
  "leg-extensions",
  "single-leg-leg-extension",
  "wall-sit",
  "spanish-squat",
]);

// Hard-coded expected floor-pull deadlifts (independent test oracle)
const EXPECTED_FLOOR_PULL_DEADLIFTS = new Set([
  "deadlift",
  "sumo-deadlift",
  "trap-bar-deadlift",
  "deficit-deadlift",
  "snatch-grip-deadlift",
  "stiff-leg-deadlift",
  "romanian-deadlift",
  "single-leg-romanian-deadlift",
  "sumo-romanian-deadlift",
  "dumbbell-romanian-deadlift",
  "single-leg-dumbbell-romanian-deadlift",
  "kettlebell-romanian-deadlift",
  "single-leg-kettlebell-romanian-deadlift",
]);

// Hard-coded expected loaded windmill/side-bend exclusions (independent test oracle)
const EXPECTED_LOADED_WINDMILL_SIDE_BEND = new Set([
  "dumbbell-side-bend",
  "cable-side-bend",
  "kettlebell-windmill",
]);

// Load real catalogue
const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

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
console.log("Expected knee-safe allowlist (independent oracle):", Array.from(EXPECTED_KNEE_SAFE_QUAD_EXERCISES).join(", "));
console.log("Expected floor-pull deadlifts (independent oracle):", Array.from(EXPECTED_FLOOR_PULL_DEADLIFTS).join(", "));
console.log("Expected loaded windmill/side-bend (independent oracle):", Array.from(EXPECTED_LOADED_WINDMILL_SIDE_BEND).join(", "));
console.log();

// Test: Every slug in EXPECTED_FLOOR_PULL_DEADLIFTS must exist in the catalogue
console.log("Catalogue validation: Floor-pull deadlift slugs");
for (const slug of EXPECTED_FLOOR_PULL_DEADLIFTS) {
  const exists = catalogue.some(e => e.slug === slug);
  check(`  ${slug} exists in catalogue`, exists);
}
console.log();

// Synthetic untagged lunge test (ONLY for this dedicated test, not used in matrix)
console.log("Synthetic untagged lunge rejection test");
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
  { name: "leg-extension", hasAll: false, ids: ["leg_extension"] },
  { name: "leg-extension+dumbbell", hasAll: false, ids: ["leg_extension", "dumbbell"] },
  { name: "band", hasAll: false, ids: ["band"] },
  { name: "barbell+rack", hasAll: false, ids: ["barbell", "rack"] },
  { name: "kettlebell", hasAll: false, ids: ["kettlebell"] },
  { name: "cable", hasAll: false, ids: ["cable_machine"] },
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
            
            // Rule 1: First LOWER BODY exercise on Lower/Full days is non-timed knee-safe quad when available,
            // otherwise knee-safe hip-dominant compound
            for (const day of lowerDays) {
              if (day.exercises.length === 0) continue;
              
              // Find the first lower body exercise (targeting quads/glutes/hamstrings)
              const firstLowerEx = day.exercises.find(ex => {
                const e = byId.get(ex.exerciseId);
                return e && e.primary_muscles.some(m => ["quads", "glutes", "hamstrings"].includes(m));
              });
              
              if (!firstLowerEx) {
                // No lower body exercises on this day - skip this check
                continue;
              }
              
              const exercise = byId.get(firstLowerEx.exerciseId);
              if (!exercise) {
                check(`${profileId} ${day.label}: first lower exercise exists`, false, "exercise not found in catalogue");
                profileFailed = true;
                continue;
              }
              
              // Check if non-timed knee-safe quads are available for this profile
              const availableKneeSafeQuads = catalogue.filter(e => {
                if (!EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(e.slug)) return false;
                if (e.metric === "seconds") return false;
                if (!e.primary_muscles.includes("quads")) return false;
                if (!e.tracks.includes(input.primaryTrack)) return false;
                
                // Level check
                if (e.level_min === "expert" && level === "beginner") return false;
                if (e.level_min === "intermediate" && level === "beginner") return false;
                
                // Equipment check
                if (!equipment.hasAll && e.equipment_ids.length > 0) {
                  const hasAll = e.equipment_ids.every((eid: string) => equipment.ids.includes(eid));
                  if (!hasAll) return false;
                }
                
                return true;
              });
              
              const isKneeSafeQuad = EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(exercise.slug) && exercise.metric !== "seconds";
              const isKneeSafeHipDominant = (exercise.movement_pattern === "hinge" || 
                                            exercise.slug.includes("bridge") || 
                                            exercise.slug.includes("hip-thrust")) && 
                                           exercise.mechanic === "compound" &&
                                           exercise.metric !== "seconds";
              
              // If knee-safe quads are available, first lower MUST be a knee-safe quad
              if (availableKneeSafeQuads.length > 0) {
                if (!isKneeSafeQuad) {
                  check(`${profileId} ${day.label}: first lower is knee-safe quad when available`, false, 
                    `Got ${exercise.name} [${exercise.slug}] but ${availableKneeSafeQuads.length} knee-safe quad(s) available`);
                  profileFailed = true;
                }
              } else {
                // No knee-safe quads available, must be hip-dominant
                if (!isKneeSafeHipDominant) {
                  check(`${profileId} ${day.label}: first lower is hip-dominant when no quads available`, false, 
                    `Got ${exercise.name} [${exercise.slug}] - expected hip-dominant compound`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 2: If first LOWER BODY exercise is not a hinge/bridge, then knee-safe must come before any hinge
            for (const day of lowerDays) {
              if (day.exercises.length === 0) continue;
              
              const firstLowerEx = day.exercises.find(ex => {
                const e = byId.get(ex.exerciseId);
                return e && e.primary_muscles.some(m => ["quads", "glutes", "hamstrings"].includes(m));
              });
              
              if (!firstLowerEx) continue;
              
              const firstEx = byId.get(firstLowerEx.exerciseId);
              if (!firstEx) continue;
              
              const firstIsHingeBridge = firstEx.movement_pattern === "hinge" || 
                                        firstEx.slug.includes("bridge") || 
                                        firstEx.slug.includes("hip-thrust");
              
              if (!firstIsHingeBridge) {
                // First lower exercise is not a hinge/bridge, so check if any hinges appear later
                const firstHingeIndex = day.exercises.findIndex(e => {
                  const ex = byId.get(e.exerciseId);
                  return ex && ex.movement_pattern === "hinge";
                });
                
                if (firstHingeIndex !== -1) {
                  const kneeSafeBeforeHinge = day.exercises.slice(0, firstHingeIndex).some(e => {
                    const ex = byId.get(e.exerciseId);
                    if (!ex) return false;
                    return EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(ex.slug) && ex.metric !== "seconds";
                  });
                  
                  if (!kneeSafeBeforeHinge) {
                    check(`${profileId} ${day.label}: knee-safe quad before hinge`, false,
                      `First hinge at position ${firstHingeIndex + 1}, no knee-safe quad before it`);
                    profileFailed = true;
                  }
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
            
            // Rule 6 (PR #73 follow-up): All squat/lunge pattern exercises must be in EXPECTED_KNEE_SAFE_QUAD_EXERCISES
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (const ex of day.exercises) {
                const exercise = byId.get(ex.exerciseId);
                if (!exercise) continue;
                
                if (exercise.movement_pattern === "squat" || exercise.movement_pattern === "lunge") {
                  if (!EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(exercise.slug)) {
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
                
                if (EXPECTED_FLOOR_PULL_DEADLIFTS.has(exercise.slug)) {
                  check(`${profileId} ${day.label}: no floor-pull deadlift anywhere`, false,
                    `${exercise.name} [${exercise.slug}] at slot ${ex.orderIndex + 1}`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 8 (PR #73 follow-up): Every main exercise (slots 0-3) has >= sets than every accessory/core (slots 4+)
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              const mains = day.exercises.filter(ex => ex.orderIndex < 4);
              const accessories = day.exercises.filter(ex => ex.orderIndex >= 4);
              
              if (accessories.length > 0 && mains.length > 0) {
                const minMainSets = Math.min(...mains.map(ex => ex.targetSets));
                const maxAccessorySets = Math.max(...accessories.map(ex => ex.targetSets));
                
                if (minMainSets < maxAccessorySets) {
                  const minMainEx = mains.find(ex => ex.targetSets === minMainSets);
                  const maxAccessoryEx = accessories.find(ex => ex.targetSets === maxAccessorySets);
                  const minMainExercise = minMainEx ? byId.get(minMainEx.exerciseId) : undefined;
                  const maxAccessoryExercise = maxAccessoryEx ? byId.get(maxAccessoryEx.exerciseId) : undefined;
                  
                  check(`${profileId} ${day.label}: main sets >= accessory sets`, false,
                    `Main ${minMainExercise?.name || "?"} has ${minMainSets} sets < accessory ${maxAccessoryExercise?.name || "?"} has ${maxAccessorySets} sets`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 9 (PR #73 follow-up): No timed hold (metric=seconds) in main slots (0-3)
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              const mains = day.exercises.filter(ex => ex.orderIndex < 4);
              
              for (const mainEx of mains) {
                const exercise = byId.get(mainEx.exerciseId);
                if (!exercise) continue;
                
                if (exercise.metric === "seconds") {
                  check(`${profileId} ${day.label}: no timed hold in main slot`, false,
                    `${exercise.name} [${exercise.slug}] at slot ${mainEx.orderIndex + 1}`);
                  profileFailed = true;
                }
              }
            }
            
            // Rule 10: No isolation before compound in final order (except core, which goes last)
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              for (let i = 0; i < day.exercises.length; i++) {
                const current = byId.get(day.exercises[i].exerciseId);
                if (!current) continue;
                
                if (current.mechanic === "isolation") {
                  // Check if any non-core compound comes after this isolation
                  for (let j = i + 1; j < day.exercises.length; j++) {
                    const later = byId.get(day.exercises[j].exerciseId);
                    if (later && later.mechanic === "compound" && later.movement_pattern !== "core") {
                      check(`${profileId} ${day.label}: no isolation before compound`, false,
                        `${current.name} (isolation) at ${i + 1} before ${later.name} (compound ${later.movement_pattern}) at ${j + 1}`);
                      profileFailed = true;
                      break;
                    }
                  }
                }
              }
            }
            
            // Rule 11: Core exercises are last
            for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              const lastCoreIndex = day.exercises.map((ex, idx) => {
                const e = byId.get(ex.exerciseId);
                return e?.movement_pattern === "core" ? idx : -1;
              }).reduce((max, idx) => Math.max(max, idx), -1);
              
              if (lastCoreIndex >= 0 && lastCoreIndex < day.exercises.length - 1) {
                // There's a core exercise, but it's not last
                const lastEx = byId.get(day.exercises[day.exercises.length - 1].exerciseId);
                const coreEx = byId.get(day.exercises[lastCoreIndex].exerciseId);
                
                if (lastEx && lastEx.movement_pattern !== "core") {
                  check(`${profileId} ${day.label}: core exercises are last`, false,
                    `${coreEx?.name || "core"} at ${lastCoreIndex + 1}, but ${lastEx.name} (${lastEx.movement_pattern}) is last`);
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
            
            if (EXPECTED_LOADED_WINDMILL_SIDE_BEND.has(exercise.slug)) {
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
          
          const firstLowerEx = day.exercises.find(ex => {
            const e = byId.get(ex.exerciseId);
            return e && e.primary_muscles.some(m => ["quads", "glutes", "hamstrings"].includes(m));
          });
          
          if (!firstLowerEx) continue;
          
          const firstEx = byId.get(firstLowerEx.exerciseId);
          if (firstEx) {
            const isKneeSafeQuad = EXPECTED_KNEE_SAFE_QUAD_EXERCISES.has(firstEx.slug) && firstEx.metric !== "seconds";
            const isKneeSafeHipDominant = (firstEx.movement_pattern === "hinge" || 
                                          firstEx.slug.includes("bridge") || 
                                          firstEx.slug.includes("hip-thrust")) && 
                                         firstEx.mechanic === "compound" &&
                                         firstEx.metric !== "seconds";
            
            if (!isKneeSafeQuad && !isKneeSafeHipDominant) {
              check(`${profileId} ${day.label}: first lower is knee-safe`, false, `Got ${firstEx.name}`);
              profileFailed = true;
            }
          }
        }
        
        // Check lower_back rules
        for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
          for (const ex of day.exercises) {
            const exercise = byId.get(ex.exerciseId);
            if (!exercise) continue;
            
            if (EXPECTED_LOADED_WINDMILL_SIDE_BEND.has(exercise.slug)) {
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
