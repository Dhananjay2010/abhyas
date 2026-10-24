/**
 * Generate no-equipment first-miss fixture from current code.
 * Run this on origin/main BEFORE applying the lib change.
 *
 *   npx tsx scripts/gen-first-miss-noequip-fixture.ts
 */
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

const mainSha = execSync("git rev-parse origin/main", { encoding: "utf-8" }).trim();

const patterns: Array<ExerciseMeta["movementPattern"]> = ["horizontal_press", "squat", "core"];
const mechanics: Array<ExerciseMeta["mechanic"] | null> = ["compound", "isolation", null];
const bodyweightValues = [true, false];
const failureValues = [0, 1, 2];
const repValues = [5, 10, 12];
const feelValues: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const deloadValues = [true, false];

// Weights including off-grid values
const weights = [
  0, 2.5, 2.75, 5, 7.5, 10, 12.5, 13.75, 15, 17.5, 20, 22.5, 25, 27.5, 30,
  32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5, 60, 61.25,
];

type Case = {
  mechanic: ExerciseMeta["mechanic"] | null;
  pattern: ExerciseMeta["movementPattern"];
  isBodyweight: boolean;
  weight: number;
  failures: number;
  reps: number;
  feel: "easy" | "right" | "hard" | null;
  deload: boolean;
  outcome: string;
  nextWorkingWeightKg: number | null;
  nextTargetReps: number | null;
  consecutiveFailures: number;
  message: string;
  suggestedWeight: number | null;
};

const cases: Case[] = [];

for (const mechanic of mechanics) {
  for (const pattern of patterns) {
    for (const isBodyweight of bodyweightValues) {
      for (const weight of weights) {
        for (const failures of failureValues) {
          for (const reps of repValues) {
            for (const feel of feelValues) {
              for (const deload of deloadValues) {
                const meta: ExerciseMeta = {
                  mechanic: mechanic ?? "compound",
                  metric: "reps",
                  movementPattern: pattern,
                  isBodyweight,
                  progressionChain: isBodyweight ? pattern : null,
                  progressionRank: isBodyweight ? 1 : null,
                };

                const state: ProgressState = {
                  currentWorkingWeightKg: weight,
                  currentTargetReps: 12,
                  consecutiveFailures: failures,
                  bestWeightKg: weight,
                  bestReps: 12,
                  bestE1rm: weight > 0 ? weight * 1.4 : null,
                  totalSessions: 3,
                };

                // First miss: 3 sets of 10 reps (missed target of 12)
                const sets = Array.from({ length: 3 }, () => ({
                  reps: reps,
                  weightKg: weight,
                }));

                const result = evaluateProgression({
                  sets,
                  plannedSets: 4,
                  repsMin: 8,
                  repsMax: 12,
                  feel,
                  meta,
                  state,
                  isDeload: deload,
                  // No equipmentIds or unit: testing no-equipment path
                });

                const suggested = suggestedWeight(state, deload, meta);

                cases.push({
                  mechanic,
                  pattern,
                  isBodyweight,
                  weight,
                  failures,
                  reps,
                  feel,
                  deload,
                  outcome: result.outcome,
                  nextWorkingWeightKg: result.nextWorkingWeightKg,
                  nextTargetReps: result.nextTargetReps,
                  consecutiveFailures: result.consecutiveFailures,
                  message: result.message,
                  suggestedWeight: suggested,
                });
              }
            }
          }
        }
      }
    }
  }
}

const fixture = {
  mainSha,
  generatedAt: new Date().toISOString(),
  count: cases.length,
  cases,
};

writeFileSync(
  "scripts/fixtures/first-miss-noequip-main.json",
  JSON.stringify(fixture, null, 2)
);

console.log(`Generated ${cases.length} no-equipment cases from main ${mainSha.slice(0, 7)}`);
console.log(`Written to scripts/fixtures/first-miss-noequip-main.json`);
