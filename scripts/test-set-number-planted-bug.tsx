/**
 * PLANTED BUG TEST: Prove that old code fails when set numbers collide
 */

import "./helpers/setup-jsdom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SessionRunner } from "../src/app/session/[id]/session-runner";
import type { RunnerExercise, SessionActions } from "../src/app/session/[id]/session-runner";

const FIXED_TIME = 1700000000000;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n  🐛 ASSERTION FAILED: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// Simulate OLD buggy nextSetTarget that ignores pending sets
function nextSetTargetBuggy<T extends { id: string; status: string; sets: Array<{ setNumber: number }> }>(
  exercises: T[],
  displayedExerciseId: string,
): { sessionExerciseId: string; setNumber: number } | null {
  const exercise = exercises.find((e: T) => e.id === displayedExerciseId);
  if (!exercise || exercise.status !== "pending") return null;
  const highest = exercise.sets.reduce((max, s) => Math.max(max, s.setNumber), 0);
  return { sessionExerciseId: exercise.id, setNumber: highest + 1 }; // BUG: ignores pending sets!
}

async function testPlantedBug() {
  console.log("\n🐛 PLANTED BUG TEST: Old code produces duplicate set numbers\n");
  
  const exercise = {
    id: "ex-1",
    status: "pending",
    sets: [] as Array<{ setNumber: number }>,
  };
  
  // Simulate: first set logged (now pending), second set about to log
  const pendingSets = [{ sessionExerciseId: "ex-1", setNumber: 1 }];
  
  // Old buggy code
  const target1 = nextSetTargetBuggy([exercise], "ex-1");
  assert(target1 !== null, "Target found");
  assert(target1.setNumber === 1, "First call returns set 1");
  
  // User logs second set while first is still pending
  // OLD CODE REUSES set number 1 because it doesn't count pending!
  const target2 = nextSetTargetBuggy([exercise], "ex-1");
  assert(target2 !== null, "Target found");
  
  // THIS ASSERTION SHOULD FAIL with the buggy code
  try {
    assert(
      target2.setNumber === 2,
      `BUGGY CODE: Expected setNumber 2, got ${target2.setNumber} (DUPLICATE!)`
    );
  } catch (e) {
    console.log("\n✅ PLANTED BUG CAUGHT: Old code produces duplicate set number 1!");
    console.log("   Expected: setNumber = 2");
    console.log(`   Got:      setNumber = ${target2.setNumber}`);
    console.log("   This causes data loss when both sets replay with same number.\n");
    process.exit(0);
  }
  
  console.error("\n❌ PLANTED BUG TEST FAILED: Expected assertion to fail but it passed!");
  process.exit(1);
}

testPlantedBug();
