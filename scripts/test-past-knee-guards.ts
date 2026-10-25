/**
 * Test: MEDIUM-2 guard tests for past-knee exclusion boundaries.
 * 
 * Ensures we DON'T over-exclude exercises for past-knee profiles:
 * - High-impact upper-body exercises remain available
 * - squats-with-bands remains available for past-knee profiles
 * - cable-hip-adduction remains available for non-injured profiles
 * 
 * npm run test:past-knee-guards
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nMEDIUM-2: Guard tests for exclusion boundaries");

// Guard 1: High-impact exercises are NOT blanket-excluded
// We should allow high-impact upper-body moves like burpees or mountain climbers
const highImpactUpperBody = catalogue.find(ex => 
  ex.impact === "high" && 
  ex.primary_muscles.some(m => ["chest", "shoulders", "triceps", "lats", "traps"].includes(m))
);

if (highImpactUpperBody) {
  const shouldNotExclude = !isExcludedForPastKnee(highImpactUpperBody);
  check(
    `High-impact upper-body NOT excluded (${highImpactUpperBody.slug})`,
    shouldNotExclude,
    shouldNotExclude ? "" : `incorrectly excluded`
  );
} else {
  console.log(`  note: no high-impact upper-body exercise found in catalogue (skip guard)`);
}

// Also check that at least one non-high-impact lower-body move is allowed
const nonHighImpactLower = catalogue.find(ex =>
  ex.impact !== "high" &&
  ex.primary_muscles.some(m => ["quads", "glutes", "hamstrings", "calves"].includes(m))
);

if (nonHighImpactLower) {
  const shouldAllow = !isExcludedForPastKnee(nonHighImpactLower);
  check(
    `Non-high-impact lower-body allowed (${nonHighImpactLower.slug})`,
    shouldAllow,
    shouldAllow ? "" : `incorrectly excluded`
  );
}

// Guard 2: squats-with-bands is NOT excluded
const squatsWithBands = catalogue.find(ex => ex.slug === "squats-with-bands");
if (squatsWithBands) {
  const shouldNotExclude = !isExcludedForPastKnee(squatsWithBands);
  check(
    "squats-with-bands NOT excluded",
    shouldNotExclude,
    shouldNotExclude ? "" : "incorrectly excluded"
  );
  
  // Also verify it appears in a past-knee plan
  const input: GeneratorInput = {
    userId: "test-guard-squats-bands",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  let found = false;
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (candidate && candidate.slug === "squats-with-bands") {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  
  // Note: squats-with-bands might not appear in a single 3-day plan,
  // so we just check it's not excluded. The appearance check is informational.
  console.log(`  note: squats-with-bands ${found ? "appears" : "does not appear"} in sample plan (not required)`);
} else {
  console.log(`  note: squats-with-bands not in catalogue (skip guard)`);
}

// Guard 3: cable-hip-adduction is available for non-injured profiles
const cableHipAdduction = catalogue.find(ex => ex.slug === "cable-hip-adduction");
if (cableHipAdduction) {
  const shouldNotExcludeForHealthy = !isExcludedForPastKnee(cableHipAdduction);
  check(
    "cable-hip-adduction NOT globally excluded",
    shouldNotExcludeForHealthy,
    shouldNotExcludeForHealthy ? "" : "incorrectly excluded for all profiles"
  );
  
  // Verify it can appear in a healthy profile plan
  const healthyInput: GeneratorInput = {
    userId: "test-guard-healthy",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    pastKneeInjury: false,
    catalogue,
  };
  
  const healthyProgram = generateProgram(healthyInput);
  let foundInHealthy = false;
  for (const day of healthyProgram.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (candidate && candidate.slug === "cable-hip-adduction") {
        foundInHealthy = true;
        break;
      }
    }
    if (foundInHealthy) break;
  }
  
  console.log(`  note: cable-hip-adduction ${foundInHealthy ? "appears" : "does not appear"} in healthy plan (not required)`);
} else {
  console.log(`  note: cable-hip-adduction not in catalogue (skip guard)`);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
