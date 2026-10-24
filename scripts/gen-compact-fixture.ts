/**
 * Generate compact fixture with SHA-256 hashes in buckets.
 * Run on origin/main BEFORE applying the lib change.
 *
 *   npx tsx scripts/gen-compact-fixture.ts <no-equip|equip>
 */
import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

const mode = process.argv[2];
if (!mode || !["no-equip", "equip"].includes(mode)) {
  console.error("Usage: gen-compact-fixture.ts <no-equip|equip>");
  process.exit(1);
}

const mainSha = execSync("git rev-parse origin/main", { encoding: "utf-8" }).trim();

const patterns: Array<ExerciseMeta["movementPattern"]> = ["horizontal_press", "squat", "core"];
const mechanics: Array<ExerciseMeta["mechanic"] | null> = ["compound", "isolation", null];
const bodyweightValues = [true, false];
const failureValues = [0, 1, 2];
const repValues = [5, 10, 12];
const feelValues: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
const deloadValues = [true, false];

// For equipment mode
const equipmentSets = mode === "equip" ? [
  { ids: ["barbell"], unit: "kg" as const },
  { ids: ["barbell"], unit: "lb" as const },
  { ids: ["dumbbell"], unit: "kg" as const },
  { ids: ["dumbbell"], unit: "lb" as const },
  { ids: ["kettlebell"], unit: "kg" as const },
  { ids: ["kettlebell"], unit: "lb" as const },
  { ids: ["cable_machine"], unit: "kg" as const },
  { ids: ["lat_pulldown"], unit: "kg" as const },
  { ids: ["leg_extension"], unit: "kg" as const },
  { ids: ["medicine_ball"], unit: "kg" as const },
] : [];

// Weights: 0 to 100
const weights: number[] = [];
for (let w = 0; w <= 100; w += 2.5) {
  weights.push(w);
}
// Add some off-grid values
weights.push(2.75, 13.75, 61.25);

type Bucket = {
  hash: string;
  count: number;
};

const buckets: Bucket[] = Array.from({ length: 64 }, () => ({ hash: "", count: 0 }));
let totalCases = 0;

for (const mechanic of mechanics) {
  for (const pattern of patterns) {
    for (const isBodyweight of bodyweightValues) {
      for (const weight of weights) {
        for (const failures of failureValues) {
          for (const reps of repValues) {
            for (const feel of feelValues) {
              for (const deload of deloadValues) {
                // Equipment mode: iterate over equipment sets
                const equipCombos = mode === "equip" ? equipmentSets : [null];
                
                for (const equipCombo of equipCombos) {
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
                    equipmentIds: equipCombo?.ids,
                    unit: equipCombo?.unit,
                  });

                  const suggested = suggestedWeight(state, deload, meta, equipCombo?.ids, equipCombo?.unit);

                  // Create canonical JSON for hashing
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
                      equipmentIds: equipCombo?.ids,
                      unit: equipCombo?.unit,
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
}

const fixture = {
  mode,
  mainSha,
  generatedAt: new Date().toISOString(),
  totalCases,
  buckets: buckets.map((b, idx) => ({ idx, hash: b.hash, count: b.count })),
};

const filename = mode === "no-equip" 
  ? "scripts/fixtures/noequip-main.json"
  : "scripts/fixtures/equip-main.json";

writeFileSync(filename, JSON.stringify(fixture, null, 2));

console.log(`Generated ${totalCases} ${mode} cases from main ${mainSha.slice(0, 7)}`);
console.log(`Written to ${filename}`);
console.log(`Size: ${(JSON.stringify(fixture).length / 1024).toFixed(1)} KB`);
