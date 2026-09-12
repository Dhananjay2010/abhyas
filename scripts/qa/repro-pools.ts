import { readFileSync } from "node:fs";
import { isEligible, type CandidateExercise, type GeneratorInput } from "../../src/lib/program/generate";

const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8")) as CandidateExercise[];

function input(over: Partial<GeneratorInput>): GeneratorInput {
  return {
    userId: "00000000-0000-0000-0000-000000000001", blockNumber: 1,
    goal: "muscle_gain", level: "beginner", primaryTrack: "weights",
    daysPerWeek: 6, yogaDaysPerWeek: 0, age: 30, bmi: 25.5,
    hasAllEquipment: true, equipmentIds: [], currentInjuryRegions: [],
    catalogue, ...over,
  };
}

function pools(label: string, over: Partial<GeneratorInput>) {
  const i = input(over);
  const pool = catalogue.filter((e) => isEligible(e, i));
  const by: Record<string, number> = {};
  pool.forEach((e) => { by[e.movement_pattern] = (by[e.movement_pattern] ?? 0) + 1; });
  console.log(`\n${label}: ${pool.length} eligible of ${catalogue.length}`);
  console.log("  " + Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join("  "));
  for (const p of ["vertical_pull","horizontal_pull","squat","hinge","lunge","calf","biceps","rear_delt"]) {
    if (!by[p]) console.log(`  !! NOTHING for ${p}`);
  }
}

pools("gym, all equipment, beginner", { hasAllEquipment: true });
pools("gym, yoga mat only, beginner", { hasAllEquipment: false, equipmentIds: ["yoga-mat"] });
pools("gym, all equipment, beginner, knee injury", { hasAllEquipment: true, currentInjuryRegions: ["knee"] as never });
pools("gym, all equipment, intermediate", { hasAllEquipment: true, level: "intermediate" });

// isometric / time-based exercises that will be prescribed in reps
const holdish = catalogue.filter((e) =>
  /\b(plank|hold|isometric|wall sit|dead hang|hang|bridge|superman|hollow|l-sit|static)\b/i.test(e.name));
console.log(`\nTime-based / isometric-looking exercises in catalogue: ${holdish.length}`);
console.log(holdish.slice(0, 25).map((e) => `  ${e.name}`).join("\n"));

pools("HOME bodyweight, no equipment at all, beginner", {
  primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [],
});
pools("HOME bodyweight, mat + pull-up bar, beginner", {
  primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: ["yoga-mat","pull-up-bar","bodyweight"],
});
