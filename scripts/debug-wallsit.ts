import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("./scripts/fixtures/catalogue.json", "utf-8")
);

const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "general_fitness",
  level: "beginner",
  primaryTrack: "gym",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: false,
  equipmentIds: ["dumbbell", "mat"],
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  preferredSessionMinutes: 30,
  catalogue,
  seedModifier: 11111111,
};

const plan = generateProgram(input);
const lowerDay = plan.days.find(d => d.focus === "lower");

if (lowerDay) {
  console.log(`Lower day has ${lowerDay.exercises.length} exercises:`);
  lowerDay.exercises.forEach((ex, idx) => {
    const exercise = catalogue.find(e => e.id === ex.exerciseId);
    console.log(`  ${idx}: ${exercise?.name} [${exercise?.slug}] - pattern: ${exercise?.movement_pattern}, metric: ${exercise?.metric}`);
  });
}
