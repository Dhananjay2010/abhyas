#!/usr/bin/env npx tsx
/**
 * Generate identity baseline from main's code for all injury classes.
 * 
 * Command to regenerate (from main branch 1f44fc7d):
 *   npx tsx scripts/generate-identity-baseline.ts
 * 
 * Grid:
 * - 5 injury classes: no-injury, current-knee, past-knee, shoulder-past, lower-back-past
 * - 5 equipment sets: all, bodyweight, db+bench, kb-only, barbell+rack+bench
 * - 3 levels: beginner, intermediate, advanced
 * - Days: 2, 3, 4, 5, 6
 * - Minutes: 30, 45, 60, 75, 90
 * - 2 goals: muscle_gain, strength
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { buildEligibleSwapList } from "../src/lib/session/eligible-swap-list";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

type InjuryClass = "no-injury" | "current-knee" | "past-knee" | "shoulder-past" | "lower-back-past";
type EquipmentSet = "all" | "bodyweight" | "db+bench" | "kb-only" | "barbell+rack+bench";

const injuries: InjuryClass[] = ["no-injury", "current-knee", "past-knee", "shoulder-past", "lower-back-past"];
const equipment: EquipmentSet[] = ["all", "bodyweight", "db+bench", "kb-only", "barbell+rack+bench"];
const levels = ["beginner", "intermediate", "expert"] as const;
const daysList = [2, 3, 4, 5, 6];
const minutesList = [30, 45, 60, 75, 90];
const goals = ["muscle_gain", "strength"] as const;

interface HashEntry {
  profile: string;
  programHash: string;
  swapHashes: Record<string, string>;
}

const hashes: HashEntry[] = [];

function getEquipmentIds(equipSet: EquipmentSet): { hasAllEquipment: boolean; equipmentIds: string[] } {
  switch (equipSet) {
    case "all":
      return { hasAllEquipment: true, equipmentIds: [] };
    case "bodyweight":
      return { hasAllEquipment: false, equipmentIds: [] };
    case "db+bench":
      return { hasAllEquipment: false, equipmentIds: ["dumbbell", "bench"] };
    case "kb-only":
      return { hasAllEquipment: false, equipmentIds: ["kettlebell"] };
    case "barbell+rack+bench":
      return { hasAllEquipment: false, equipmentIds: ["barbell", "squat-rack", "bench"] };
  }
}

function getInjuryRegions(injuryClass: InjuryClass): { anyKneeInjury: boolean; currentInjuryRegions: string[] } {
  switch (injuryClass) {
    case "no-injury":
      return { anyKneeInjury: false, currentInjuryRegions: [] };
    case "current-knee":
      return { anyKneeInjury: true, currentInjuryRegions: ["knee"] };
    case "past-knee":
      return { anyKneeInjury: true, currentInjuryRegions: [] };
    case "shoulder-past":
      return { anyKneeInjury: false, currentInjuryRegions: [] };
    case "lower-back-past":
      return { anyKneeInjury: false, currentInjuryRegions: [] };
  }
}

function hashObject(obj: any): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

let profileCount = 0;

for (const injury of injuries) {
  for (const equipSet of equipment) {
    for (const level of levels) {
      for (const days of daysList) {
        for (const minutes of minutesList) {
          for (const goal of goals) {
            const { hasAllEquipment, equipmentIds } = getEquipmentIds(equipSet);
            const { anyKneeInjury, currentInjuryRegions } = getInjuryRegions(injury);
            
            const input: GeneratorInput = {
              userId: "baseline-test",
              blockNumber: 1,
              goal,
              level,
              primaryTrack: equipSet === "bodyweight" ? "bodyweight" : "weights",
              daysPerWeek: days,
              yogaDaysPerWeek: 0,
              age: 30,
              bmi: 23,
              hasAllEquipment,
              equipmentIds,
              currentInjuryRegions: currentInjuryRegions as any,
              anyKneeInjury,
              preferredSessionMinutes: minutes,
              catalogue,
            };
            
            const program = generateProgram(input);
            const programHash = hashObject(program);
            
            // Generate swap hashes for 3 test exercises
            const swapHashes: Record<string, string> = {};
            const testSlugs = ["barbell-squat", "spanish-squat", "split-squat-with-dumbbells"];
            
            for (const slug of testSlugs) {
              const exercise = catalogue.find(e => e.slug === slug);
              if (exercise) {
                const swaps = buildEligibleSwapList({
                  currentExercise: exercise,
                  sessionExerciseId: "test",
                  generatorInput: input,
                  pool: catalogue,
                  alreadyInSession: new Set(),
                });
                swapHashes[slug] = hashObject(swaps.map(e => e.slug));
              }
            }
            
            const profileId = `${injury}-${equipSet}-${level}-${days}d-${minutes}m-${goal}`;
            hashes.push({ profile: profileId, programHash, swapHashes });
            profileCount++;
          }
        }
      }
    }
  }
}

console.log(`Generated ${profileCount} profile hashes`);
console.log(`Injury classes: ${injuries.length}`);
console.log(`Equipment sets: ${equipment.length}`);
console.log(`Levels: ${levels.length}`);
console.log(`Days: ${daysList.length}`);
console.log(`Minutes: ${minutesList.length}`);
console.log(`Goals: ${goals.length}`);

writeFileSync("scripts/fixtures/identity-baseline-full.json", JSON.stringify(hashes, null, 2));
console.log("Saved to scripts/fixtures/identity-baseline-full.json");
