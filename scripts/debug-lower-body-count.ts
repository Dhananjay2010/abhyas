import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("./scripts/fixtures/catalogue.json", "utf-8")
);

// Failing profile: current-knee-beginner-gym-2d-30min
const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
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
  preferredSessionMinutes: 30,
  catalogue,
  seedModifier: 11111111,
};

console.log("=== Testing current-knee-beginner-gym-2d-30min ===");
console.log("Equipment: full gym, Session: 30min");
console.log("Current injury: knee, Level: beginner");

const plan = generateProgram(input);

for (const day of plan.days.filter(d => d.focus === "full_body" || d.focus === "lower" || d.focus === "legs")) {
  console.log(`\n${day.label} (${day.focus}):`);
  console.log(`  Total exercises: ${day.exercises.length}`);
  
  const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
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
    console.log(`    ${idx}: ${tag} ${x.e?.name} [${x.e?.slug}] - ${x.e?.movement_pattern}`);
  });
  
  // Check what knee-safe lower-body exercises are available
  const kneeSafe = catalogue.filter(e => {
    if (!e.primary_muscles.some((m: string) => lowerBodyMuscles.includes(m))) return false;
    if (e.movement_pattern === "core") return false;
    if (e.contraindicated_regions.includes("knee")) return false;
    
    // Equipment check
    if (!input.hasAllEquipment && e.equipment_ids.length > 0) {
      if (!e.equipment_ids.every(eid => input.equipmentIds.includes(eid))) return false;
    }
    
    // Level check
    const levels = ["beginner", "intermediate", "expert"];
    const userLevel = levels.indexOf(input.level);
    const minLevel = levels.indexOf(e.level_min);
    if (userLevel < minLevel) return false;
    
    // Track check
    if (!e.tracks.includes(input.primaryTrack) && !e.tracks.includes("all")) return false;
    
    return true;
  });
  
  console.log(`\n  Available knee-safe lower-body exercises for this equipment: ${kneeSafe.length}`);
  console.log(`  Sample: ${kneeSafe.slice(0, 5).map(e => e.slug).join(", ")}`);
}
