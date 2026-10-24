/**
 * Generate baseline for the 3 profiles that DO generate excluded exercises on main.
 */

import { writeFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = require("./fixtures/catalogue.json");

const profiles = [
  {
    name: "neck-press",
    level: "advanced" as const,
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "muscle_gain" as const,
    injuries: ["lower_back"] as any[],
    days: 2,
    minutes: 90,
  },
  {
    name: "guillotine",
    level: "advanced" as const,
    equipmentIds: ["barbell", "squat_rack", "flat_bench"],
    hasAllEquipment: false,
    goal: "strength" as const,
    injuries: [],
    days: 3,
    minutes: 90,
  },
  {
    name: "low-pulley",
    level: "intermediate" as const,
    equipmentIds: ["cable_machine"],
    hasAllEquipment: false,
    goal: "muscle_gain" as const,
    injuries: [],
    days: 2,
    minutes: 90,
  },
];

const results: Array<{
  name: string;
  exercises: string[];
}> = [];

for (const profile of profiles) {
  const input: GeneratorInput = {
    userId: `test-${profile.name}`,
    blockNumber: 1,
    level: profile.level,
    equipmentIds: profile.equipmentIds,
    hasAllEquipment: profile.hasAllEquipment,
    goal: profile.goal,
    currentInjuryRegions: profile.injuries,
    age: null,
    bmi: null,
    daysPerWeek: profile.days,
    yogaDaysPerWeek: 0,
    primaryTrack: "weights",
    preferredSessionMinutes: profile.minutes,
    catalogue,
  };
  
  const program = generateProgram(input);
  const exercises = program.days.flatMap(day => 
    day.exercises.map(e => e.exerciseId)
  );
  
  results.push({
    name: profile.name,
    exercises,
  });
}

writeFileSync(
  "scripts/fixtures/excluded-profile-baseline.json",
  JSON.stringify(results, null, 2)
);

const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

console.log("Generated baselines:");
for (const result of results) {
  const slugs = result.exercises.map(id => idToSlug.get(id));
  const excluded = ["neck-press", "barbell-guillotine-bench-press", "low-pulley-row-to-neck"];
  const found = slugs.filter(s => excluded.includes(s!));
  console.log(`  ${result.name}: ${found.length > 0 ? found.join(", ") : "NO EXCLUDED EXERCISES"}`);
}
