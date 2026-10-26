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
    // @ts-ignore - temp file created dynamically
    const mainModule = await import("../src/lib/program/progression-main-temp.js");

    const branchEvaluate = branchModule.evaluateProgression;
    const mainEvaluate = mainModule.evaluateProgression;

  console.log("Imported both versions successfully\n");

  // Generate all 51,200 sweep inputs - EXACT same parameters as test-first-miss-noequip-sweep.ts
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

  // Weights: on-grid (2.5 kg multiples) and off-grid, 0 to 200
  const WEIGHTS: number[] = [];
  for (let w = 0; w <= 200; w += 2.5) {
    WEIGHTS.push(w);
    if (w > 0 && w < 200) {
      WEIGHTS.push(w + 1.25); // off-grid
    }
  }

  interface TestCase {
    mechanic: "compound" | "isolation";
    pattern: string;
    feel: "easy" | "right" | "hard" | null;
    missCount: number;
    weight: number;
    deload: boolean;
  }

  const cases: TestCase[] = [];
  for (const mechanic of MECHANICS) {
    for (const pattern of PATTERNS) {
      for (const feel of FEELS) {
        for (const missCount of MISS_COUNTS) {
          for (const weight of WEIGHTS) {
            for (const deload of DELOADS) {
              cases.push({
                mechanic,
                pattern,
                feel,
                missCount,
                weight,
                deload,
              });
            }
          }
        }
      }
    }
  }

  console.log(`Generated ${cases.length} test cases (expected 51,200)\n`);

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
      mechanic: testCase.mechanic,
      movementPattern: testCase.pattern as any,
      metric: "reps" as const,
      isBodyweight: false,
      progressionChain: null,
      progressionRank: null,
    };

    const state = {
      currentWorkingWeightKg: testCase.weight,
      currentTargetReps: 12,
      consecutiveFailures: testCase.missCount,
      bestWeightKg: testCase.weight,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: testCase.missCount > 0 ? testCase.weight : null,
    };

    // Generate sets based on miss count (same logic as test-first-miss-noequip-sweep.ts)
    const sets = testCase.missCount === 0
      ? [{ reps: 12, weightKg: testCase.weight }, { reps: 12, weightKg: testCase.weight }, { reps: 12, weightKg: testCase.weight }]
      : [{ reps: 5, weightKg: testCase.weight }, { reps: 5, weightKg: testCase.weight }, { reps: 5, weightKg: testCase.weight }];

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
          weight: mainResult.nextWorkingWeightKg ?? 0,
          counter: mainResult.consecutiveFailures,
          outcome: mainResult.outcome,
        },
        branchOutput: {
          weight: branchResult.nextWorkingWeightKg ?? 0,
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

    // Counter preserved/incremented at lightest weights (first-miss guard)
    if (
      diff.diffFields.includes("consecutiveFailures") &&
      !diff.diffFields.includes("weight") &&
      !diff.diffFields.includes("outcome") &&
      diff.input.missCount > 0
    ) {
      if (diff.mainOutput.counter === 0 && diff.branchOutput.counter > 0) {
        rule = "M1: Counter preserved at light weights (first-miss guards prevent drop, counter still increments)";
      } else if (diff.mainOutput.counter < 3 && diff.branchOutput.counter === 3) {
        rule = "Counter cap: Branch caps at 3 to prevent infinite growth at minimum weights";
      } else {
        rule = `Counter diff: main=${diff.mainOutput.counter}, branch=${diff.branchOutput.counter}`;
      }
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
