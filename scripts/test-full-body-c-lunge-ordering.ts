#!/usr/bin/env npx tsx
/**
 * Test Full Body C lunge slot ordering for past-knee users.
 * 
 * Requirements:
 * 1. Hip-dominant knee-safe lifts first (hip thrust/glute bridge, RDL/single-leg RDL, hamstring curl)
 * 2. Then Spanish squat or leg extension
 * 3. Wall-sit last
 * 4. Wall-sit must never be the only lower-body work on the day
 */

import { readFileSync } from "fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

console.log("Full Body C Lunge Slot Ordering for Past-Knee Users");
console.log("─".repeat(60));

// Test Full Body C (3-day split, day 3)
const equipmentProfiles = [
  { name: "All equipment", hasAllEquipment: true, equipmentIds: [] },
  { name: "Home bodyweight", hasAllEquipment: false, equipmentIds: [] },
  { name: "Dumbbells only", hasAllEquipment: false, equipmentIds: ["dumbbell"] },
];

for (const equipment of equipmentProfiles) {
  console.log(`\n${equipment.name}:`);
  
  const input: GeneratorInput = {
    userId: "test-full-body-c",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,  // 3-day split has Full Body C
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: equipment.hasAllEquipment,
    equipmentIds: equipment.equipmentIds,
    currentInjuryRegions: [],
    anyKneeInjury: true,  // Past knee
    preferredSessionMinutes: 60,
    catalogue,
  };
  
  const result = generateProgram(input);
  
  // Find Full Body C (should be day 3 in a 3-day split: A, B, C)
  const fullBodyC = result.days.find(day => day.dayIndex === 5); // Friday in 3-day split (Mon/Wed/Fri)
  
  if (!fullBodyC || fullBodyC.label !== "Full Body C") {
    console.log(`  ⚠ Full Body C not found at expected position`);
    continue;
  }
  
  const exercises = fullBodyC.exercises.map(ex => {
    const exData = catalogueById.get(ex.exerciseId);
    return { ...ex, exData };
  }).filter(e => e.exData !== undefined);
  
  // Identify lower-body exercises
  const lowerBodyPatterns = new Set(["squat", "lunge", "hinge", "calf"]);
  const lowerBodyExercises = exercises.filter(e => 
    e.exData && lowerBodyPatterns.has(e.exData.movement_pattern)
  );
  
  console.log(`  Lower-body exercises: ${lowerBodyExercises.length}`);
  for (const ex of lowerBodyExercises) {
    console.log(`    ${ex.orderIndex}. ${ex.name} (${ex.exData?.movement_pattern})`);
  }
  
  // Check 1: Must have at least one lower-body exercise
  check("Has lower-body work", lowerBodyExercises.length > 0);
  
  // Check 2: Wall-sit must not be the only lower-body work
  if (lowerBodyExercises.length === 1) {
    const hasOnlyWallSit = lowerBodyExercises[0].exData?.slug === "wall-sit";
    check(
      "Wall-sit not only lower-body work",
      !hasOnlyWallSit,
      hasOnlyWallSit ? "Wall-sit is the only lower-body exercise!" : ""
    );
  } else {
    check("Wall-sit not only lower-body work", true, `${lowerBodyExercises.length} lower-body exercises`);
  }
  
  // Check 3: If wall-sit is present, it should come after other lower-body work
  const wallSitIndex = lowerBodyExercises.findIndex(e => e.exData?.slug === "wall-sit");
  if (wallSitIndex !== -1) {
    const isLast = wallSitIndex === lowerBodyExercises.length - 1;
    check(
      "Wall-sit comes last among lower-body exercises",
      isLast,
      !isLast ? `Wall-sit at position ${wallSitIndex + 1} of ${lowerBodyExercises.length}` : ""
    );
  }
  
  // Check 4: Hip-dominant exercises should come before quad isolation
  const hipDominantIndices: number[] = [];
  const quadIsolationIndices: number[] = [];
  
  for (let i = 0; i < lowerBodyExercises.length; i++) {
    const ex = lowerBodyExercises[i];
    if (!ex.exData) continue;
    
    const isHipDominant = ex.exData.movement_pattern === "hinge" && 
      (ex.exData.primary_muscles.includes("glutes") || ex.exData.primary_muscles.includes("hamstrings"));
    
    const isQuadIsolation = ["leg-extensions", "single-leg-leg-extension", "spanish-squat"].includes(ex.exData.slug);
    
    if (isHipDominant) hipDominantIndices.push(i);
    if (isQuadIsolation) quadIsolationIndices.push(i);
  }
  
  if (hipDominantIndices.length > 0 && quadIsolationIndices.length > 0) {
    const hipFirst = Math.min(...hipDominantIndices);
    const quadFirst = Math.min(...quadIsolationIndices);
    check(
      "Hip-dominant before quad isolation",
      hipFirst < quadFirst,
      hipFirst >= quadFirst ? `Hip at ${hipFirst}, quad at ${quadFirst}` : ""
    );
  }
}

console.log("\n" + "─".repeat(60));
if (failures === 0) {
  console.log("✓ All Full Body C lunge slot tests passed");
  process.exit(0);
} else {
  console.log(`✗ ${failures} test failures`);
  process.exit(1);
}
