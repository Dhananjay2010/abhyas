#!/usr/bin/env tsx
/**
 * Generate no-equipment fixture from main for regression testing.
 */

import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  evaluateProgression,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";

const MECHANICS: Array<"compound" | "isolation"> = ["compound", "isolation"];
const PATTERNS: Array<"horizontal_press" | "vertical_pull" | "squat" | "hinge" | "biceps"> = [
  "horizontal_press",
  "vertical_pull",
  "squat",
  "hinge",
  "biceps",
];
const FEELS: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const MISS_COUNTS = [0, 1, 2, 3];
const DELOADS = [false, true];

// Weights: on-grid (2.5 kg multiples) and off-grid
const WEIGHTS: number[] = [];
for (let w = 0; w <= 200; w += 2.5) {
  WEIGHTS.push(w);
  if (w > 0 && w < 200) {
    WEIGHTS.push(w + 1.25); // off-grid
  }
}

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3, weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number | null): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

let caseCount = 0;
const buckets: { hash: string; count: number }[] = Array.from(
  { length: 64 },
  () => ({ hash: "", count: 0 })
);

console.log("Generating no-equipment fixture from main...\n");

for (const mechanic of MECHANICS) {
  for (const pattern of PATTERNS) {
    for (const feel of FEELS) {
      for (const missCount of MISS_COUNTS) {
        for (const deload of DELOADS) {
          for (const weight of WEIGHTS) {
            const meta: ExerciseMeta = {
              mechanic,
              metric: "reps",
              movementPattern: pattern,
              isBodyweight: false,
              progressionChain: null,
              progressionRank: null,
            };

            const state = fresh({
              currentWorkingWeightKg: weight,
              consecutiveFailures: missCount,
            });

            const loggedSets: LoggedSet[] =
              missCount === 0
                ? sets(4, 12, weight)
                : sets(4, 7, weight); // Real miss (below repsMin=8)

            type EvalInput = Parameters<typeof evaluateProgression>[0];
            const input: EvalInput = {
              sets: loggedSets,
              plannedSets: 4,
              repsMin: 8,
              repsMax: 12,
              feel,
              meta,
              state,
              isDeload: deload,
              equipmentIds: undefined,
            };

            const result = evaluateProgression(input);

            const canonical = JSON.stringify({
              w: result.nextWorkingWeightKg,
              r: result.nextTargetReps,
              o: result.outcome,
              f: result.consecutiveFailures,
            });

            const hash = createHash("sha256").update(canonical).digest("hex");
            const bucketIdx = caseCount % 64;
            const oldHash = buckets[bucketIdx].hash;

            if (oldHash === "") {
              buckets[bucketIdx].hash = createHash("sha256")
                .update(hash)
                .digest("hex");
            } else {
              buckets[bucketIdx].hash = createHash("sha256")
                .update(oldHash + hash)
                .digest("hex");
            }

            buckets[bucketIdx].count++;
            caseCount++;
          }
        }
      }
    }
  }
}

const mainSha = execSync("git rev-parse HEAD").toString().trim();

const fixture = {
  mainSha,
  totalCases: caseCount,
  buckets,
};

writeFileSync(
  "scripts/fixtures/noequip-main.json",
  JSON.stringify(fixture, null, 2)
);

console.log(`Generated fixture from main ${mainSha.slice(0, 7)}`);
console.log(`Total cases: ${caseCount}`);
console.log(`Saved to scripts/fixtures/noequip-main.json`);
