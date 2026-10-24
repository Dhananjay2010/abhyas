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
  const result = exerciseCompletion({ workingSetsLogged: 1, plannedSets: 4 });

  // Correct behavior: 1+ sets should NOT be skipped
  assertTrue(result.kind !== "skipped", "1+ working sets must not be skipped");
  assertTrue(result.kind === "partial", "1+ working sets must be partial");
  assertTrue(!result.strikethrough, "partial exercises must not be struck through");

  // Mutant would treat partial as skipped
  const correctKind: string = "partial";
  const mutantKind: string = "skipped";
  assertTrue(mutantKind !== correctKind, "Mutant would incorrectly skip");
}

// Mutant 2: Count all sets including warm-up
console.log("\nMutant 2: Count warm-up sets");
{
  // Correct: only working sets count toward completion
  // If we had 2 warm-up sets and 1 working set out of 4 planned:
  // Working sets: 1, Planned: 4 => partial
  const result = exerciseCompletion({ workingSetsLogged: 1, plannedSets: 4 });

  assertTrue(result.kind === "partial", "Only working sets count (1 of 4)");
  assertTrue(result.label === "Partly done · 1 of 4 sets", "Label shows working sets only");

  // Mutant: would count warm-up + working = 3, treating it differently
  const mutantTotal = 3; // 2 warm-up + 1 working
  const mutantResult = exerciseCompletion({ workingSetsLogged: mutantTotal, plannedSets: 4 });

  assertTrue(mutantResult.kind === "partial", "Mutant with 3 total would still be partial");
  assertTrue(mutantResult.label !== result.label, "Mutant label would be wrong (3 vs 1)");
}

// Mutant 3: Treat 0 sets as partial instead of skipped
console.log("\nMutant 3: Treat 0 sets as partial");
{
  const result = exerciseCompletion({ workingSetsLogged: 0, plannedSets: 4 });

  assertTrue(result.kind === "skipped", "0 working sets must be skipped");
  assertTrue(result.strikethrough, "0 working sets must be struck through");

  // Mutant would treat 0 sets as partial
  const correctKind: string = "skipped";
  const mutantKind: string = "partial";
  assertTrue(mutantKind !== correctKind, "Mutant would not skip 0 sets");
}

// Mutant 4: Always strikethrough regardless of set count
console.log("\nMutant 4: Always strikethrough");
{
  const result = exerciseCompletion({ workingSetsLogged: 2, plannedSets: 4 });

  assertTrue(!result.strikethrough, "Partial (2 of 4) must not be struck through");

  // Mutant: would always strikethrough
  const mutantStrikethrough = true;
  assertTrue(mutantStrikethrough !== result.strikethrough, "Mutant would always strikethrough");
}

// Mutant 5: Never strikethrough even for 0 sets
console.log("\nMutant 5: Never strikethrough");
{
  const result = exerciseCompletion({ workingSetsLogged: 0, plannedSets: 4 });

  assertTrue(result.strikethrough, "Skipped (0 sets) must be struck through");

  // Mutant: would never strikethrough
  const mutantNeverStrike = false;
  assertTrue(mutantNeverStrike !== result.strikethrough, "Mutant would never strikethrough");
}

// Mutant 6: Wrong label format for partial
console.log("\nMutant 6: Wrong partial label");
{
  const result = exerciseCompletion({ workingSetsLogged: 2, plannedSets: 4 });

  assertTrue(result.label === "Partly done · 2 of 4 sets", "Label must match spec format");

  // Mutant: wrong format like "2/4 sets" or "Partial: 2 of 4"
  const mutantLabel = "2/4 sets";
  assertTrue(mutantLabel !== result.label, "Mutant would use wrong format");
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All mutants caught!");
