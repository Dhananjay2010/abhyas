import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("./scripts/fixtures/catalogue.json", "utf-8")
);

// Failing: current-knee-beginner-gym-2d-75min
const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "general_fitness",
  level: "beginner",
  primaryTrack: "gym",
  daysPerWeek: 2,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 75,
  catalogue,
  seedModifier: 11111111,
};

const plan = generateProgram(input);

for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
  console.log(`\n${day.label}:`);
  day.exercises.forEach((ex, idx) => {
    const e = catalogue.find(c => c.id === ex.exerciseId);
    console.log(`  ${idx}: ${e?.name} [${e?.slug}] impact=${e?.impact}`);
  });
}

// Check exercise details
const catchThrow = catalogue.find((e: any) => e.slug === "catch-and-overhead-throw");
console.log("\nCatch and Overhead Throw:");
console.log("  level_min:", catchThrow?.level_min);
console.log("  impact:", catchThrow?.impact);
console.log("  tracks:", catchThrow?.tracks);
console.log("  movement_pattern:", catchThrow?.movement_pattern);
