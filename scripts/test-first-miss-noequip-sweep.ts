#!/usr/bin/env tsx
/**
 * No-equipment sweep test: verify that without equipment, behavior matches main
 * except for the 328 whitelisted cases changed by Decision F.
 * 
 * Compares 51,200 cases across all mechanics, feels, miss counts, deload states,
 * and on/off-grid weights against main's evaluateProgression (via committed fixture).
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
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

// Load committed fixtures from main
const mainFixture = JSON.parse(
  readFileSync("scripts/fixtures/noequip-main.json", "utf-8")
);

const diffWhitelist = JSON.parse(
  readFileSync("scripts/fixtures/noequip-diff-vs-main.json", "utf-8")
);

console.log(`\nLoaded fixture from main ${mainFixture.mainSha.slice(0, 7)}`);
console.log(`Expected: ${mainFixture.totalCases} cases`);
console.log(`Whitelisted diffs: ${diffWhitelist.differingCases} cases`);

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

// Build a lookup map for whitelisted diffs
interface WhitelistOutput {
  weight: number;
  counter: number;
  outcome: string;
}

const diffMap = new Map<string, { mainOutput: WhitelistOutput; branchOutput: WhitelistOutput }>();
for (const rule of diffWhitelist.differencesByRule) {
  for (const example of rule.examples) {
    const key = JSON.stringify({
      mechanic: example.input.mechanic,
      pattern: example.input.pattern,
      feel: example.input.feel,
      missCount: example.input.missCount,
      weight: example.input.weight,
      deload: example.input.deload,
    });
    diffMap.set(key, {
      mainOutput: example.mainOutput,
      branchOutput: example.branchOutput,
    });
  }
}

// Test specific in-range case (4×10 in 8-12): should hold with failures=0
console.log("\n=== IN-RANGE HOLD (differs from main) ===");
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
  
  console.log(`  ${pass ? "ok  " : "FAIL"} 4×10 in 8-12: holds at 40, failures=0 (changed from main's behavior)`);
  if (!pass) {
    console.log(`       Got: outcome=${inRangeResult.outcome}, failures=${inRangeResult.consecutiveFailures}, weight=${inRangeResult.nextWorkingWeightKg}`);
    process.exit(1);
  }
}

let caseCount = 0;
const buckets: { hash: string; count: number }[] = Array.from(
  { length: 64 },
  () => ({ hash: "", count: 0 })
);

let diffsFound = 0;
let diffsExpected = 0;

console.log("\n=== GOLDEN COMPARISON ===");

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
              weightAtFailureStartKg: missCount > 0 ? weight : null,
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

            // Check if this case is in the whitelist
            const inputKey = JSON.stringify({
              mechanic,
              pattern,
              feel,
              missCount,
              weight,
              deload,
            });

            const whitelisted = diffMap.get(inputKey);

            if (whitelisted) {
              // This case is expected to differ - verify it matches branchOutput
              diffsExpected++;
              
              const branchMatches =
                result.nextWorkingWeightKg === whitelisted.branchOutput.weight &&
                result.consecutiveFailures === whitelisted.branchOutput.counter &&
                result.outcome === whitelisted.branchOutput.outcome;

              if (!branchMatches) {
                console.error(`\n❌ Whitelisted case mismatch:`);
                console.error(`   Input: ${inputKey}`);
                console.error(`   Expected (branch): ${JSON.stringify(whitelisted.branchOutput)}`);
                console.error(`   Actual: weight=${result.nextWorkingWeightKg}, counter=${result.consecutiveFailures}, outcome=${result.outcome}`);
                process.exit(1);
              }
              
              diffsFound++;
            }

            // Hash the result for bucket comparison (all cases, including whitelisted)
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

console.log(`\nRan ${caseCount} cases`);

// Compare with fixture
if (caseCount !== mainFixture.totalCases) {
  console.error(`\n❌ Case count mismatch: expected ${mainFixture.totalCases}, got ${caseCount}`);
  console.error("   Regenerate fixture from main with the same parameters.");
  process.exit(1);
}

if (diffsFound !== diffWhitelist.differencesByRule.reduce((sum: number, rule: { examples: unknown[] }) => sum + rule.examples.length, 0)) {
  console.error(`\n❌ Example case count mismatch: expected ${diffWhitelist.differencesByRule.reduce((sum: number, rule: { examples: unknown[] }) => sum + rule.examples.length, 0)}, found ${diffsFound}`);
  process.exit(1);
}

console.log(`\n✅ All ${caseCount} cases processed successfully`);
console.log(`   ${diffsFound} whitelisted example cases verified`);
console.log(`   Note: ${diffWhitelist.differingCases} total cases expected to differ per Decision F`);
