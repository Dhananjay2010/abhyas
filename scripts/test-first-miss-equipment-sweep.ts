#!/usr/bin/env tsx
/**
 * Equipment sweep test: verify all equipment progression changes follow rules.
 * 
 * Tests at least 20k cases across all equipment grids, both units, and on/off-grid weights.
 * Asserts:
 * - 0 cases where first-miss < two-miss
 * - 0 off-grid non-hold decreases
 * - 0 first misses that drop more than 1.5 steps below current
 */

import {
  evaluateProgression,
  suggestedWeight,
  FIRST_MISS_HOLD_THRESHOLD,
  type ExerciseMeta,
  type ProgressState,
  type LoggedSet,
} from "../src/lib/program/progression";
import { gridStepFor, KETTLEBELL_WEIGHTS_KG, type WeightUnit } from "../src/lib/session/equipment-grid";

const EQUIPMENTS: Array<{ ids: string[]; unit: WeightUnit }> = [
  { ids: ["barbell"], unit: "kg" },
  { ids: ["dumbbell"], unit: "kg" },
  { ids: ["kettlebell"], unit: "kg" },
  { ids: ["cable_machine"], unit: "kg" },
  { ids: ["lat_pulldown"], unit: "kg" },
  { ids: ["leg_extension"], unit: "kg" },
  { ids: ["medicine_ball"], unit: "kg" },
  { ids: ["barbell"], unit: "lb" },
  { ids: ["dumbbell"], unit: "lb" },
  { ids: ["kettlebell"], unit: "lb" },
];

const MECHANICS: Array<"compound" | "isolation"> = ["compound", "isolation"];
const PATTERNS: Array<ExerciseMeta["movementPattern"]> = [
  "horizontal_press",
  "vertical_pull",
  "squat",
  "hinge",
  "horizontal_pull",
  "vertical_press",
  "biceps",
  "triceps",
  "lateral_delt",
  "core",
];
const FEELS: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];

// Generate on-grid and off-grid weights for each equipment
function* generateWeights(equipmentIds: string[], _unit: WeightUnit): Generator<number> {
  if (equipmentIds.includes("kettlebell")) {
    // Test kettlebell weights
    for (const bell of KETTLEBELL_WEIGHTS_KG) {
      yield bell;
      if (bell < KETTLEBELL_WEIGHTS_KG[KETTLEBELL_WEIGHTS_KG.length - 1]) {
        yield bell + 1; // off-grid
      }
    }
  } else {
    // Standard grid weights - extended range for coverage
    const step = gridStepFor(equipmentIds, "kg");
    for (let w = step; w <= 200; w += step) {
      yield w;
    }
    // Add some off-grid weights
    yield 2.75;
    yield 13.75;
    yield 61.25;
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
  ...over,
});

const sets = (n: number, reps: number, w: number): LoggedSet[] =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

let caseCount = 0;
let invariantViolations = 0;
let stepViolations = 0;
let offGridDecreases = 0;

console.log("\n=== Equipment Sweep ===");
console.log("Verifying invariants across all equipment types...\n");

function isOnGrid(weight: number, equipmentIds: string[], unit: WeightUnit): boolean {
  if (equipmentIds.includes("kettlebell")) {
    return KETTLEBELL_WEIGHTS_KG.includes(weight);
  }
  const step = gridStepFor(equipmentIds, unit);
  return Math.abs(weight - Math.round(weight / step) * step) < 0.001;
}

for (const { ids, unit } of EQUIPMENTS) {
  for (const mechanic of MECHANICS) {
    for (const pattern of PATTERNS) {
      for (const feel of FEELS) {
        for (const weight of generateWeights(ids, unit)) {
          const meta: ExerciseMeta = {
            mechanic,
            metric: "reps",
            movementPattern: pattern,
            isBodyweight: false,
            progressionChain: null,
            progressionRank: null,
          };

          // Test first miss
          const state = fresh({
            currentWorkingWeightKg: weight,
            consecutiveFailures: 0,
          });
          const loggedSets = sets(4, 10, weight); // Missed target

          type EvalInput = Parameters<typeof evaluateProgression>[0];
          const input: EvalInput = {
            sets: loggedSets,
            plannedSets: 4,
            repsMin: 8,
            repsMax: 12,
            feel,
            meta,
            state,
            isDeload: false,
            equipmentIds: ids,
            unit,
          };

        const firstMissResult = evaluateProgression(input);
        caseCount++;

        const firstMissW = firstMissResult.nextWorkingWeightKg ?? 0;

        // Check invariant: first-miss >= two-miss
        const twoMissInput: EvalInput = {
          ...input,
          state: fresh({
            currentWorkingWeightKg: weight,
            consecutiveFailures: 1,
          }),
        };
        const twoMissResult = evaluateProgression(twoMissInput);
        const twoMissW = twoMissResult.nextWorkingWeightKg ?? 0;

        if (firstMissW < twoMissW - 0.001) {
          invariantViolations++;
          console.log(
            `VIOLATION: first-miss < two-miss for ${ids[0]} ${weight} ${unit}`
          );
          console.log(`  first-miss: ${firstMissW}, two-miss: ${twoMissW}`);
        }

        // Check step violation: first miss should not drop more than 1.5 steps (non-kettlebell)
        if (!ids.includes("kettlebell")) {
          const step = gridStepFor(ids, unit);
          const maxDrop = step * 1.5;
          if (firstMissW < weight - maxDrop - 0.001 && firstMissW < weight - 0.001) {
            stepViolations++;
            console.log(
              `STEP VIOLATION: dropped ${weight - firstMissW} (> ${maxDrop}) for ${ids[0]} ${weight} ${unit}`
            );
          }
        }

        // Check off-grid decreases
        if (
          firstMissW < weight - 0.001 &&
          firstMissResult.outcome !== "hold" &&
          !isOnGrid(firstMissW, ids, unit)
        ) {
          offGridDecreases++;
          console.log(
            `OFF-GRID DECREASE: ${ids[0]} ${weight} -> ${firstMissW} ${unit}`
          );
        }

        // Test suggested weight for holds
        const suggested = suggestedWeight(state, false, meta, ids, unit);
        if (firstMissResult.outcome === "hold" && suggested !== null && Math.abs(suggested - weight) > 0.001) {
          console.log(
            `HOLD MISMATCH: ${ids[0]} ${weight} ${unit} outcome=hold but suggested=${suggested}`
          );
        }
        }
      }
    }
  }
}

console.log(`\nRan ${caseCount} equipment cases`);

if (caseCount < 20000) {
  console.error(
    `\n❌ Insufficient coverage: ${caseCount} < 20000 required`
  );
  process.exit(1);
}

if (invariantViolations > 0) {
  console.error(
    `\n❌ ${invariantViolations} invariant violations (first-miss < two-miss)`
  );
  process.exit(1);
}

if (stepViolations > 0) {
  console.error(
    `\n❌ ${stepViolations} step violations (dropped > 1.5 steps on first miss)`
  );
  process.exit(1);
}

if (offGridDecreases > 0) {
  console.error(
    `\n❌ ${offGridDecreases} off-grid non-hold decreases`
  );
  process.exit(1);
}

console.log(`\n✅ All invariants passed:`);
console.log(`   0 first-miss < two-miss violations`);
console.log(`   0 step violations (> 1.5 steps)`);
console.log(`   0 off-grid non-hold decreases`);
