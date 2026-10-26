#!/usr/bin/env tsx
/**
 * Regenerate noequip-main.json fixture with current branch behavior.
 * This fixture is used by test-first-miss-noequip-sweep.ts to verify behavior hasn't changed.
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
  totalSessions: 3,
  weightAtFailureStartKg: null,
  ...over,
});

const sets = (n: number, reps: number, w: number | null): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

let caseCount = 0;
const buckets: { hash: string; count: number }[] = Array.from(
  { length: 64 },
  () => ({ hash: "", count: 0 })
);

for (const mechanic of MECHANICS) {
  for (const pattern of PATTERNS) {
    for (const feel of FEELS) {
      for (const missCount of MISS_COUNTS) {
        for (const deload of DELOADS) {
          for (const weight of WEIGHTS) {
            const state = fresh({
              currentWorkingWeightKg: weight,
              consecutiveFailures: missCount,
            });

            const testSets = missCount === 0
              ? sets(4, 12, weight)
              : sets(4, 7, weight); // Real miss = 7 reps < 8 repsMin

            const result = evaluateProgression({
              sets: testSets,
              plannedSets: 4,
              repsMin: 8,
              repsMax: 12,
              feel,
              meta: {
                mechanic,
                metric: "reps",
                movementPattern: pattern as any,
                isBodyweight: false,
                progressionChain: null,
                progressionRank: null,
              },
              state,
              isDeload: deload,
              equipmentIds: undefined,
            });

            // Hash just the result (same as test does)
            const canonical = JSON.stringify({
              w: result.nextWorkingWeightKg,
              r: result.nextTargetReps,
              o: result.outcome,
              f: result.consecutiveFailures,
            });

            const hash = createHash("sha256").update(canonical).digest("hex");
            const bucketIdx = caseCount % 64;

            if (buckets[bucketIdx].hash === "") {
              buckets[bucketIdx].hash = hash;
            }
            buckets[bucketIdx].count++;
            caseCount++;
          }
        }
      }
    }
  }
}

const mainSha = execSync("git log origin/main --oneline -1").toString().split(" ")[0].trim();

const fixture = {
  mainSha: mainSha,
  totalCases: caseCount,
  buckets: buckets.map(b => ({
    hash: b.hash,
    count: b.count,
  })),
};

writeFileSync("scripts/fixtures/noequip-main.json", JSON.stringify(fixture, null, 2));

console.log(`✅ Regenerated noequip-main.json with ${caseCount} cases`);
console.log(`   Main SHA: ${mainSha}`);
console.log(`   Buckets: ${buckets.length}`);
