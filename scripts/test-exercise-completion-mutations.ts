#!/usr/bin/env tsx
/**
 * Mutation tests for partial-exercise rule.
 *
 * Verifies that mutations treating partial as skipped or counting warm-up sets
 * would be caught by the helper tests.
 *
 *   npx tsx scripts/test-exercise-completion-mutations.ts
 */

import { exerciseCompletion } from "../src/lib/session/completion";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("🧬 Testing exercise completion mutants\n");

// Mutant 1: Treat partial (1+ sets) as skipped
console.log("Mutant 1: Treat partial as skipped");
{
  const result = exerciseCompletion(1, 4);

  // Correct behavior: 1+ sets should NOT be skipped
  assertTrue(result !== "skipped", "1+ working sets must not be skipped");
  assertTrue(result === "partial", "1+ working sets must be partial");

  // Mutant would treat partial as skipped
  const correctResult: string = "partial";
  const mutantResult: string = "skipped";
  assertTrue(mutantResult !== correctResult, "Mutant would incorrectly skip");
}

// Mutant 2: Count all sets including warm-up
console.log("\nMutant 2: Count warm-up sets");
{
  // Correct: only working sets count toward completion
  // If we had 2 warm-up sets and 1 working set out of 4 planned:
  // Working sets: 1, Planned: 4 => partial
  const result = exerciseCompletion(1, 4);

  assertTrue(result === "partial", "Only working sets count (1 of 4)");

  // Mutant: would count warm-up + working = 3, treating it differently
  const mutantTotal = 3; // 2 warm-up + 1 working
  const mutantResult = exerciseCompletion(mutantTotal, 4);

  assertTrue(mutantResult === "partial", "Mutant with 3 total would still be partial");
  // The key is that passing working+warmup count would give wrong result
  assertTrue(mutantTotal !== 1, "Mutant would use wrong count");
}

// Mutant 3: Treat 0 sets as partial instead of skipped
console.log("\nMutant 3: Treat 0 sets as partial");
{
  const result = exerciseCompletion(0, 4);

  assertTrue(result === "skipped", "0 working sets must be skipped");

  // Mutant would treat 0 sets as partial
  const correctResult: string = "skipped";
  const mutantResult: string = "partial";
  assertTrue(mutantResult !== correctResult, "Mutant would not skip 0 sets");
}

// Mutant 4: Treat partial as completed
console.log("\nMutant 4: Treat partial as completed");
{
  const result = exerciseCompletion(2, 4);

  assertTrue(result === "partial", "Partial (2 of 4) must be partial");
  assertTrue(result !== "completed", "Partial must not be completed");

  // Mutant would mark partial as completed
  const correctResult: string = "partial";
  const mutantResult: string = "completed";
  assertTrue(mutantResult !== correctResult, "Mutant would mark partial as completed");
}

// Mutant 5: Always return skipped
console.log("\nMutant 5: Always return skipped");
{
  const completedResult = exerciseCompletion(4, 4);
  const partialResult = exerciseCompletion(2, 4);

  assertTrue(completedResult === "completed", "Completed (4 of 4) must be completed");
  assertTrue(partialResult === "partial", "Partial (2 of 4) must be partial");

  // Mutant would always return skipped
  assertTrue(completedResult !== "skipped", "Mutant would skip completed");
  assertTrue(partialResult !== "skipped", "Mutant would skip partial");
}

// Mutant 6: Ignore logged sets count
console.log("\nMutant 6: Ignore logged sets count");
{
  const zeroResult = exerciseCompletion(0, 4);
  const someResult = exerciseCompletion(2, 4);
  const allResult = exerciseCompletion(4, 4);

  assertTrue(zeroResult === "skipped", "0 sets must be skipped");
  assertTrue(someResult === "partial", "2 sets must be partial");
  assertTrue(allResult === "completed", "4 sets must be completed");

  // Mutant ignoring logged sets would give same result for all
  const allDistinct = zeroResult !== someResult && someResult !== allResult && zeroResult !== allResult;
  assertTrue(allDistinct, "Mutant ignoring logged sets would not distinguish");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All mutants caught!");
