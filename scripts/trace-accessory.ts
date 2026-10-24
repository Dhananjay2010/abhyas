import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));

function base(partial: Partial<GeneratorInput>): GeneratorInput {
  return {
    userId: partial.userId || "test",
    birthDate: "1990-01-01",
    age: 34,
    goal: partial.goal || "general_fitness",
    level: partial.level || "intermediate",
    daysPerWeek: partial.daysPerWeek || 3,
    primaryTrack: "weights",
    currentInjuryRegions: partial.currentInjuryRegions || [],
    pastInjuryRegions: [],
    startDate: "2024-01-01",
    hasAllEquipment: partial.hasAllEquipment !== undefined ? partial.hasAllEquipment : true,
    equipmentIds: partial.equipmentIds || [],
    preferredSessionMinutes: partial.preferredSessionMinutes || 60,
    blockNumber: 1,
    catalogue,
  };
}

// beginner-home-dumbbell-2d-75min-general_fitness-s11111111 Full Body A
const input = base({
  userId: "11111111-1111-1111-1111-111111111111",
  goal: "general_fitness",
  level: "beginner",
  currentInjuryRegions: ["knee"],
  hasAllEquipment: false,
  equipmentIds: ["dumbbells"],
  preferredSessionMinutes: 75,
  daysPerWeek: 2,
});

const plan = generateProgram(input);
console.log("\nAll days:");
for (const day of plan.days) {
  if (day.dayType === "weights" || day.dayType === "bodyweight") {
    console.log(`\n${day.label} (${day.focus}):`);
    for (const ex of day.exercises) {
      const e = catalogue.find(ce => ce.id === ex.exerciseId);
      console.log(`  ${ex.orderIndex}: ${e?.name} [${e?.slug}] ${e?.mechanic} ${e?.movement_pattern}`);
    }
  }
}
