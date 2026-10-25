/**
 * Steer 4: Test Item 13 with stripped catalogue (contraindicated_regions removed).
 * Verifies that current-knee lunge ban is enforced in CODE (movement_pattern check),
 * not via catalogue tags.
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput, isEligible } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

// Strip contraindicated_regions from all exercises
const strippedCatalogue: CandidateExercise[] = catalogue.map(e => ({
  ...e,
  contraindicated_regions: [],
}));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar"],
    currentInjuryRegions: [],
    anyKneeInjury: false,
    catalogue: strippedCatalogue,
    ...overrides,
  };
}

console.log("Steer 4: Item 13 with stripped catalogue (tags removed)");
console.log("─".repeat(60));

console.log("\n1. Current-knee plans contain ZERO lunge-pattern exercises (code-enforced)");
{
  const input = base({
    currentInjuryRegions: ["knee"],
    anyKneeInjury: true,
  });
  
  const program = generateProgram(input);
  let lungeCount = 0;
  const lungeSlugs: string[] = [];
  
  for (const day of program.days) {
    for (const ex of day.exercises) {
      const exercise = strippedCatalogue.find(e => e.id === ex.exerciseId);
      if (exercise && exercise.movement_pattern === "lunge") {
        lungeCount++;
        if (lungeSlugs.length < 5) {
          lungeSlugs.push(exercise.slug);
        }
      }
    }
  }
  
  check("0 lunge-pattern exercises in current-knee plans (stripped catalogue)", lungeCount === 0,
    lungeCount > 0 ? `Found ${lungeCount}: ${lungeSlugs.join(", ")}` : "");
}

console.log("\n2. isEligible rejects lunge-pattern for current knee (stripped catalogue)");
{
  const currentKneeInput = base({
    currentInjuryRegions: ["knee"],
    anyKneeInjury: true,
  });
  
  const lungeSlugs = [
    "dumbbell-rear-lunge",
    "split-squat-with-dumbbells",
    "step-up-with-knee-raise",
    "barbell-lunge",
  ];
  
  for (const slug of lungeSlugs) {
    const ex = strippedCatalogue.find(e => e.slug === slug);
    if (ex) {
      const eligible = isEligible(ex, currentKneeInput);
      check(`${slug} rejected for current knee (stripped tags)`, !eligible);
    } else {
      check(`${slug} exists in catalogue`, false);
    }
  }
}

console.log("\n3. Grid test: 0 lunge-pattern exercises across all current-knee profiles");
{
  const levels: ("beginner" | "intermediate" | "expert")[] = ["beginner", "intermediate", "expert"];
  const dayCounts = [3, 4, 5];
  const equipmentSets = [
    ["barbell", "dumbbell", "flat_bench", "squat_rack"],
    ["dumbbell"],
    [],
  ];
  
  let gridChecked = 0;
  let lungesFound = 0;
  
  for (const level of levels) {
    for (const equipIds of equipmentSets) {
      for (const days of dayCounts) {
        const input = base({
          level,
          daysPerWeek: days,
          equipmentIds: equipIds,
          currentInjuryRegions: ["knee"],
          anyKneeInjury: true,
        });
        
        const program = generateProgram(input);
        gridChecked++;
        
        for (const day of program.days) {
          for (const ex of day.exercises) {
            const exercise = strippedCatalogue.find(e => e.id === ex.exerciseId);
            if (exercise && exercise.movement_pattern === "lunge") {
              lungesFound++;
            }
          }
        }
      }
    }
  }
  
  check(`0 lunges in current-knee grid (stripped catalogue)`, lungesFound === 0,
    `${gridChecked} programs checked, ${lungesFound} lunges found`);
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
