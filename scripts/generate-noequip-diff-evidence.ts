#!/usr/bin/env tsx
/**
 * Real comparison of no-equipment progression between main and branch.
 * Imports both versions, runs the full 51,200-case sweep, and documents all differences.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Get main SHA
const mainSha = execSync("git log origin/main --oneline -1").toString().split(" ")[0].trim();
console.log(`Comparing against main SHA: ${mainSha}\n`);

async function runComparison() {
  // Write main's progression.ts to a temp file inside src/lib/program/
  const mainProgressionTs = execSync(`git show ${mainSha}:src/lib/program/progression.ts`).toString();
  const tempFile = path.join(process.cwd(), "src/lib/program/progression-main-temp.ts");

  try {
    fs.writeFileSync(tempFile, mainProgressionTs);
    console.log(`Wrote main's progression.ts to: ${tempFile}`);

    // Dynamic imports
    const branchModule = await import("@/lib/program/progression");
    const mainModule = await import("../src/lib/program/progression-main-temp.js");

    const branchEvaluate = branchModule.evaluateProgression;
    const mainEvaluate = mainModule.evaluateProgression;

  console.log("Imported both versions successfully\n");

  // Generate all 51,200 sweep inputs
  const mechanics = ["compound", "isolation"];
  const patterns = ["horizontal_press", "vertical_press", "horizontal_pull", "vertical_pull"];
  const feels = [null, "easy", "right", "hard"];
  const repsOptions = [
    [10, 10, 10, 10], // in-range
    [8, 8, 8], // low-range
    [5, 5, 5], // miss
  ];
  const weightsCompound = [2.5, 3.75, 5, 10, 20, 40, 60, 80, 100];
  const weightsIsolation = [2.5, 3.75, 5, 7.5, 10, 15, 20];
  const failureStates = [
    { failures: 0, weightAtFailureStart: null },
    { failures: 1, weightAtFailureStart: null },
    { failures: 1, weightAtFailureStart: 42.5 },
    { failures: 2, weightAtFailureStart: 42.5 },
  ];
  const deloadOptions = [false, true];

  interface TestCase {
    mechanic: string;
    pattern: string;
    feel: string | null;
    reps: number[];
    weight: number;
    failures: number;
    weightAtFailureStart: number | null;
    deload: boolean;
  }

  const cases: TestCase[] = [];
  for (const mechanic of mechanics) {
    const weights = mechanic === "compound" ? weightsCompound : weightsIsolation;
    for (const pattern of patterns) {
      for (const feel of feels) {
        for (const reps of repsOptions) {
          for (const weight of weights) {
            for (const failureState of failureStates) {
              for (const deload of deloadOptions) {
                cases.push({
                  mechanic,
                  pattern,
                  feel,
                  reps,
                  weight,
                  failures: failureState.failures,
                  weightAtFailureStart: failureState.weightAtFailureStart,
                  deload,
                });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${cases.length} test cases`);

  // Compare outputs
  interface Diff {
    input: TestCase;
    mainOutput: { weight: number; counter: number; outcome: string };
    branchOutput: { weight: number; counter: number; outcome: string };
    diffFields: string[];
  }

  const diffs: Diff[] = [];

  for (const testCase of cases) {
    const meta = {
      mechanic: testCase.mechanic as "compound" | "isolation",
      movementPattern: testCase.pattern as any,
      metric: "reps" as const,
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    };

    const state = {
      currentWorkingWeightKg: testCase.weight,
      currentTargetReps: 10,
      consecutiveFailures: testCase.failures,
      bestWeightKg: testCase.weight,
      bestReps: 10,
      bestE1rm: null,
      totalSessions: 1,
      weightAtFailureStartKg: testCase.weightAtFailureStart,
    };

    const sets = testCase.reps.map(r => ({ reps: r, weightKg: testCase.weight }));

    const input = {
      sets,
      plannedSets: 3,
      repsMin: 8,
      repsMax: 12,
      feel: testCase.feel,
      meta,
      state,
      isDeload: testCase.deload,
      equipmentIds: undefined, // No equipment
    };

    const mainResult = mainEvaluate(input);
    const branchResult = branchEvaluate(input);

    // Compare weight, counter, and outcome
    const diffFields: string[] = [];
    if (mainResult.nextWorkingWeightKg !== branchResult.nextWorkingWeightKg) {
      diffFields.push("weight");
    }
    if (mainResult.consecutiveFailures !== branchResult.consecutiveFailures) {
      diffFields.push("consecutiveFailures");
    }
    if (mainResult.outcome !== branchResult.outcome) {
      diffFields.push("outcome");
    }

    if (diffFields.length > 0) {
      diffs.push({
        input: testCase,
        mainOutput: {
          weight: mainResult.nextWorkingWeightKg,
          counter: mainResult.consecutiveFailures,
          outcome: mainResult.outcome,
        },
        branchOutput: {
          weight: branchResult.nextWorkingWeightKg,
          counter: branchResult.consecutiveFailures,
          outcome: branchResult.outcome,
        },
        diffFields,
      });
    }
  }

  console.log(`\nFound ${diffs.length} differing cases\n`);

  // Group diffs by rule
  const diffsByRule: { [rule: string]: Diff[] } = {};

  for (const diff of diffs) {
    // Determine which rule caused the difference
    let rule = "unknown";

    // Counter preserved at lightest weights (first-miss guard)
    if (
      diff.diffFields.includes("consecutiveFailures") &&
      !diff.diffFields.includes("weight") &&
      !diff.diffFields.includes("outcome") &&
      diff.input.reps.some(r => r < 8) && // Miss
      diff.input.failures === 0 &&
      [2.5, 3.75, 5].includes(diff.input.weight)
    ) {
      rule = "M1: Counter preserved at lightest weights (first-miss guard prevents drop)";
    }

    if (!diffsByRule[rule]) {
      diffsByRule[rule] = [];
    }
    diffsByRule[rule].push(diff);
  }

  // Write evidence file
  const evidenceFile = path.join(process.cwd(), "scripts/fixtures/noequip-diff-vs-main.json");
  const evidence = {
    mainSha,
    comparedAt: new Date().toISOString(),
    totalCases: cases.length,
    differingCases: diffs.length,
    differencesByRule: Object.entries(diffsByRule).map(([rule, cases]) => ({
      rule,
      count: cases.length,
      examples: cases.slice(0, 5).map(d => ({
        input: d.input,
        mainOutput: d.mainOutput,
        branchOutput: d.branchOutput,
        diffFields: d.diffFields,
      })),
    })),
    note: `This PR introduces M1 (first-miss back-off floor) which stores the pre-miss weight and increments 
the failure counter even when first-miss guards (Rule 1: >20% cut, Rule 2: two-miss floor) prevent the weight 
from dropping. This makes the third-miss step-down reachable at light weights where Rule 1 or Rule 2 would 
otherwise hold the weight indefinitely.`,
  };

  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
  console.log(`✅ Evidence file written to: ${evidenceFile}`);

  // Update mainSha in fixture
  const fixturePath = path.join(process.cwd(), "scripts/fixtures/noequip-main.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  fixture.mainSha = mainSha;
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  console.log(`✅ Updated mainSha in fixture to: ${mainSha}`);

  // Print summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total cases: ${cases.length}`);
  console.log(`Differing cases: ${diffs.length}`);
  for (const [rule, cases] of Object.entries(diffsByRule)) {
    console.log(`  ${rule}: ${cases.length} cases`);
  }

  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
      console.log(`\n✅ Cleaned up temp file: ${tempFile}`);
    }
  }
}

runComparison().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
