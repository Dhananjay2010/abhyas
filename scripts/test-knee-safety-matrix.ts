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
} from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
) as CandidateExercise[];

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
console.log();

// Test matrix: level × equipment × session length × frequency
const levels = ["beginner", "intermediate", "expert"] as const;
const equipmentProfiles: Array<{ name: string; hasAll: boolean; ids: string[] }> = [
  { name: "gym", hasAll: true, ids: [] },
  { name: "home-dumbbell", hasAll: false, ids: ["dumbbell"] },
  { name: "bodyweight", hasAll: false, ids: [] },
];
const sessionLengths = [30, 45, 60, 75];
const frequencies = [2, 3, 4, 5];

let profilesTested = 0;
let profilesPassed = 0;

for (const level of levels) {
  for (const equipment of equipmentProfiles) {
    for (const sessionMinutes of sessionLengths) {
      for (const daysPerWeek of frequencies) {
        profilesTested++;
        
        const profileId = `${level}-${equipment.name}-${daysPerWeek}d-${sessionMinutes}min`;
        const input = base({
          userId: `knee-safety-${profileId}`,
          level,
          hasAllEquipment: equipment.hasAll,
          equipmentIds: equipment.ids,
          primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
          daysPerWeek,
          preferredSessionMinutes: sessionMinutes,
        });
        
        const plan = generateProgram(input);
        
        let profileFailed = false;
        
        const lowerDays = plan.days.filter(d => 
          d.focus === "lower" || d.focus === "legs" || d.focus === "full"
        );
        
        // Skip profiles with no lower days
        if (lowerDays.length === 0) {
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
          if (day.exercises.length < 4) continue;
          
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
        
        if (!profileFailed) {
          profilesPassed++;
        }
      }
    }
  }
}

console.log(`\nMatrix summary: tested ${profilesTested} profiles, ${profilesPassed} passed\n`);

// Rule 6: Determinism test
console.log("Determinism check");
console.log("─".repeat(60));

const deterministicInput = base({
  userId: "knee-safety-determinism",
  level: "beginner",
  daysPerWeek: 3,
  preferredSessionMinutes: 45,
  hasAllEquipment: true,
});

const plan1 = generateProgram(deterministicInput);
const plan2 = generateProgram(deterministicInput);

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
check(
  "Same input produces same output (deterministic)",
  isDeterministic,
  isDeterministic ? "" : "Plans differ on repeated generation"
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
