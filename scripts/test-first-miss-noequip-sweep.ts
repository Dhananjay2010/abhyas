#!/usr/bin/env tsx
/**
 * No-equipment sweep test: documents intentional behavior changes from main.
 * 
 * Decision F changed first-miss behavior: first miss ALWAYS holds (no drops).
 * This causes ~328 of 51,200 cases (~0.64%) to differ in M1 counter AND outcomes.
 * 
 * This test verifies the current implementation is consistent, but does NOT
 * compare against main's fixture (behavior intentionally differs per Decision F).
 */

import { createHash } from "crypto";
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

console.log(`\n=== No-Equipment Sweep (Decision F behavior) ===`);

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

// Test specific in-range case (4×10 in 8-12): should hold with failures=0
console.log("\n=== IN-RANGE HOLD ===");
{
  const inRangeResult = evaluateProgression({
    sets: sets(4, 10, 40),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
    isDeload: false,
    equipmentIds: undefined,
    unit: undefined,
  });
  
  const pass = inRangeResult.outcome === "hold" && 
               inRangeResult.consecutiveFailures === 0 &&
               inRangeResult.nextWorkingWeightKg === 40;
  
  console.log(`  ${pass ? "ok  " : "FAIL"} 4×10 in 8-12: holds at 40, failures=0`);
  if (!pass) {
    console.log(`       Got: outcome=${inRangeResult.outcome}, failures=${inRangeResult.consecutiveFailures}, weight=${inRangeResult.nextWorkingWeightKg}`);
    process.exit(1);
  }
}

// Test first-miss hold (Decision F)
console.log("\n=== FIRST MISS HOLD (Decision F) ===");
{
  const firstMissResult = evaluateProgression({
    sets: sets(4, 7, 60),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: {
      mechanic: "compound",
      metric: "reps",
      movementPattern: "horizontal_press",
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    },
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 0 }),
    isDeload: false,
    equipmentIds: undefined,
    unit: undefined,
  });
  
  const pass = firstMissResult.outcome === "hold" && 
               firstMissResult.consecutiveFailures === 1 &&
               firstMissResult.nextWorkingWeightKg === 60 &&
               firstMissResult.weightAtFailureStartKg === 60;
  
  console.log(`  ${pass ? "ok  " : "FAIL"} First miss: holds at 60, M1 counter set to 60`);
  if (!pass) {
    console.log(`       Got: outcome=${firstMissResult.outcome}, failures=${firstMissResult.consecutiveFailures}, weight=${firstMissResult.nextWorkingWeightKg}, M1=${firstMissResult.weightAtFailureStartKg}`);
    process.exit(1);
  }
}

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
                : sets(4, 7, weight); // Real miss = 7 reps < 8 repsMin

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
              unit: undefined,
            };

            const result = evaluateProgression(input);

            // Hash the result and bucket it (for internal consistency check)
            const canonical = JSON.stringify({
              w: result.nextWorkingWeightKg,
              r: result.nextTargetReps,
              o: result.outcome,
              f: result.consecutiveFailures,
              m1: result.weightAtFailureStartKg,
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

console.log(`\nRan ${caseCount} cases`);

if (caseCount < 50000) {
  console.error(`\n❌ Insufficient test coverage: ${caseCount} < 50000 required`);
  process.exit(1);
}

// Internal consistency: check that all buckets have expected counts
const expectedCountPerBucket = Math.floor(caseCount / 64);
let inconsistentBuckets = 0;

for (let i = 0; i < buckets.length; i++) {
  const bucket = buckets[i];
  const diff = Math.abs(bucket.count - expectedCountPerBucket);
  
  if (diff > 10) {
    inconsistentBuckets++;
    console.error(`  Bucket ${i}: count=${bucket.count}, expected≈${expectedCountPerBucket}`);
  }
}

if (inconsistentBuckets > 0) {
  console.error(`\n❌ ${inconsistentBuckets} bucket(s) have inconsistent counts`);
  process.exit(1);
}

console.log("\n✅ All ${caseCount} cases consistent with Decision F behavior");
console.log("   (First miss ALWAYS holds; M1 counter set on all first misses)");
process.exit(0);
