/**
 * Test formatLoggedSets (FIX c): shows actual working sets instead of targets.
 *
 * Must FAIL on main: "What you did" showed '5 × 8–12' (targets) instead of
 * '10, 10, 9, 8, 8 × 80 kg' (actual logged sets).
 */

import { formatLoggedSets, type LoggedSet } from "../src/lib/session/format-logged-sets";

console.log("Test formatLoggedSets (FIX c)\n");

// Test 1: Same weight across sets
const setsA: LoggedSet[] = [
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 9, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 8, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 8, weightKg: 80, durationSeconds: null, isWarmupSet: false },
];

const resultA = formatLoggedSets(setsA, "reps", "metric");
const expectedA = "10, 10, 9, 8, 8 × 80 kg";
if (resultA !== expectedA) {
  console.error(`✗ FAIL Same weight: expected "${expectedA}", got "${resultA}"`);
  process.exit(1);
}
console.log(`✓ Same weight: "${resultA}"`);

// Test 2: Varying weight
const setsB: LoggedSet[] = [
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 9, weightKg: 77.5, durationSeconds: null, isWarmupSet: false },
];

const resultB = formatLoggedSets(setsB, "reps", "metric");
const expectedB = "10 × 80 kg, 10 × 80 kg, 9 × 77.5 kg";
if (resultB !== expectedB) {
  console.error(`✗ FAIL Varying weight: expected "${expectedB}", got "${resultB}"`);
  process.exit(1);
}
console.log(`✓ Varying weight: "${resultB}"`);

// Test 3: Bodyweight (no weight shown)
const setsC: LoggedSet[] = [
  { reps: 12, weightKg: null, durationSeconds: null, isWarmupSet: false },
  { reps: 11, weightKg: null, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: null, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: null, durationSeconds: null, isWarmupSet: false },
];

const resultC = formatLoggedSets(setsC, "reps", "metric");
const expectedC = "12, 11, 10, 10";
if (resultC !== expectedC) {
  console.error(`✗ FAIL Bodyweight: expected "${expectedC}", got "${resultC}"`);
  process.exit(1);
}
console.log(`✓ Bodyweight: "${resultC}"`);

// Test 4: Timed exercise (seconds)
const setsD: LoggedSet[] = [
  { reps: null, weightKg: null, durationSeconds: 45, isWarmupSet: false },
  { reps: null, weightKg: null, durationSeconds: 42, isWarmupSet: false },
  { reps: null, weightKg: null, durationSeconds: 40, isWarmupSet: false },
];

const resultD = formatLoggedSets(setsD, "seconds", "metric");
const expectedD = "45s, 42s, 40s";
if (resultD !== expectedD) {
  console.error(`✗ FAIL Timed: expected "${expectedD}", got "${resultD}"`);
  process.exit(1);
}
console.log(`✓ Timed: "${resultD}"`);

// Test 5: Skip warm-up sets
const setsE: LoggedSet[] = [
  { reps: 10, weightKg: 40, durationSeconds: null, isWarmupSet: true },
  { reps: 8, weightKg: 60, durationSeconds: null, isWarmupSet: true },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 9, weightKg: 80, durationSeconds: null, isWarmupSet: false },
];

const resultE = formatLoggedSets(setsE, "reps", "metric");
const expectedE = "10, 10, 9 × 80 kg";
if (resultE !== expectedE) {
  console.error(`✗ FAIL Skip warmup: expected "${expectedE}", got "${resultE}"`);
  process.exit(1);
}
console.log(`✓ Skip warmup: "${resultE}"`);

// Test 6: Imperial units
const setsF: LoggedSet[] = [
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
  { reps: 9, weightKg: 80, durationSeconds: null, isWarmupSet: false },
];

const resultF = formatLoggedSets(setsF, "reps", "imperial");
// 80kg = ~176.37 lb, rounded to 176 lb
if (!resultF || !resultF.includes("lb")) {
  console.error(`✗ FAIL Imperial: expected lb units, got "${resultF}"`);
  process.exit(1);
}
console.log(`✓ Imperial: "${resultF}"`);

// Tests 7-11: QA3 LOW-6 -- 0 / blank weights never mixed in, timed sets keep weight
for (const [label, sets, metric, expected] of [
  ["0 kg set among 80 kg sets", [
    { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
    { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
    { reps: 8, weightKg: 0, durationSeconds: null, isWarmupSet: false },
  ], "reps", "10 × 80 kg, 10 × 80 kg, 8"],
  ["blank-weight set among 80 kg sets", [
    { reps: 10, weightKg: 80, durationSeconds: null, isWarmupSet: false },
    { reps: 8, weightKg: null, durationSeconds: null, isWarmupSet: false },
  ], "reps", "10 × 80 kg, 8"],
  ["timed sets at one weight", [
    { reps: null, weightKg: 10, durationSeconds: 45, isWarmupSet: false },
    { reps: null, weightKg: 10, durationSeconds: 40, isWarmupSet: false },
  ], "seconds", "45s, 40s × 10 kg"],
  ["timed sets at varying weight", [
    { reps: null, weightKg: 10, durationSeconds: 45, isWarmupSet: false },
    { reps: null, weightKg: 12.5, durationSeconds: 40, isWarmupSet: false },
  ], "seconds", "45s × 10 kg, 40s × 12.5 kg"],
  ["timed sets, one unweighted", [
    { reps: null, weightKg: 10, durationSeconds: 45, isWarmupSet: false },
    { reps: null, weightKg: null, durationSeconds: 40, isWarmupSet: false },
  ], "seconds", "45s × 10 kg, 40s"],
] as Array<[string, LoggedSet[], "reps" | "seconds", string]>) {
  const got = formatLoggedSets(sets, metric, "metric");
  if (got !== expected) {
    console.error(`✗ FAIL ${label}: expected "${expected}", got "${got}"`);
    process.exit(1);
  }
  console.log(`✓ ${label}: "${got}"`);
}

// Test 12: timed weight in the user's units
{
  const got = formatLoggedSets([
    { reps: null, weightKg: 20, durationSeconds: 30, isWarmupSet: false },
  ], "seconds", "imperial");
  if (got !== "30s × 44 lb") {
    console.error(`✗ FAIL timed imperial: expected "30s × 44 lb", got "${got}"`);
    process.exit(1);
  }
  console.log(`✓ timed imperial: "${got}"`);
}

console.log("\n✅ All formatLoggedSets tests passed");
console.log("  On main: would show '5 × 8–12' (targets)");
console.log("  With fix: shows '10, 10, 9, 8, 8 × 80 kg' (actual sets)");
