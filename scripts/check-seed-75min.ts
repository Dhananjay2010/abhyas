import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

const seed = "11111111-1111-1111-1111-111111111111";

const input = {
  userId: seed,
  blockNumber: 1,
  goal: "general_fitness" as const,
  level: "beginner" as const,
  primaryTrack: "weights" as const,
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  equipment: [],
  hasAllEquipment: false,
  currentInjuryRegions: ["knee" as const],
  preferredSessionMinutes: 75,
  catalogue,
};

const plan = generateProgram(input);

console.log("Profile: current-knee-beginner-bodyweight-4d-75min-general_fitness-s11111111");
console.log("─".repeat(80));
console.log();

for (const day of plan.days) {
  if (day.dayType === "weights" && day.focus === "lower") {
    const coreExercises = day.exercises.filter(ex => {
      const e = catalogue.find(c => c.id === ex.exerciseId);
      return e?.movement_pattern === "core";
    });
    
    const wallSitIdx = day.exercises.findIndex(ex => {
      const e = catalogue.find(c => c.id === ex.exerciseId);
      return e?.slug === "wall-sit";
    });
    
    console.log(`${day.label}:`);
    console.log(`  Total exercises: ${day.exercises.length}`);
    console.log(`  Core exercises: ${coreExercises.length}`);
    console.log(`  Wall-sit position: ${wallSitIdx >= 0 ? wallSitIdx + 1 : 'NOT FOUND'}`);
    console.log();
    
    day.exercises.forEach((ex, idx) => {
      const e = catalogue.find(c => c.id === ex.exerciseId);
      const marker = e?.slug === "wall-sit" ? " ← WALL-SIT" : e?.movement_pattern === "core" ? " (CORE)" : "";
      console.log(`    ${idx + 1}. ${e?.name} [${e?.movement_pattern}]${marker}`);
    });
    console.log();
  }
}
