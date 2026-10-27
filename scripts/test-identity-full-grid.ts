#!/usr/bin/env npx tsx
/**
 * Compare this branch against main baseline for all injury classes.
 * 
 * Expected:
 * - Non-knee users: 0 diffs (programs AND swaps)
 * - Past-knee users: 0 diffs (programs AND swaps)
 * - Current-knee users: diffs limited to banned-slug replacements
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { buildEligibleSwapList } from "../src/lib/session/eligible-swap-list";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const baseline = JSON.parse(
  readFileSync("scripts/fixtures/identity-baseline-full.json", "utf-8")
);

type InjuryClass = "no-injury" | "current-knee" | "past-knee" | "shoulder-past" | "lower-back-past";
type EquipmentSet = "all" | "bodyweight" | "db+bench" | "kb-only" | "barbell+rack+bench";

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

const diffsByClass: Record<InjuryClass, { programDiffs: number; swapDiffs: number }> = {
  "no-injury": { programDiffs: 0, swapDiffs: 0 },
  "current-knee": { programDiffs: 0, swapDiffs: 0 },
  "past-knee": { programDiffs: 0, swapDiffs: 0 },
  "shoulder-past": { programDiffs: 0, swapDiffs: 0 },
  "lower-back-past": { programDiffs: 0, swapDiffs: 0 },
};

const exampleDiffs: Array<{ profile: string; type: string; detail: string }> = [];

for (const entry of baseline) {
  const parts = entry.profile.split("-");
  const injury = parts[0] + (parts[1] === "injury" ? "-injury" : parts[1] === "knee" ? "-knee" : parts[1] === "past" ? "-past" : "");
  
  // Reconstruct profile parameters
  const match = entry.profile.match(/^(.+?)-(all|bodyweight|db\+bench|kb-only|barbell\+rack\+bench)-(beginner|intermediate|advanced)-(\d+)d-(\d+)m-(muscle_gain|strength)$/);
  if (!match) continue;
  
  const [, injuryClass, equipSet, level, days, minutes, goal] = match as [string, InjuryClass, EquipmentSet, string, string, string, string];
  
  const { hasAllEquipment, equipmentIds } = getEquipmentIds(equipSet);
  const { anyKneeInjury, currentInjuryRegions } = getInjuryRegions(injuryClass);
  
  const input: GeneratorInput = {
    userId: "baseline-test",
    blockNumber: 1,
    goal: goal as any,
    level: level as any,
    primaryTrack: equipSet === "bodyweight" ? "bodyweight" : "weights",
    daysPerWeek: parseInt(days),
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment,
    equipmentIds,
    currentInjuryRegions: currentInjuryRegions as any,
    anyKneeInjury,
    preferredSessionMinutes: parseInt(minutes),
    catalogue,
  };
  
  const program = generateProgram(input);
  const programHash = hashObject(program);
  
  if (programHash !== entry.programHash) {
    diffsByClass[injuryClass].programDiffs++;
    if (exampleDiffs.length < 10) {
      exampleDiffs.push({ profile: entry.profile, type: "program", detail: `${entry.programHash} -> ${programHash}` });
    }
  }
  
  // Check swap hashes
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
      const swapHash = hashObject(swaps.map(e => e.slug));
      
      if (swapHash !== entry.swapHashes[slug]) {
        diffsByClass[injuryClass].swapDiffs++;
        if (exampleDiffs.length < 10) {
          exampleDiffs.push({ profile: entry.profile, type: `swap:${slug}`, detail: `${entry.swapHashes[slug]} -> ${swapHash}` });
        }
      }
    }
  }
}

console.log("=".repeat(80));
console.log("IDENTITY COMPARISON VS MAIN (1f44fc7d)");
console.log("=".repeat(80));
console.log("");

for (const [injuryClass, counts] of Object.entries(diffsByClass)) {
  console.log(`${injuryClass}:`);
  console.log(`  Program diffs: ${counts.programDiffs}`);
  console.log(`  Swap diffs: ${counts.swapDiffs}`);
}

console.log("");
console.log("Example diffs (first 10):");
for (const diff of exampleDiffs.slice(0, 10)) {
  console.log(`  ${diff.profile} [${diff.type}]: ${diff.detail}`);
}

console.log("");

const noInjuryOk = diffsByClass["no-injury"].programDiffs === 0 && diffsByClass["no-injury"].swapDiffs === 0;
const pastKneeOk = diffsByClass["past-knee"].programDiffs === 0 && diffsByClass["past-knee"].swapDiffs === 0;
const shoulderOk = diffsByClass["shoulder-past"].programDiffs === 0 && diffsByClass["shoulder-past"].swapDiffs === 0;
const lowerBackOk = diffsByClass["lower-back-past"].programDiffs === 0 && diffsByClass["lower-back-past"].swapDiffs === 0;

if (noInjuryOk && pastKneeOk && shoulderOk && lowerBackOk) {
  console.log("✓ PASS: Non-knee and past-knee users have 0 diffs");
  console.log(`Current-knee diffs: ${diffsByClass["current-knee"].programDiffs} programs, ${diffsByClass["current-knee"].swapDiffs} swaps`);
  process.exit(0);
} else {
  console.log("✗ FAIL: Unexpected diffs detected");
  process.exit(1);
}
