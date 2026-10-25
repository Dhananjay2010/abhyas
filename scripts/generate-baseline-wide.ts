/**
 * Generate baseline-no-injury-wide.json from current code (run from main branch).
 * 
 * Coverage:
 * - Equipment: full-gym, kettlebell, db_bench, bb_rack, bands, machines
 * - All 5 goals
 * - 2-6 days
 * - 30/75 min
 * - Ages 30, 55
 * - All 3 levels
 * 
 * Total: 1800 profiles (6 equipment × 5 goals × 3 levels × 5 days × 2 minutes × 2 ages)
 */

import { writeFileSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8")
);

const EQUIPMENT_MAP: Record<string, { ids: string[]; hasAll: boolean; track: "weights" | "bodyweight" }> = {
  "full-gym": { ids: [], hasAll: true, track: "weights" },
  "kettlebell": { ids: ["kettlebell"], hasAll: false, track: "weights" },
  "db_bench": { ids: ["dumbbell", "flat_bench"], hasAll: false, track: "weights" },
  "bb_rack": { ids: ["barbell", "squat_rack"], hasAll: false, track: "weights" },
  "bands": { ids: ["resistance_band"], hasAll: false, track: "weights" },
  "machines": { ids: ["cable_machine", "leg_extension", "leg_curl"], hasAll: false, track: "weights" },
};

const GOALS: Array<"general_fitness" | "muscle_gain" | "strength" | "fat_loss" | "flexibility_stress"> = [
  "general_fitness",
  "muscle_gain",
  "strength",
  "fat_loss",
  "flexibility_stress",
];

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const DAYS = [2, 3, 4, 5, 6];
const MINUTES = [30, 75];
const AGES = [30, 55];

const results: Array<{
  userId: string;
  level: string;
  equipment: string;
  goal: string;
  days: number;
  minutes: number;
  age: number;
  sha256: string;
}> = [];

let count = 0;

for (const [equipmentName, { ids, hasAll, track }] of Object.entries(EQUIPMENT_MAP)) {
  for (const goal of GOALS) {
    for (const level of LEVELS) {
      for (const days of DAYS) {
        for (const minutes of MINUTES) {
          for (const age of AGES) {
            count++;
            const userId = `baseline-${equipmentName}-${goal}-${level}-${days}d-${minutes}m-age${age}`;
            
            const input: GeneratorInput = {
              userId,
              blockNumber: 1,
              goal,
              level,
              primaryTrack: track,
              daysPerWeek: days,
              yogaDaysPerWeek: 0,
              age,
              bmi: null,
              hasAllEquipment: hasAll,
              equipmentIds: ids,
              preferredSessionMinutes: minutes,
              currentInjuryRegions: [],
              anyKneeInjury: false,
              catalogue,
            };
            
            try {
              const plan = generateProgram(input);
              // Hash the FULL plan JSON (not just exercise IDs)
              const canonical = JSON.stringify(plan);
              const sha256 = createHash("sha256").update(canonical).digest("hex");
              
              results.push({
                userId,
                level,
                equipment: equipmentName,
                goal,
                days,
                minutes,
                age,
                sha256,
              });
            } catch (err) {
              console.error(`Error generating plan for ${userId}: ${err}`);
              process.exit(1);
            }
          }
        }
      }
    }
  }
}

console.log(`Generated ${count} baseline profiles`);
writeFileSync(
  __dirname + "/fixtures/baseline-no-injury-wide.json",
  JSON.stringify(results, null, 2) + "\n",
  "utf-8"
);
console.log("Wrote baseline-no-injury-wide.json");
