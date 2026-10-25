/**
 * Test: Past-knee users must get dumbbell rear lunge in plan lunge slots.
 * 
 * For past-knee users with dumbbells, the generated plan's lunge slot must pick
 * dumbbell-rear-lunge, the same exercise that leads lunge swaps. For no-dumbbell
 * users, fallback must be past-knee-safe (not excluded).
 * 
 * npm run test:past-knee-plan-lunge-pick
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { isExcludedForPastKnee } from "../src/lib/program/past-knee";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Gym user - 4-day Upper/Lower split with past knee");
{
  const input: GeneratorInput = {
    userId: "test-gym-past-knee-ul",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,  // 4-day gives Upper/Lower/Upper/Lower
    yogaDaysPerWeek: 0,
    age: 35,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundLungeWithRearLunge = false;
  let foundLungeWithOther = "";
  const allLunges: string[] = [];
  const allExercises: Array<{day: number, ex: string, pattern: string}> = [];
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      allExercises.push({day: day.dayIndex, ex: candidate.slug, pattern: candidate.movement_pattern});
      
      if (candidate.movement_pattern === "lunge") {
        allLunges.push(`Day${day.dayIndex}:${candidate.slug}`);
        if (candidate.slug === "dumbbell-rear-lunge") {
          foundLungeWithRearLunge = true;
        } else {
          foundLungeWithOther = candidate.slug;
        }
      }
    }
  }
  
  if (allLunges.length === 0) {
    console.log("  DEBUG: No lunge exercises found in plan");
    console.log("  DEBUG: All exercises:", allExercises.slice(0, 10).map(e => `${e.ex}[${e.pattern}]`).join(", "));
  } else {
    console.log(`  DEBUG: Found lunges: ${allLunges.join(", ")}`);
  }
  
  check("Plan contains dumbbell-rear-lunge for lunge slot", foundLungeWithRearLunge,
    foundLungeWithOther ? `found ${foundLungeWithOther} instead` : "");
}

console.log("\n2. DB-only user (dumbbell only) with past knee");
{
  const input: GeneratorInput = {
    userId: "test-db-past-knee",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",  // Changed to intermediate (dumbbell-rear-lunge is intermediate level)
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: false,
    equipmentIds: ["dumbbell", "flat_bench"],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundLungeWithRearLunge = false;
  let foundLungeWithOther = "";
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      if (candidate.movement_pattern === "lunge") {
        if (candidate.slug === "dumbbell-rear-lunge") {
          foundLungeWithRearLunge = true;
        } else {
          foundLungeWithOther = candidate.slug;
        }
      }
    }
  }
  
  check("DB-only plan contains dumbbell-rear-lunge", foundLungeWithRearLunge,
    foundLungeWithOther ? `found ${foundLungeWithOther} instead` : "");
}

console.log("\n3. Beginner with dumbbells gets past-knee-safe fallback (split-squat-with-dumbbells)");
{
  const input: GeneratorInput = {
    userId: "test-beginner-db-past-knee",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",  // Beginner level excludes intermediate dumbbell-rear-lunge
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: false,
    equipmentIds: ["dumbbell"],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundLunge = false;
  let lungeSlug = "";
  let isExcluded = false;
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      if (candidate.movement_pattern === "lunge") {
        foundLunge = true;
        lungeSlug = candidate.slug;
        isExcluded = isExcludedForPastKnee(candidate);
        break;
      }
    }
    if (foundLunge) break;
  }
  
  if (foundLunge) {
    check("Beginner fallback is not excluded for past-knee", !isExcluded,
      isExcluded ? `${lungeSlug} is past-knee excluded` : `got ${lungeSlug}`);
  } else {
    console.log("  note No lunge slot in this plan");
  }
}

console.log("\n4. No-dumbbell user (barbell + squat_rack) with past knee");
{
  const input: GeneratorInput = {
    userId: "test-no-db-past-knee",
    blockNumber: 1,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 40,
    bmi: 26,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundLunge = false;
  let lungeSlug = "";
  let isExcluded = false;
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      if (candidate.movement_pattern === "lunge") {
        foundLunge = true;
        lungeSlug = candidate.slug;
        isExcluded = isExcludedForPastKnee(candidate);
        break;
      }
    }
    if (foundLunge) break;
  }
  
  if (foundLunge) {
    check("No-dumbbell fallback is not excluded for past-knee", !isExcluded,
      isExcluded ? `${lungeSlug} is past-knee excluded` : `got ${lungeSlug}`);
  } else {
    console.log("  note No lunge slot in this 4-day plan (may be squat-focused)");
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
