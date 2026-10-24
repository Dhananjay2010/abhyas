/**
 * Generate widened baseline plans from origin/main for no-injury comparison test.
 * 
 * Wider parameters: all levels, tracks, real equipment sets, 2-6 days, 
 * 30/45/60/75 min, age 30 and 55.
 */

import { writeFileSync, readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));

const EQUIPMENT_PROFILES: Record<string, { ids: string[]; hasAll: boolean; track: "weights" | "bodyweight" }> = {
  "full-gym": { ids: [], hasAll: true, track: "weights" },
  "barbell-bench-rack": { ids: ["barbell", "squat_rack", "flat_bench"], hasAll: false, track: "weights" },
  "dumbbells-bench": { ids: ["dumbbell", "flat_bench"], hasAll: false, track: "weights" },
  "cable-machine": { ids: ["cable_machine"], hasAll: false, track: "weights" },
  "bodyweight": { ids: [], hasAll: false, track: "bodyweight" },
  "dumbbells-only": { ids: ["dumbbell"], hasAll: false, track: "weights" },
};

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const DAYS = [2, 3, 4, 5, 6];
const MINUTES = [30, 45, 60, 75];
const AGES = [30, 55];

const results: Array<{
  userId: string;
  level: string;
  equipment: string;
  days: number;
  minutes: number;
  age: number;
  exercises: string[]; // exercise IDs in order
}> = [];

let count = 0;

for (const level of LEVELS) {
  for (const [equipmentName, { ids, hasAll, track }] of Object.entries(EQUIPMENT_PROFILES)) {
    for (const days of DAYS) {
      for (const minutes of MINUTES) {
        for (const age of AGES) {
          count++;
          const userId = `baseline-wide-${count}`;
          
          const input: GeneratorInput = {
            userId,
            blockNumber: 1,
            level,
            equipmentIds: ids,
            hasAllEquipment: hasAll,
            goal: "muscle_gain",
            currentInjuryRegions: [],
            age,
            bmi: null,
            daysPerWeek: days,
            yogaDaysPerWeek: 0,
            primaryTrack: track,
            preferredSessionMinutes: minutes,
            catalogue,
          };
          
          const program = generateProgram(input);
          const exercises = program.days.flatMap(day => 
            day.exercises.map(e => e.exerciseId)
          );
          
          results.push({
            userId,
            level,
            equipment: equipmentName,
            days,
            minutes,
            age,
            exercises,
          });
        }
      }
    }
  }
}

writeFileSync(
  "scripts/fixtures/plan-baseline-wide.json",
  JSON.stringify(results, null, 2)
);

console.log(`Generated ${results.length} baseline plans`);
