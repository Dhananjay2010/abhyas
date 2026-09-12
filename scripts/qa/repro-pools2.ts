import { readFileSync } from "node:fs";
import { isEligible, type CandidateExercise, type GeneratorInput } from "../../src/lib/program/generate";
const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json","utf8")) as CandidateExercise[];
function input(over: Partial<GeneratorInput>): GeneratorInput {
  return { userId:"00000000-0000-0000-0000-000000000001", blockNumber:1, goal:"muscle_gain",
    level:"beginner", primaryTrack:"weights", daysPerWeek:6, yogaDaysPerWeek:0, age:30, bmi:25.5,
    hasAllEquipment:true, equipmentIds:[], currentInjuryRegions:[], catalogue, ...over };
}
function pools(label: string, over: Partial<GeneratorInput>) {
  const i = input(over);
  const pool = catalogue.filter((e)=>isEligible(e,i));
  const by: Record<string,number> = {};
  pool.forEach((e)=>{ by[e.movement_pattern]=(by[e.movement_pattern]??0)+1; });
  const missing = ["vertical_pull","horizontal_pull","squat","hinge","lunge","calf","biceps","rear_delt","lateral_delt","triceps"].filter(p=>!by[p]);
  console.log(`${label}\n   ${pool.length} eligible` + (missing.length?`   MISSING: ${missing.join(", ")}`:"   (every pattern covered)"));
}
pools("home bodyweight, mat + pull-up bar, beginner", { primaryTrack:"bodyweight", hasAllEquipment:false, equipmentIds:["pull_up_bar"] });
pools("home bodyweight, nothing at all, beginner", { primaryTrack:"bodyweight", hasAllEquipment:false, equipmentIds:[] });
pools("home bodyweight, has-all-equipment shortcut", { primaryTrack:"bodyweight", hasAllEquipment:true });
pools("gym, dumbbells + flat bench only, beginner", { hasAllEquipment:false, equipmentIds:["dumbbell","flat_bench"] });
pools("gym, all equipment, beginner", { hasAllEquipment:true });
pools("gym, all equipment, beginner, knee current", { hasAllEquipment:true, currentInjuryRegions:["knee"] as never });
pools("gym, all equipment, beginner, shoulder current", { hasAllEquipment:true, currentInjuryRegions:["shoulder"] as never });
pools("gym, all equipment, beginner, BMI 32", { hasAllEquipment:true, bmi:32 });
pools("gym, all equipment, beginner, age 55", { hasAllEquipment:true, age:55 });
