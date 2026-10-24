import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));
const bySlug = new Map(catalogue.map(e => [e.slug, e]));

function base(partial: Partial<GeneratorInput>): GeneratorInput {
  return {
    userId: partial.userId || "test",
    birthDate: "1990-01-01",
    age: 34,
    goal: partial.goal || "general_fitness",
    level: partial.level || "intermediate",
    daysPerWeek: partial.daysPerWeek || 3,
    primaryTrack: "weights",
    yogaDaysPerWeek: 0,
    currentInjuryRegions: partial.currentInjuryRegions || [],
    pastInjuryRegions: [],
    bmi: null,
    hasAllEquipment: partial.hasAllEquipment !== undefined ? partial.hasAllEquipment : true,
    equipmentIds: partial.equipmentIds || [],
    preferredSessionMinutes: partial.preferredSessionMinutes || 60,
    blockNumber: 1,
    catalogue,
  };
}

// beginner-home-dumbbell-3d-75min-general_fitness-s11111111
const input = base({
  userId: "11111111-1111-1111-1111-111111111111",
  goal: "general_fitness",
  level: "beginner",
  currentInjuryRegions: ["knee"],
  hasAllEquipment: false,
  equipmentIds: ["dumbbell"],
  preferredSessionMinutes: 75,
  daysPerWeek: 3,
});

const plan = generateProgram(input);

for (const day of plan.days) {
  if (day.dayType === "weights" || day.dayType === "bodyweight") {
    console.log(`\n${day.label} (${day.focus}):`);
    for (let i = 0; i < day.exercises.length; i++) {
      const ex = day.exercises[i];
      const e = bySlug.get(ex.name.toLowerCase().replace(/ /g, "-").replace(/'/g, ""));
      const catalog = catalogue.find(c => c.id === ex.exerciseId);
      console.log(`  [${i}] orderIndex=${ex.orderIndex}: ${ex.name} — ${catalog?.mechanic} ${catalog?.movement_pattern}`);
    }
  }
}
