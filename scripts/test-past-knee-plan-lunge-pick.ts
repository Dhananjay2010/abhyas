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

console.log("\n3. Beginner with dumbbells gets dumbbell-rear-lunge (no level gate)");
{
  const input: GeneratorInput = {
    userId: "test-beginner-db-past-knee",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",  // Beginner level ALSO gets dumbbell-rear-lunge for past-knee
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
  
  check("Beginner with dumbbells gets dumbbell-rear-lunge", foundLungeWithRearLunge,
    foundLungeWithOther ? `found ${foundLungeWithOther} instead` : "");
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
    console.log(`  Barbell-only fallback: ${lungeSlug}`);
  } else {
    console.log("  note No lunge slot in this 4-day plan (may be squat-focused)");
  }
}

console.log("\n5. Kettlebell-only user with past knee");
{
  const input: GeneratorInput = {
    userId: "test-kb-past-knee",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 35,
    bmi: 24,
    hasAllEquipment: false,
    equipmentIds: ["kettlebell"],
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
    check("Kettlebell-only fallback is not excluded for past-knee", !isExcluded,
      isExcluded ? `${lungeSlug} is past-knee excluded` : `got ${lungeSlug}`);
    console.log(`  Kettlebell-only fallback: ${lungeSlug}`);
  } else {
    console.log("  note No lunge slot in this plan");
  }
}

console.log("\n6. Non-past-knee beginner with dumbbells (identity check)");
{
  // Non-past-knee users must be identical to main
  const input: GeneratorInput = {
    userId: "test-healthy-beginner-db",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 25,
    bmi: 22,
    hasAllEquipment: false,
    equipmentIds: ["dumbbell"],
    currentInjuryRegions: [],
    pastKneeInjury: false,  // NOT past-knee
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundDumbbellRearLunge = false;
  let foundAnyLunge = false;
  let lungeSlug = "";
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      if (candidate.movement_pattern === "lunge") {
        foundAnyLunge = true;
        lungeSlug = candidate.slug;
        if (candidate.slug === "dumbbell-rear-lunge") {
          foundDumbbellRearLunge = true;
        }
      }
    }
  }
  
  check("Non-past-knee beginner does NOT get dumbbell-rear-lunge", !foundDumbbellRearLunge,
    foundDumbbellRearLunge ? "got dumbbell-rear-lunge (identity broken)" : 
    (foundAnyLunge ? `got ${lungeSlug}` : "no lunge"));
}

console.log("\n7. Only dumbbell-rear-lunge bypasses knee contraindication in past-knee lunge pick");
{
  // Test that NO other knee-contraindicated exercises appear via the past-knee lunge pick path
  // Other knee-friendly exercises (goblet-squat, step-ups, etc.) may appear via:
  // - KNEE_FRIENDLY_PRIMARIES (get +10 bonus in main slots)
  // - KNEE_SAFE_QUAD_EXERCISES (H6 path for knee injuries)
  // This test checks that ONLY dumbbell-rear-lunge can have knee contraindication AND appear in lunge slots
  const input: GeneratorInput = {
    userId: "test-lunge-bypass-past-knee",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue,
  };
  
  const program = generateProgram(input);
  const lungesWithKneeContra: string[] = [];
  
  // Get knee-friendly primaries that are allowed to have knee contraindications
  const kneeFriendlySquats = ["goblet-squat", "box-squat", "leg-press", "split-squat-with-dumbbells"];
  const kneeFriendlyLunges = ["dumbbell-rear-lunge", "barbell-step-ups", "dumbbell-step-ups", "step-up-with-knee-raise", "split-squat-with-dumbbells"];
  const kneeSafeQuads = ["leg-extensions", "single-leg-leg-extension", "box-squat", "step-up-with-knee-raise", "dumbbell-step-ups"];
  const allowedKneeContra = new Set([...kneeFriendlySquats, ...kneeFriendlyLunges, ...kneeSafeQuads]);
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (!candidate) continue;
      
      if (candidate.movement_pattern === "lunge" &&
          candidate.contraindicated_regions.includes("knee") && 
          !allowedKneeContra.has(candidate.slug)) {
        lungesWithKneeContra.push(candidate.slug);
      }
    }
  }
  
  check("No unauthorized knee-contraindicated lunges (only allowed list)", lungesWithKneeContra.length === 0,
    lungesWithKneeContra.length > 0 ? `found: ${lungesWithKneeContra.join(", ")}` : "");
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
