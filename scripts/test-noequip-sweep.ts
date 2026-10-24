/**
 * No-equipment sweep: compare against main's behavior using compact fixture.
 * Ensures no-equipment cases are unchanged.
 *
 *   npx tsx scripts/test-noequip-sweep.ts
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

const fixture = JSON.parse(
  readFileSync("scripts/fixtures/noequip-main.json", "utf-8")
);

console.log(`\nLoaded fixture from main ${fixture.mainSha.slice(0, 7)}`);
console.log(`Expected: ${fixture.totalCases} cases`);

const patterns: Array<ExerciseMeta["movementPattern"]> = ["horizontal_press", "squat", "core"];
const mechanics: Array<ExerciseMeta["mechanic"] | null> = ["compound", "isolation", null];
const bodyweightValues = [true, false];
const failureValues = [0, 1, 2];
const repValues = [5, 10, 12];
const feelValues: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const deloadValues = [true, false];

const weights: number[] = [];
for (let w = 0; w <= 100; w += 2.5) {
  weights.push(w);
}
weights.push(2.75, 13.75, 61.25);

const buckets: { hash: string; count: number }[] = Array.from({ length: 64 }, () => ({ hash: "", count: 0 }));
let totalCases = 0;
let diffs = 0;

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

                const sets = Array.from({ length: 3 }, () => ({
                  reps,
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
                  // No equipmentIds or unit
                });

                const suggested = suggestedWeight(state, deload, meta);

                const canonical = JSON.stringify({
                  input: {
                    mechanic,
                    pattern,
                    isBodyweight,
                    weight,
                    failures,
                    reps,
                    feel,
                    deload,
                    equipmentIds: undefined,
                    unit: undefined,
                  },
                  output: {
                    outcome: result.outcome,
                    nextWorkingWeightKg: result.nextWorkingWeightKg,
                    nextTargetReps: result.nextTargetReps,
                    consecutiveFailures: result.consecutiveFailures,
                    message: result.message,
                    suggestedWeight: suggested,
                  },
                });

                const hash = createHash("sha256").update(canonical).digest("hex");
                const bucketIdx = parseInt(hash.slice(0, 2), 16) % 64;
                
                const bucketHash = createHash("sha256").update(buckets[bucketIdx].hash + hash).digest("hex");
                buckets[bucketIdx].hash = bucketHash;
                buckets[bucketIdx].count++;
                totalCases++;
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Generated: ${totalCases} cases`);

// Compare buckets
for (let i = 0; i < 64; i++) {
  const expected = fixture.buckets.find((b: { idx: number }) => b.idx === i);
  if (!expected) {
    console.error(`\nERROR: Missing bucket ${i} in fixture`);
    diffs++;
    continue;
  }
  
  if (buckets[i].hash !== expected.hash || buckets[i].count !== expected.count) {
    console.error(`\nERROR: Bucket ${i} mismatch`);
    console.error(`  Expected: ${expected.count} cases, hash ${expected.hash.slice(0, 16)}...`);
    console.error(`  Got:      ${buckets[i].count} cases, hash ${buckets[i].hash.slice(0, 16)}...`);
    diffs++;
  }
}

console.log(`\nNo-equipment sweep: ${totalCases} cases, ${diffs} bucket differences`);
console.log(`${diffs === 0 ? "PASS" : "FAIL"}: ${diffs === 0 ? "All buckets match" : `${diffs} bucket(s) differ`}`);

process.exit(diffs > 0 ? 1 : 0);
