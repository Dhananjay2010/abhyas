import { readFileSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "count-test",
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
    currentInjuryRegions: [],
    preferredSessionMinutes: 45,
    catalogue,
    ...overrides,
  };
}

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

let totalDays = 0;
let days5Ex = 0;
let days6PlusEx = 0;

console.log("Counting exercises per day in knee matrix vs main...\n");

for (const seed of testSeeds) {
  for (const goal of goals) {
    for (const level of levels) {
      for (const equipment of equipmentProfiles) {
        for (const sessionMinutes of sessionLengths) {
          for (const daysPerWeek of frequencies) {
            // Knee injury
            const kneeInput = base({
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
            
            const kneePlan = generateProgram(kneeInput);
            
            for (const day of kneePlan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              const exCount = day.exercises.length;
              totalDays++;
              if (exCount === 5) days5Ex++;
              if (exCount >= 6) days6PlusEx++;
            }
          }
        }
      }
    }
  }
}

console.log(`Total training days: ${totalDays}`);
console.log(`Days with exactly 5 exercises: ${days5Ex} (${(days5Ex / totalDays * 100).toFixed(2)}%)`);
console.log(`Days with 6+ exercises: ${days6PlusEx} (${(days6PlusEx / totalDays * 100).toFixed(2)}%)`);
console.log();

// Now count for no-injury baseline
totalDays = 0;
days5Ex = 0;
days6PlusEx = 0;

console.log("Counting exercises per day in no-injury baseline...\n");

for (const seed of testSeeds) {
  for (const goal of goals) {
    for (const level of levels) {
      for (const equipment of equipmentProfiles) {
        for (const sessionMinutes of sessionLengths) {
          for (const daysPerWeek of frequencies) {
            const noInjuryInput = base({
              userId: seed,
              goal,
              level,
              hasAllEquipment: equipment.hasAll,
              equipmentIds: equipment.ids,
              primaryTrack: equipment.name === "bodyweight" ? "bodyweight" : "weights",
              daysPerWeek,
              preferredSessionMinutes: sessionMinutes,
              currentInjuryRegions: [],
            });
            
            const noInjuryPlan = generateProgram(noInjuryInput);
            
            for (const day of noInjuryPlan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
              const exCount = day.exercises.length;
              totalDays++;
              if (exCount === 5) days5Ex++;
              if (exCount >= 6) days6PlusEx++;
            }
          }
        }
      }
    }
  }
}

console.log(`Total training days: ${totalDays}`);
console.log(`Days with exactly 5 exercises: ${days5Ex} (${(days5Ex / totalDays * 100).toFixed(2)}%)`);
console.log(`Days with 6+ exercises: ${days6PlusEx} (${(days6PlusEx / totalDays * 100).toFixed(2)}%)`);
