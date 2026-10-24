import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("./scripts/fixtures/catalogue.json", "utf-8")
);

// Failing profile: past-knee-intermediate-gym-2d-30min
const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "general_fitness",
  level: "intermediate", goal: "muscle_gain", equipmentIds: ["barbell", "squat_rack"],
  primaryTrack: "gym",
  daysPerWeek: 2,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: false,
  equipmentIds: [],
  currentInjuryRegions: [],  // PAST knee: not in currentInjuryRegions
  anyKneeInjury: true,         // But anyKneeInjury is true
  preferredSessionMinutes: 30,
  catalogue,
  seedModifier: 11111111,
};

console.log("=== Testing past-knee-intermediate-gym-2d-30min ===");
console.log("anyKneeInjury:", input.anyKneeInjury);
console.log("currentInjuryRegions:", input.currentInjuryRegions);

const plan = generateProgram(input);

for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
  console.log(`\n${day.label} (${day.focus}):`);
  console.log(`  Total exercises: ${day.exercises.length}`);
  
  const lowerBodyMuscles = ["quads", "glutes", "hamstrings"];
  const exercises = day.exercises.map(ex => {
    const e = catalogue.find(c => c.id === ex.exerciseId);
    const isCore = e?.movement_pattern === "core";
    const isLowerBody = e?.primary_muscles.some((m: string) => lowerBodyMuscles.includes(m));
    return { e, isCore, isLowerBody };
  });
  
  const nonCoreLower = exercises.filter(x => !x.isCore && x.isLowerBody);
  
  console.log(`  Non-core lower-body count: ${nonCoreLower.length}`);
  console.log(`  Exercises:`);
  exercises.forEach((x, idx) => {
    const tag = x.isCore ? "[CORE]" : x.isLowerBody ? "[LOWER]" : "[UPPER]";
    console.log(`    ${idx}: ${tag} ${x.e?.name} [${x.e?.slug}]`);
  });
}
