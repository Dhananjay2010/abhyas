import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8"),
) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));

function show(label: string, over: Partial<GeneratorInput>) {
  const input: GeneratorInput = {
    userId: "00000000-0000-0000-0000-000000000001",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 6,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 25.5,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
    ...over,
  };
  const plan = generateProgram(input);
  console.log(`\n===== ${label} (${plan.splitType}) =====`);
  for (const d of plan.days) {
    if (d.dayType === "rest") { console.log(`  day ${d.dayIndex}  Rest`); continue; }
    console.log(`  day ${d.dayIndex}  ${d.label}  (${d.exercises.length} exercises)`);
    for (const e of d.exercises) {
      const ex = byId.get(e.exerciseId)!;
      console.log(`      ${e.targetSets}x${e.targetRepsMin}-${e.targetRepsMax}  ${ex.movement_pattern.padEnd(16)} ${ex.mechanic ?? "-"}  ${e.name}`);
    }
  }
}

show("A. gym, all equipment, 6 days, no injuries", { hasAllEquipment: true });
show("B. gym, yoga mat only, 6 days (my onboarding)", {
  hasAllEquipment: false,
  equipmentIds: ["yoga-mat"],
});
