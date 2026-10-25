#!/usr/bin/env tsx
/**
 * PR #73 Run 13: Report the count of current-knee lower/full/legs days without quads-primary exercises
 * over a grid of at least 15,750 plans.
 */

import { readFileSync } from "node:fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

const goals: Array<"general_fitness" | "muscle_gain" | "strength" | "fat_loss" | "flexibility_stress"> = [
  "general_fitness",
  "muscle_gain",
  "strength",
  "fat_loss",
  "flexibility_stress",
];

const levels: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const daysPerWeekOptions = [2, 3, 4, 5, 6];
const sessionLengths = [30, 45, 60, 75];
const bmiOptions = [22, 27, 32]; // Normal, overweight, obese
const blocks = [1, 2];
const ages = [25, 35, 45, 55]; // Various age brackets

type EquipmentScenario = {
  name: string;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  track: "weights" | "bodyweight";
};

// Equipment scenarios to test (current-knee needs leg-extension machine or wall-sit space)
const equipmentScenarios: EquipmentScenario[] = [
  { name: "all", hasAllEquipment: true, equipmentIds: [], track: "weights" },
  { name: "db-bench", hasAllEquipment: false, equipmentIds: ["flat_bench", "dumbbell"], track: "weights" },
  { name: "barbell-rack", hasAllEquipment: false, equipmentIds: ["barbell", "squat_rack"], track: "weights" },
  { name: "machines", hasAllEquipment: false, equipmentIds: ["cable_machine", "leg_extension", "leg_curl"], track: "weights" },
  { name: "kettlebell", hasAllEquipment: false, equipmentIds: ["kettlebell", "pull_up_bar"], track: "weights" },
  { name: "no-equipment", hasAllEquipment: false, equipmentIds: [], track: "bodyweight" },
];

let totalPlans = 0;
let totalDays = 0;
let quadFreeDays = 0;

console.log("Testing current-knee quad coverage across comprehensive grid...\n");

for (const goal of goals) {
  for (const level of levels) {
    for (const daysPerWeek of daysPerWeekOptions) {
      for (const sessionMinutes of sessionLengths) {
        for (const bmi of bmiOptions) {
          for (const blockNumber of blocks) {
            for (const equipment of equipmentScenarios) {
              for (const age of ages) {
                totalPlans++;
                
              const input: GeneratorInput = {
                userId: `test-${goal}-${level}-${daysPerWeek}d-${sessionMinutes}m-bmi${bmi}-b${blockNumber}-${equipment.name}-age${age}`,
                blockNumber,
                goal,
                level,
                primaryTrack: equipment.track,
                  daysPerWeek,
                  yogaDaysPerWeek: 0,
                  age,
                  bmi,
                  hasAllEquipment: equipment.hasAllEquipment,
                  equipmentIds: equipment.equipmentIds,
                  currentInjuryRegions: ["knee"],
                  anyKneeInjury: true,
                  preferredSessionMinutes: sessionMinutes,
                  carryOver: {},
                  catalogue,
                };
            
              const program = generateProgram(input);
              const byId = new Map(catalogue.map(e => [e.id, e]));
              
              // Check each lower/full/legs day
              for (const day of program.days) {
                if (day.dayType !== "weights" && day.dayType !== "bodyweight") continue;
                if (day.focus !== "lower" && day.focus !== "legs" && day.focus !== "full_body") continue;
                
                totalDays++;
                
                // Count quads-primary exercises
                const hasQuadsPrimary = day.exercises.some(ex => {
                  const e = byId.get(ex.exerciseId);
                  return e?.primary_muscles.includes("quads");
                });
                
                if (!hasQuadsPrimary) {
                  quadFreeDays++;
                  console.log(`  MISSING QUAD: ${input.userId} ${day.label} (${day.exercises.length} exercises)`);
                }
              }
              }
            }
          }
        }
      }
    }
  }
}

console.log("\n" + "=".repeat(80));
console.log(`Total plans tested: ${totalPlans}`);
console.log(`Total current-knee lower/full/legs days: ${totalDays}`);
console.log(`Days without quads-primary exercise: ${quadFreeDays}`);
console.log("=".repeat(80));

if (quadFreeDays > 0) {
  console.error(`\n❌ FAILED: ${quadFreeDays} days are missing quads-primary exercises`);
  process.exit(1);
}

console.log("\n✅ SUCCESS: All current-knee lower/full/legs days have ≥1 quads-primary exercise");
