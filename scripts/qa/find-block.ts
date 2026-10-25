import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../../src/lib/program/generate";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8")) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));
console.log("timed in catalogue:", catalogue.filter((e) => e.metric === "seconds").map((e) => e.name).join(", "));

for (let blockNumber = 8; blockNumber <= 8; blockNumber++) {
  const input: GeneratorInput = {
    userId: "1181f079-5f17-4c18-9456-8477bf5ab3ab",
    blockNumber,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 6,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 78 / 1.75 ** 2,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
  };
  const plan = generateProgram(input);
  for (const d of plan.days) {
    if (d.dayType === "rest") continue;
    console.log(`day ${d.dayIndex} ${d.label}`);
    for (const e of d.exercises) {
      const ex = byId.get(e.exerciseId)!;
      console.log(`   ${e.targetSets}x${e.targetRepsMin}-${e.targetRepsMax} ${ex.metric === "seconds" ? "s" : " "} ${ex.name}`);
    }
  }
}
