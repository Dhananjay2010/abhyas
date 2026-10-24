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
 * 3. Hip-flexion-with-band is never a main (first 4 slots)
 * 4. No two hinges are adjacent
 * 5. Respects contraindicated_regions (no non-safe squat/lunge/jump)
 * 6. Deterministic (same input → same output)
 */
import { readFileSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
  KNEE_SAFE_QUAD_EXERCISES,
  FLOOR_PULL_DEADLIFTS,
} from "../src/lib/program/generate";

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
console.log("Knee-safe allowlist (from PR #53):", Array.from(KNEE_SAFE_QUAD_EXERCISES).join(", "));
console.log("Floor-pull deadlifts (PR #73):", Array.from(FLOOR_PULL_DEADLIFTS).join(", "));
console.log();

// QA-reported issue: Box Squat leaked through on days 1 and 5
console.log("QA Repro: Box Squat on days 1 and 5 (gym equipment, current knee injury)");
const qaInput = base({
  userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
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
let qaFailed = false;

for (const day of qaPlan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
  for (const ex of day.exercises) {
    const exercise = byId.get(ex.exerciseId);
    if (!exercise) continue;
    
    // Check for Box Squat (or any untagged squat/lunge)
    if ((exercise.movement_pattern === "squat" || exercise.movement_pattern === "lunge") &&
        !KNEE_SAFE_QUAD_EXERCISES.has(exercise.slug)) {
      console.log(`  ❌ FAIL: ${day.label} has ${exercise.name} [${exercise.slug}] (untagged ${exercise.movement_pattern})`);
      qaFailed = true;
    }
    
    // Check for floor-pull deadlifts in main slots
    if (ex.orderIndex < 4 && FLOOR_PULL_DEADLIFTS.has(exercise.slug)) {
      console.log(`  ❌ FAIL: ${day.label} slot ${ex.orderIndex + 1} has ${exercise.name} [${exercise.slug}] (floor-pull deadlift)`);
      qaFailed = true;
    }
  }
}

if (!qaFailed) {
  console.log("  ✅ PASS: No untagged squat/lunge or floor-pull deadlifts in main slots");
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
const testSeeds = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
];
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
          continue;
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
        
        // Rule 3: Hip-flexion-with-band never in main slots
        for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
          const mainExercises = day.exercises.slice(0, 4);
          const hasHipFlexionMain = mainExercises.some(e => {
            const ex = byId.get(e.exerciseId);
            return ex && ex.slug === "hip-flexion-with-band";
          });
          
          if (hasHipFlexionMain) {
            check(`${profileId} ${day.label}: hip-flexion-with-band not in main slots`, false);
            profileFailed = true;
          }
        }
        
        // Rule 4: No adjacent hinges
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
        
        // Rule 5: All exercises respect contraindicated_regions
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
            
            // Check derived contraindications (squat/lunge/jump not in allowlist)
            const isDerivedContraindicated = 
              (exercise.movement_pattern === "squat" || 
               exercise.movement_pattern === "lunge" ||
               exercise.name.toLowerCase().includes("squat") ||
               exercise.name.toLowerCase().includes("lunge") ||
               exercise.name.toLowerCase().includes("jump") ||
               exercise.slug.includes("squat") ||
               exercise.slug.includes("lunge") ||
               exercise.slug.includes("jump")) &&
              !KNEE_SAFE_QUAD_EXERCISES.has(exercise.slug);
            
            if (isDerivedContraindicated) {
              check(`${profileId} ${day.label}: ${exercise.name} respects derived knee contraindication`, false,
                "Squat/lunge/jump not in knee-safe allowlist");
              profileFailed = true;
            }
          }
        }
        
        // Rule 6 (Safety from PR #53): Beginners get no high-impact exercises
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
        
        // Rule 7 (PR #73 follow-up): All squat/lunge pattern exercises must be in KNEE_SAFE_QUAD_EXERCISES
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
        
        // Rule 8 (PR #73 follow-up): Floor-pull deadlifts never in main slots (first 4)
        for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
          const mainExercises = day.exercises.slice(0, 4);
          for (const ex of mainExercises) {
            const exercise = byId.get(ex.exerciseId);
            if (!exercise) continue;
            
            if (FLOOR_PULL_DEADLIFTS.has(exercise.slug)) {
              check(`${profileId} ${day.label}: no floor-pull deadlift in main slots`, false,
                `${exercise.name} [${exercise.slug}] in main slots`);
              profileFailed = true;
            }
          }
        }
        
        // Rule 7 (Safety from PR #53): Lower_back injury excludes loaded windmill/side-bend
        // Note: This profile matrix tests knee injury, but we'll add a separate lower_back test below
        
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

console.log(`\nLower_back summary: tested ${lowerBackTested} profiles, ${lowerBackPassed} passed\n`);

// Determinism test over the whole matrix
console.log("Determinism check");
console.log("─".repeat(60));

let deterministicTests = 0;
let deterministicFailures = 0;

// Test determinism over the whole matrix
for (const level of levels) {
  for (const equipment of equipmentProfiles) {
    for (const sessionMinutes of [30, 45, 60]) { // Reduced set for speed
      for (const daysPerWeek of [3, 5]) { // Reduced set for speed
        deterministicTests++;
        
        const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min`;
        const input = base({
          userId: `determinism-${profileId}`,
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

check(
  `All ${deterministicTests} profiles are deterministic`,
  deterministicFailures === 0,
  deterministicFailures > 0 ? `${deterministicFailures} profiles failed` : ""
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
