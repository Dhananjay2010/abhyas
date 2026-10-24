#!/usr/bin/env tsx
/**
 * Run mutant tests for first-session and day-1 guard features
 * 
 * Each mutant is a temporary breaking change. We apply it, run the full test suite,
 * verify that at least one test fails, then revert the mutant.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

type Mutant = {
  name: string;
  description: string;
  file: string;
  original: string;
  mutated: string;
};

const mutants: Mutant[] = [
  {
    name: "First-session offer removed",
    description: "Remove showFirstSessionOffer logic",
    file: "src/lib/today/prompt-blocks.ts",
    original: "const showFirstSessionOffer = !isTraining && !!firstTrainingDay;",
    mutated: "const showFirstSessionOffer = false; // MUTANT: disabled",
  },
  {
    name: "Offers next calendar day instead of plan day 1",
    description: "first-training-day.ts returns wrong day",
    file: "src/lib/today/first-training-day.ts",
    original: ".sort((a, b) => a.day_index - b.day_index);",
    mutated: ".sort((a, b) => b.day_index - a.day_index); // MUTANT: reversed sort",
  },
  {
    name: "Signup guard removed",
    description: "Remove max(signup, block start) guard",
    file: "src/lib/today/missed-day.ts",
    original: "const earliestCountableDate = profileCreatedAtLocal > programStartedOn ? profileCreatedAtLocal : programStartedOn;",
    mutated: "const earliestCountableDate = programStartedOn; // MUTANT: removed signup date from guard",
  },
];

console.log("=== Running mutant tests ===\n");
console.log("Each mutant should be KILLED by at least one test.\n");

const results: Array<{ mutant: string; killed: boolean; firstFailingTest: string | null }> = [];

for (const mutant of mutants) {
  console.log(`\n--- Testing mutant: ${mutant.name} ---`);
  console.log(`Description: ${mutant.description}`);
  
  const filePath = path.join(process.cwd(), mutant.file);
  const originalContent = fs.readFileSync(filePath, "utf-8");
  
  // Check if original code exists
  if (!originalContent.includes(mutant.original)) {
    console.error(`❌ ERROR: Original code not found in ${mutant.file}`);
    console.error(`Looking for: ${mutant.original}`);
    process.exit(1);
  }
  
  // Apply mutant
  const mutatedContent = originalContent.replace(mutant.original, mutant.mutated);
  fs.writeFileSync(filePath, mutatedContent, "utf-8");
  console.log(`Applied mutant to ${mutant.file}`);
  
  // Run tests
  let testResult = { killed: false, firstFailingTest: null as string | null };
  try {
    execSync("npm test 2>&1", { stdio: "pipe", encoding: "utf-8" });
    console.log("⚠️  MUTANT SURVIVED: All tests passed (this is bad!)");
    testResult.killed = false;
  } catch (error: any) {
    const output = error.stdout || error.stderr || "";
    console.log("✓ MUTANT KILLED: At least one test failed (this is good!)");
    
    // Try to find which test failed
    const testMatch = output.match(/test:([a-z-]+)/);
    if (testMatch) {
      testResult.firstFailingTest = `test:${testMatch[1]}`;
      console.log(`First failing test: ${testResult.firstFailingTest}`);
    }
    testResult.killed = true;
  }
  
  // Revert mutant
  fs.writeFileSync(filePath, originalContent, "utf-8");
  console.log(`Reverted ${mutant.file}`);
  
  results.push({
    mutant: mutant.name,
    killed: testResult.killed,
    firstFailingTest: testResult.firstFailingTest,
  });
}

// Summary
console.log("\n\n=== Mutant Test Summary ===\n");
console.log("| Mutant | Status | First Failing Test |");
console.log("|--------|--------|-------------------|");
for (const result of results) {
  const status = result.killed ? "✓ KILLED" : "⚠️  SURVIVED";
  const test = result.firstFailingTest || "N/A";
  console.log(`| ${result.mutant} | ${status} | ${test} |`);
}

const allKilled = results.every((r) => r.killed);
if (allKilled) {
  console.log("\n✅ All mutants killed - test coverage is sufficient!");
  process.exit(0);
} else {
  console.log("\n❌ Some mutants survived - need better test coverage!");
  process.exit(1);
}
