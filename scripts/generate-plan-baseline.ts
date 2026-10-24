/**
 * Generate baseline plans from origin/main for no-injury comparison test.
 * 
 * This fixture captures main's plan generation behavior for healthy users
 * (no injuries) so we can assert HEAD matches main exactly whenever main's
 * plan contained no excluded exercises.
 */

import { writeFileSync, readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

// Must import from origin/main's catalogue
const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));

const EQUIPMENT_PROFILES = {
  "full-gym": [] as string[], // hasAllEquipment: true
  "barbell-bench": ["barbell", "squat_rack", "flat_bench"],
  "bodyweight": [] as string[],
};

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const DAYS_PER_WEEK = [2, 3, 4, 5];
const SESSION_MINUTES = [30, 45, 60, 75];

const results: Array<{
  userId: string;
  level: string;
  equipment: string;
  days: number;
  minutes: number;
  exercises: string[]; // exercise IDs in order
}> = [];

let count = 0;

for (const level of LEVELS) {
  for (const [equipmentName, equipmentIds] of Object.entries(EQUIPMENT_PROFILES)) {
    for (const days of DAYS_PER_WEEK) {
      for (const minutes of SESSION_MINUTES) {
        count++;
        const userId = `baseline-${count}`;
        
        const input: GeneratorInput = {
          userId,
          blockNumber: 1,
          level,
          equipmentIds,
          hasAllEquipment: equipmentName === "full-gym",
          goal: "muscle_gain",
          currentInjuryRegions: [],
          age: null,
          bmi: null,
          daysPerWeek: days,
          yogaDaysPerWeek: 0,
          primaryTrack: equipmentName === "bodyweight" ? "bodyweight" : "weights",
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
          exercises,
        });
      }
    }
  }
}

writeFileSync(
  "scripts/fixtures/plan-baseline.json",
  JSON.stringify(results, null, 2)
);

console.log(`Generated ${results.length} baseline plans`);
