import { readFileSync } from "fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("./scripts/fixtures/catalogue.json", "utf-8")
);

// Failing: past-knee-intermediate-barbell+rack-2d-30min-muscle_gain
const input: GeneratorInput = {
  userId: "test-user",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "gym",
  daysPerWeek: 2,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: false,
  equipmentIds: ["barbell", "squat_rack"],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 30,
  catalogue,
  seedModifier: 11111111,
};

console.log("=== past-knee-intermediate-barbell+rack-2d-30min-muscle_gain ===");
const plan = generateProgram(input);

for (const day of plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight")) {
  console.log(`\n${day.label}:`);
  console.log(`  Total: ${day.exercises.length} exercises`);
  
  const lowerBodyMuscles = ["quads", "glutes", "hamstrings"];
  day.exercises.forEach((ex, idx) => {
    const e = catalogue.find(c => c.id === ex.exerciseId);
    const isLower = e?.primary_muscles.some((m: string) => lowerBodyMuscles.includes(m));
    console.log(`    ${idx}: ${isLower ? "[LOWER]" : "[OTHER]"} ${e?.name} [${e?.slug}]`);
  });
}

// Check what PAST_KNEE_LUNGE_EXERCISES are available for barbell+rack
const PAST_KNEE = new Set(["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"]);
const available = catalogue.filter((e: any) => {
  if (!PAST_KNEE.has(e.slug)) return false;
  if (!e.primary_muscles.includes("quads")) return false;
  
  // Equipment check
  if (e.equipment_ids.length === 0) return true;  // Bodyweight OK
  return e.equipment_ids.every((eid: string) => ["barbell", "squat_rack"].includes(eid));
});

console.log("\nAvailable PAST_KNEE_LUNGE_EXERCISES for barbell+rack:");
available.forEach((e: any) => console.log(`  ${e.slug}: ${e.equipment_ids.join(", ") || "bodyweight"}`));
