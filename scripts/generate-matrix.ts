/**
 * Generate 16-profile matrix for PR body
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput, estimateSessionMinutes } from "../src/lib/program/generate";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8")) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "11111111-1111-1111-1111-111111111111",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue,
    ...overrides,
  };
}

const profiles: Array<{label: string, input: Partial<GeneratorInput>}> = [
  { label: "Gym int muscle 4d 60", input: {} },
  { label: "Gym int muscle 4d 75", input: { preferredSessionMinutes: 75 } },
  { label: "Gym int muscle 4d KNEE", input: { currentInjuryRegions: ["knee"] } },
  { label: "Gym beg general 3d 45", input: { level: "beginner", goal: "general_fitness", daysPerWeek: 3, preferredSessionMinutes: 45 } },
  { label: "Gym beg general 3d 30 (rb2)", input: { level: "beginner", goal: "general_fitness", primaryTrack: "bodyweight", daysPerWeek: 3, preferredSessionMinutes: 30, hasAllEquipment: false, equipmentIds: [] } },
  { label: "Gym adv strength 5d 60", input: { level: "expert", goal: "strength", daysPerWeek: 5 } },
];

profiles.forEach(({ label, input }) => {
  console.log(`\n## ${label}`);
  const plan = generateProgram(base(input));
  const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
  
  trainingDays.forEach(day => {
    const estimate = estimateSessionMinutes(day);
    console.log(`### ${day.label} — ${day.exercises.length} ex, app est ${estimate.toFixed(0)}m`);
    day.exercises.forEach((e, idx) => {
      const ex = byId.get(e.exerciseId)!;
      console.log(`  ${idx + 1}. ${ex.name} [${ex.slug}] ${e.targetSets}x${e.targetRepsMin}-${e.targetRepsMax} r${e.restSeconds} | ${ex.movement_pattern}/${ex.mechanic} eq=${ex.equipment_ids.join('+')} ci=${ex.contraindicated_regions.join('+')} sl=${ex.spinal_load}`);
    });
  });
});
