#!/usr/bin/env tsx
/**
 * Generate evidence: noequip diff from sweep
 * 
 * Compares branch progression against committed main fixture.
 * Uses the fixture data as baseline (no dynamic imports).
 */

import * as fs from "fs";
import { evaluateProgression, type ExerciseMeta, type ProgressState } from "../src/lib/program/progression";

console.log("Comparing against main fixture\n");

async function runComparison() {
  console.log("Loading baseline fixture...");
  
  // Load the committed baseline fixture
  const baselineFixture = JSON.parse(fs.readFileSync("scripts/fixtures/noequip-main.json", "utf8"));
  
  const MECHANICS: Array<"compound" | "isolation"> = ["compound", "isolation"];
  const FEELS: Array<"easy" | "right" | "hard" | null> = ["easy", "right", "hard", null];
  
  interface DiffEntry {
    mechanic: "compound" | "isolation";
    feel: "easy" | "right" | "hard" | null;
    startKg: number;
    failures: number;
    branchNext: number;
    mainNext: number;
  }
  
  const diffs: DiffEntry[] = [];
  
  console.log("Running sweep...\n");
  
  const TEST_WEIGHTS = Array.from({ length: 800 }, (_, i) => 2.5 + i * 0.5);
  const FAILURE_COUNTS = [0, 1, 2, 3];
  
  let tested = 0;
  let matching = 0;
  
  for (const mech of MECHANICS) {
    for (const feel of FEELS) {
      for (const failCount of FAILURE_COUNTS) {
        for (const startKg of TEST_WEIGHTS) {
          tested++;
          
          const key = `${mech}-${feel}-${startKg}-${failCount}`;
          const baselineNext = baselineFixture[key];
          
          if (baselineNext === undefined) {
            console.log(`Missing baseline for ${key}`);
            continue;
          }
          
          const meta: ExerciseMeta = {
            mechanic: mech,
            movementPattern: "other",
            metric: "reps",
            isBodyweight: false,
            progressionChain: null,
            progressionRank: null,
          };
          
          const state: ProgressState = {
            currentWorkingWeightKg: startKg,
            currentTargetReps: 12,
            consecutiveFailures: failCount,
            bestWeightKg: startKg,
            bestReps: 12,
            bestE1rm: startKg * 1.3,
            totalSessions: 5,
            weightAtFailureStartKg: failCount > 0 ? startKg + 2.5 : null,
          };
          
          const sets = Array.from({ length: 4 }, () => ({
            reps: 7,
            weightKg: startKg,
            durationSeconds: null,
          }));
          
          const branchDecision = evaluateProgression({
            sets,
            plannedSets: 4,
            repsMin: 8,
            repsMax: 12,
            feel: feel,
            meta,
            state,
            isDeload: false,
          });
          
          if (branchDecision.nextWorkingWeightKg !== baselineNext) {
            diffs.push({
              mechanic: mech,
              feel,
              startKg,
              failures: failCount,
              branchNext: branchDecision.nextWorkingWeightKg ?? 0,
              mainNext: baselineNext,
            });
          } else {
            matching++;
          }
        }
      }
    }
  }
  
  console.log(`\nTested: ${tested} cases`);
  console.log(`Matching: ${matching}`);
  console.log(`Diffs: ${diffs.length}`);
  
  if (diffs.length > 0) {
    const diffPath = "scripts/fixtures/noequip-diff-vs-main.json";
    fs.writeFileSync(diffPath, JSON.stringify(diffs, null, 2));
    console.log(`\nWrote ${diffs.length} diffs to ${diffPath}`);
  } else {
    console.log("\n✅ No diffs - branch matches main fixture exactly");
  }
}

runComparison().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
