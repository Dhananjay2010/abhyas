/**
 * Past Knee Acceptance Test (PR #73 scoped policy)
 * 
 * Verifies past knee injury behavior matches scoped policy:
 * 1. Jump/plyometric exclusion on ALL slots (high-impact lower-body)
 * 2. Pistol exclusion (kettlebell-pistol-squat, smith-machine-pistol-squat)
 * 3. Deficit lunge (elevated-back-lunge) & side split squat (barbell-side-split-squat) exclusion
 * 4. Sissy squat exclusion (sissy-squat, weighted-sissy-squat)
 * 5. Lunge/split-squat slots use ONLY the 5-exercise knee-safe list
 * 6. Barbell squat, goblet squat, bodyweight squat are ALLOWED in squat slots
 * 7. Floor deadlifts are ALLOWED (romanian-deadlift, barbell-deadlift, etc.)
 * 
 * Test MUST fail on main (no anyKneeInjury handling).
 * 
 *   npm run test:past-knee-coordinator
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, KNEE_SAFE_LUNGE_EXERCISES } from "../src/lib/program/generate";
import { hasAnyKneeInjury, currentInjuryRegions } from "../src/lib/program/injury-regions";

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
interface InjuryRow {
  region: BodyRegion;
  severity: "current" | "past";
}

// Hard-coded test oracle (independent of generator constants)
const BANNED_FOR_PAST_KNEE = new Set([
  // High-impact lower-body jumps/plyos
  "box-jump", "tuck-jump", "star-jump", "rocket-jump", "scissor-jump", "split-jump",
  "jump-squat", "dumbbell-squat-jump", "barbell-jump-squat",
  "bench-jump", "lateral-bound", "butt-kicks", "fast-skipping",
  // Pistols
  "pistol-squat", "kettlebell-pistol-squat", "smith-machine-pistol-squat",
  // Deficit/side split
  "elevated-back-lunge", "barbell-side-split-squat",
  // Sissy squats
  "sissy-squat", "weighted-sissy-squat",
]);

// Knee-safe lunge list (hard-coded, must match generator)
const EXPECTED_KNEE_SAFE_LUNGES = new Set([
  "step-up-with-knee-raise",
  "barbell-step-ups",
  "dumbbell-step-ups",
  "split-squat-with-dumbbells",
  "smith-single-leg-split-squat",
]);

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("Past Knee Scoped Policy Test");
console.log("─".repeat(60));

// Test 1: Home bodyweight past-knee (no jumps in plan)
console.log("\n1. Home bodyweight past-knee (no banned moves in plan)");
const injuries = [{ region: "knee" as BodyRegion, severity: "past" as const }];
const homeInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "general_fitness" as const,
  level: "intermediate" as const,
  primaryTrack: "bodyweight" as const,
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 35,
  bmi: 24,
  hasAllEquipment: false,
  equipmentIds: ["bodyweight"],
  currentInjuryRegions: currentInjuryRegions(injuries),
  anyKneeInjury: hasAnyKneeInjury(injuries),
  catalogue,
};

const homePlan = generateProgram(homeInput);
const homeExercises = homePlan.days.flatMap(d => d.exercises.map(ex => catalogue.find(e => e.id === ex.exerciseId))).filter(Boolean);

// Check no banned moves
const homeBanned = homeExercises.filter(e => BANNED_FOR_PAST_KNEE.has(e!.slug));
check("No banned exercises", homeBanned.length === 0, homeBanned.length > 0 ? `Found: ${homeBanned.map(e => e!.slug).join(", ")}` : undefined);

// Check lunges are from safe list (if any exist)
const homeLunges = homeExercises.filter(e => e!.movement_pattern === "lunge");
const homeUnsafeLunges = homeLunges.filter(e => !EXPECTED_KNEE_SAFE_LUNGES.has(e!.slug));
check("All lunges are knee-safe", homeUnsafeLunges.length === 0, homeUnsafeLunges.length > 0 ? `Unsafe: ${homeUnsafeLunges.map(e => e!.slug).join(", ")}` : undefined);

// Check bodyweight squat allowed
const homeSquats = homeExercises.filter(e => e!.slug === "bodyweight-squat");
check("Bodyweight squat allowed", homeSquats.length > 0, "Not found in plan");

// Test 2: Gym past-knee (allows barbell squat, floor deadlift)
console.log("\n2. Gym past-knee (allows squat/deadlift, bans pistols/deficits)");
const gymInput = {
  ...homeInput,
  goal: "muscle_gain" as const,
  daysPerWeek: 4,
  primaryTrack: "weights" as const,
  hasAllEquipment: true,
  equipmentIds: [],
};

const gymPlan = generateProgram(gymInput);
const gymExercises = gymPlan.days.flatMap(d => d.exercises.map(ex => catalogue.find(e => e.id === ex.exerciseId))).filter(Boolean);

// Check no banned moves
const gymBanned = gymExercises.filter(e => BANNED_FOR_PAST_KNEE.has(e!.slug));
check("No banned exercises", gymBanned.length === 0, gymBanned.length > 0 ? `Found: ${gymBanned.map(e => e!.slug).join(", ")}` : undefined);

// Check lunges are from safe list
const gymLunges = gymExercises.filter(e => e!.movement_pattern === "lunge");
const gymUnsafeLunges = gymLunges.filter(e => !EXPECTED_KNEE_SAFE_LUNGES.has(e!.slug));
check("All lunges are knee-safe", gymUnsafeLunges.length === 0, gymUnsafeLunges.length > 0 ? `Unsafe: ${gymUnsafeLunges.map(e => e!.slug).join(", ")}` : undefined);

// Check compound lower-body (barbell squat, deadlift should be possible)
const gymSquats = gymExercises.filter(e => e!.slug.includes("squat") && e!.mechanic === "compound");
const gymDeadlifts = gymExercises.filter(e => e!.slug.includes("deadlift"));
check("Compound squats present", gymSquats.length > 0, `Found ${gymSquats.length} compound squats`);
check("Deadlifts present", gymDeadlifts.length > 0, `Found ${gymDeadlifts.length} deadlifts`);

// Test 3: Verify generator constants match test oracle
console.log("\n3. Verify generator constants match test oracle");
const generatorList = Array.from(KNEE_SAFE_LUNGE_EXERCISES);
const oracleList = Array.from(EXPECTED_KNEE_SAFE_LUNGES);
const constantsMatch = generatorList.length === oracleList.length && 
                      generatorList.every(slug => oracleList.includes(slug));
check("KNEE_SAFE_LUNGE_EXERCISES matches oracle", constantsMatch,
  !constantsMatch ? `Generator has ${generatorList.length}, oracle has ${oracleList.length}` : undefined);

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
