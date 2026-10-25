import { readFileSync, writeFileSync } from "node:fs";
import { generateProgram, isEligible, score, hashString, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));
const baseline: Record<string, { plans: string[]; swaps: Record<string, string[]> }> = JSON.parse(readFileSync(__dirname + "/fixtures/past-knee-baseline.json", "utf8"));

const input: GeneratorInput = {
  userId: "identity-test",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "pull_up_bar", "cable_machine", "leg_press"],
  currentInjuryRegions: [],
  pastKneeInjury: false,
  catalogue,
};

const plan = generateProgram(input);
const exerciseIds = plan.days.flatMap(d => d.exercises.map(e => e.exerciseId)).sort();

console.log("Generated:", exerciseIds.length, "exercises");
console.log("Baseline:", baseline.none.plans.length, "exercises");
console.log("Match:", JSON.stringify(exerciseIds) === JSON.stringify(baseline.none.plans));

const byId = new Map(catalogue.map(e => [e.id, e]));

if (JSON.stringify(exerciseIds) !== JSON.stringify(baseline.none.plans)) {
  console.log("\nDifferences:");
  const genSet = new Set(exerciseIds);
  const baseSet = new Set(baseline.none.plans);
  
  for (const id of exerciseIds) {
    if (!baseSet.has(id)) {
      const ex = byId.get(id);
      console.log("  In generated but not baseline:", ex?.name, id);
    }
  }
  
  for (const id of baseline.none.plans) {
    if (!genSet.has(id)) {
      const ex = byId.get(id);
      console.log("  In baseline but not generated:", ex?.name, id);
    }
  }
}

// Save generated for comparison
writeFileSync("./scripts/fixtures/generated-none.json", JSON.stringify({ plans: exerciseIds }, null, 2), "utf8");
console.log("\nWritten generated to scripts/fixtures/generated-none.json");
