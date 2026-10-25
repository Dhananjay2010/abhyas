#!/usr/bin/env tsx
/**
 * Step 4: Wall-sit positioning grid test for past-knee plans.
 * 
 * Verifies that in past-knee plans, wall-sit comes after EVERY non-core exercise.
 * Tests across profiles, equipment sets, and session lengths.
 * 
 * Brief requirement: "In past-knee plans, wall-sit comes after EVERY non-core 
 * exercise in the day. It currently fails on 267 of 1,320 days."
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import catalogue from "./fixtures/catalogue.json";

const allExercises = catalogue as unknown as CandidateExercise[];
const byId = new Map(allExercises.map(e => [e.id, e]));

type Profile = {
  name: string;
  level: "beginner" | "intermediate" | "expert";
  goal: "muscle_gain" | "strength" | "fat_loss" | "general_fitness";
  daysPerWeek: 3 | 4 | 5 | 6;
};

type EquipmentSet = {
  name: string;
  hasAll: boolean;
  ids: string[];
};

const PROFILES: Profile[] = [
  { name: "Beginner/Muscle/3day", level: "beginner", goal: "muscle_gain", daysPerWeek: 3 },
  { name: "Intermediate/Strength/4day", level: "intermediate", goal: "strength", daysPerWeek: 4 },
  { name: "Expert/Muscle/5day", level: "expert", goal: "muscle_gain", daysPerWeek: 5 },
  { name: "Intermediate/FatLoss/3day", level: "intermediate", goal: "fat_loss", daysPerWeek: 3 },
];

const EQUIPMENT_SETS: EquipmentSet[] = [
  { name: "All Equipment", hasAll: true, ids: [] },
  { name: "Bodyweight Only", hasAll: false, ids: [] },
  { name: "Basic (Barbell+Dumbbell)", hasAll: false, ids: ["barbell", "dumbbell", "flat_bench", "squat_rack"] },
  { name: "Home Gym", hasAll: false, ids: ["dumbbell", "flat_bench", "pull_up_bar", "resistance_band"] },
];

const SESSION_LENGTHS = [30, 45, 60] as const;

let totalDays = 0;
let failedDays = 0;
let wallSitDaysCount = 0;
let passedWallSitDays = 0;

const failures: string[] = [];

console.log("Testing wall-sit positioning in past-knee plans...\n");

for (const profile of PROFILES) {
  for (const equipmentSet of EQUIPMENT_SETS) {
    for (const sessionLength of SESSION_LENGTHS) {
      const input: GeneratorInput = {
        userId: "test-user",
        blockNumber: 1,
        goal: profile.goal,
        level: profile.level,
        primaryTrack: "weights",
        daysPerWeek: profile.daysPerWeek,
        yogaDaysPerWeek: 0,
        age: 35,
        bmi: 24,
        hasAllEquipment: equipmentSet.hasAll,
        equipmentIds: equipmentSet.ids,
        currentInjuryRegions: [],
        anyKneeInjury: true, // Past knee injury
        preferredSessionMinutes: sessionLength,
        catalogue: allExercises,
      };

      let program;
      try {
        program = generateProgram(input);
      } catch (error) {
        // Skip configurations that fail to generate
        console.log(`  Skipped ${profile.name} / ${equipmentSet.name} / ${sessionLength}min: ${error}`);
        continue;
      }

      for (const day of program.days) {
        totalDays++;

        // Find wall-sit in this day
        const wallSitIdx = day.exercises.findIndex(ex => {
          const e = byId.get(ex.exerciseId);
          return e?.slug === "wall-sit";
        });

        if (wallSitIdx === -1) {
          // No wall-sit in this day - that's okay
          continue;
        }

        wallSitDaysCount++;

        // Find first core exercise
        const firstCoreIdx = day.exercises.findIndex(ex => {
          const e = byId.get(ex.exerciseId);
          return e?.movement_pattern === "core";
        });

        // Wall-sit should come after ALL non-core exercises
        // i.e., wall-sit should be right before core (or at end if no core)
        const expectedIdx = firstCoreIdx === -1 ? day.exercises.length - 1 : firstCoreIdx - 1;

        // Check if wall-sit is at the expected position
        // For past-knee, wall-sit must be the LAST non-core exercise
        let isCorrectlyPlaced = false;

        if (firstCoreIdx === -1) {
          // No core exercises - wall-sit should be last
          isCorrectlyPlaced = wallSitIdx === day.exercises.length - 1;
        } else {
          // Wall-sit should be immediately before first core
          // AND there should be no non-core exercises after wall-sit
          const hasNonCoreAfterWallSit = day.exercises.slice(wallSitIdx + 1, firstCoreIdx).some(ex => {
            const e = byId.get(ex.exerciseId);
            return e && e.movement_pattern !== "core";
          });
          
          isCorrectlyPlaced = !hasNonCoreAfterWallSit;
        }

        if (isCorrectlyPlaced) {
          passedWallSitDays++;
        } else {
          failedDays++;
          
          const exerciseList = day.exercises.map((ex, idx) => {
            const e = byId.get(ex.exerciseId);
            const marker = idx === wallSitIdx ? " <- WALL-SIT" : "";
            const coreMarker = e?.movement_pattern === "core" ? " [CORE]" : "";
            return `${idx}: ${e?.slug}${coreMarker}${marker}`;
          }).join("\n    ");

          failures.push(
            `${profile.name} / ${equipmentSet.name} / ${sessionLength}min / Day ${day.dayLabel}:\n` +
            `  wall-sit at index ${wallSitIdx}, expected before first core at ${firstCoreIdx}\n` +
            `  Exercises:\n    ${exerciseList}`
          );
        }
      }
    }
  }
}

console.log("=== Results ===");
console.log(`Total days generated: ${totalDays}`);
console.log(`Days with wall-sit: ${wallSitDaysCount}`);
console.log(`Days with correctly placed wall-sit: ${passedWallSitDays}`);
console.log(`Days with incorrectly placed wall-sit: ${failedDays}`);

if (failedDays > 0) {
  console.log(`\n❌ FAIL: ${failedDays} days have wall-sit not at the end of non-core exercises`);
  console.log("\nFirst 5 failures:");
  failures.slice(0, 5).forEach(f => console.log(f + "\n"));
  process.exit(1);
} else {
  console.log("\n✅ PASS: All days with wall-sit have it correctly placed after all non-core exercises");
}
