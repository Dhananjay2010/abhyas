/**
 * Past-knee warm-up identity matrix test
 * 
 * Verifies that selectWarmup output is BYTE-IDENTICAL to main's output for all
 * scenarios except past-knee users. Tests every combination of injury states,
 * muscle groups, and equipment configurations.
 * 
 * Usage:
 *   1. Generate baseline on main: npm run test:past-knee-warmup-identity:baseline
 *   2. Compare on branch: npm run test:past-knee-warmup-identity
 * 
 * npm run test:past-knee-warmup-identity
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { selectWarmup, type WarmupRow } from "../src/lib/program/warmup";
import type { Database } from "../src/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type Muscle = Database["public"]["Enums"]["muscle"];

const warmupsPath = "scripts/fixtures/warmups.json";
if (!existsSync(warmupsPath)) {
  console.error(`FATAL: ${warmupsPath} does not exist - warmup tests cannot run`);
  process.exit(1);
}
const warmups = JSON.parse(readFileSync(warmupsPath, "utf8")) as WarmupRow[];

const baselineMode = process.argv[2] === "--baseline";
const baselinePath = "scripts/fixtures/past-knee-warmup-identity-baseline.json";

type TestCase = {
  label: string;
  trainingMuscles: Muscle[];
  injuryRegions: BodyRegion[];
  prehabRegions: BodyRegion[];
  hasAllEquipment: boolean;
  availableEquipment: string[] | null;
};

// Test matrix: every combination that should NOT be affected by the past-knee change
const testCases: TestCase[] = [];

// Injury states (excluding past-knee-only, which is the new behavior)
const injuryStates: Array<{ label: string; current: BodyRegion[]; prehab: BodyRegion[] }> = [
  { label: "no-injury", current: [], prehab: [] },
  { label: "past-shoulder", current: [], prehab: ["shoulder"] },
  { label: "current-shoulder", current: ["shoulder"], prehab: ["shoulder"] },
  { label: "past-lower-back", current: [], prehab: ["lower_back"] },
  { label: "current-lower-back", current: ["lower_back"], prehab: ["lower_back"] },
  { label: "past-hip", current: [], prehab: ["hip"] },
  { label: "current-hip", current: ["hip"], prehab: ["hip"] },
  { label: "past-ankle", current: [], prehab: ["ankle"] },
  { label: "current-ankle", current: ["ankle"], prehab: ["ankle"] },
  { label: "past-wrist", current: [], prehab: ["wrist"] },
  { label: "current-wrist", current: ["wrist"], prehab: ["wrist"] },
  { label: "current-knee", current: ["knee"], prehab: ["knee"] }, // Current knee, not past
  // REMOVED: past-knee-current-shoulder - this is a past-knee scenario that SHOULD change
];

// Muscle groups
const muscleGroups: Array<{ label: string; muscles: Muscle[] }> = [
  { label: "Upper", muscles: ["chest", "lats", "front_delts"] as Muscle[] },
  { label: "Lower", muscles: ["quads", "glutes", "hamstrings", "calves"] as Muscle[] },
  { label: "Push", muscles: ["chest", "front_delts", "triceps"] as Muscle[] },
  { label: "Pull", muscles: ["lats", "biceps", "rear_delts"] as Muscle[] },
  { label: "Legs", muscles: ["quads", "hamstrings", "glutes"] as Muscle[] },
  { label: "Full", muscles: ["chest", "lats", "quads", "glutes"] as Muscle[] },
];

// Equipment states
const equipmentStates: Array<{ label: string; hasAll: boolean; available: string[] | null }> = [
  { label: "all-equipment", hasAll: true, available: null },
  { label: "bodyweight-only", hasAll: false, available: ["bodyweight", "yoga_mat"] },
  { label: "partial", hasAll: false, available: ["bodyweight", "yoga_mat", "dumbbell", "resistance_band"] },
];

// Build matrix
for (const injury of injuryStates) {
  for (const muscleGroup of muscleGroups) {
    for (const equipment of equipmentStates) {
      testCases.push({
        label: `${injury.label}-${muscleGroup.label}-${equipment.label}`,
        trainingMuscles: muscleGroup.muscles,
        injuryRegions: injury.current,
        prehabRegions: injury.prehab,
        hasAllEquipment: equipment.hasAll,
        availableEquipment: equipment.available,
      });
    }
  }
}

// Run tests and generate results
type TestResult = {
  label: string;
  output: string; // JSON stringified warmup result for comparison
};

function runTestCase(tc: TestCase): TestResult {
  const result = selectWarmup({
    warmups,
    trainingMuscles: tc.trainingMuscles,
    injuryRegions: tc.injuryRegions,
    prehabRegions: tc.prehabRegions,
    track: "weights",
    hasAllEquipment: tc.hasAllEquipment,
    availableEquipment: tc.availableEquipment ? new Set(tc.availableEquipment) : null,
  });
  
  // Serialize for comparison (slugs + phases are enough for identity check)
  const serialized = result.map(w => ({ slug: w.slug, phase: w.phase }));
  return {
    label: tc.label,
    output: JSON.stringify(serialized, null, 2),
  };
}

if (baselineMode) {
  console.log("Generating baseline from main...");
  
  // Verify we're on main with the correct commit
  const currentCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const mainCommit = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
  
  if (currentCommit !== mainCommit) {
    console.error("ERROR: Must be on origin/main to generate baseline");
    console.error(`Current: ${currentCommit}`);
    console.error(`Expected: ${mainCommit}`);
    process.exit(1);
  }
  
  // Verify warmup.ts matches main
  const warmupContent = readFileSync("src/lib/program/warmup.ts", "utf8");
  const mainWarmupContent = execSync("git show origin/main:src/lib/program/warmup.ts", { encoding: "utf8" });
  
  if (warmupContent !== mainWarmupContent) {
    console.error("ERROR: src/lib/program/warmup.ts does not match origin/main");
    console.error("Refusing to generate baseline from modified file");
    process.exit(1);
  }
  
  const results = testCases.map(runTestCase);
  writeFileSync(baselinePath, JSON.stringify(results, null, 2));
  console.log(`✓ Baseline generated: ${results.length} test cases`);
  console.log(`  Written to ${baselinePath}`);
  process.exit(0);
}

// Compare mode
if (!existsSync(baselinePath)) {
  console.error(`ERROR: Baseline not found at ${baselinePath}`);
  console.error("Generate baseline first: npm run test:past-knee-warmup-identity:baseline");
  process.exit(1);
}

const baseline: TestResult[] = JSON.parse(readFileSync(baselinePath, "utf8"));
const current = testCases.map(runTestCase);

let failures = 0;
let changed = 0;

console.log("Past-knee warm-up identity matrix\n");
console.log(`Comparing ${current.length} test cases against baseline...\n`);

for (let i = 0; i < current.length; i++) {
  const baseResult = baseline[i];
  const currResult = current[i];
  
  if (baseResult.label !== currResult.label) {
    console.log(`✗ FATAL: Test case mismatch at index ${i}`);
    console.log(`  Baseline: ${baseResult.label}`);
    console.log(`  Current:  ${currResult.label}`);
    failures++;
    continue;
  }
  
  const identical = baseResult.output === currResult.output;
  if (!identical) {
    changed++;
    console.log(`✗ ${currResult.label}`);
    console.log(`  CHANGED from baseline`);
    console.log(`  Baseline: ${baseResult.output.substring(0, 100)}...`);
    console.log(`  Current:  ${currResult.output.substring(0, 100)}...`);
    failures++;
  }
}

console.log(`\nResults:`);
console.log(`  Total test cases: ${current.length}`);
console.log(`  Identical to main: ${current.length - changed}`);
console.log(`  Changed: ${changed}`);

if (failures === 0) {
  console.log(`\n✓ All ${current.length} test cases are byte-identical to main`);
  console.log("  The past-knee exclusion does not affect any other scenario");
} else {
  console.log(`\n✗ ${failures} test case(s) failed`);
  console.log("  Some non-past-knee scenarios have changed - this violates the identity requirement");
}

process.exit(failures > 0 ? 1 : 0);
