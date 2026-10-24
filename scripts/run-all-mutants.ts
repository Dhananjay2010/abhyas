#!/usr/bin/env tsx
/**
 * Run all mutants against the full test suite and report which test kills each mutant.
 * 
 * A mutant is a temporary breaking change to production code.
 * We apply it, run npm test, record the first failing test, then revert.
 * 
 * This script does NOT commit mutants and does NOT leave mutant markers in code.
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
  // Original 9 mutants from previous brief
  {
    name: "m0-label-hardcoded",
    description: "Label returns hardcoded string instead of actual label",
    file: "src/lib/program/day-plan.ts",
    original: "const label = d.label ?? \"Training\";",
    mutated: "const label = \"Hardcoded\"; // MUTANT",
  },
  {
    name: "m0-warmup-null",
    description: "WarmupSection returns null instead of JSX",
    file: "src/components/today/warmup-section.tsx",
    original: "return (",
    mutated: "return null; const unused = (",
  },
  {
    name: "m0-week-label-rest",
    description: "Week row label always returns Rest",
    file: "src/lib/today/week-display.ts",
    original: "label: day.label ?? \"Rest\",",
    mutated: "label: \"Rest\", // MUTANT",
  },
  {
    name: "m0-choice-ignored",
    description: "Week row ignores choice override",
    file: "src/lib/today/week-display.ts",
    original: "const chosen = chosenByDayIndex.get(day.day_index);",
    mutated: "const chosen = undefined; // MUTANT",
  },
  {
    name: "m0-both-prompt-duplicate",
    description: "Both state shows separate missed prompt (duplication)",
    file: "src/lib/today/prompt-blocks.ts",
    original: "showMissedPrompt: false,",
    mutated: "showMissedPrompt: true, // MUTANT",
  },
  {
    name: "m0-rest-plan-hidden",
    description: "Rest plan content hidden on 'both' state",
    file: "src/lib/today/prompt-blocks.ts",
    original: "showRestPlan: true,",
    mutated: "showRestPlan: false, // MUTANT",
  },
  {
    name: "m0-train-anyway-no-yesterday",
    description: "Train-anyway doesn't offer yesterday's missed workout",
    file: "src/lib/today/train-anyway.ts",
    original: "if (missedYesterday && todayDay && isTrainingDay(todayDay.day_type)) {",
    mutated: "if (false && missedYesterday && todayDay && isTrainingDay(todayDay.day_type)) { // MUTANT",
  },
  {
    name: "m0-train-anyway-duplicates",
    description: "Train-anyway allows duplicate day_index",
    file: "src/lib/today/train-anyway.ts",
    original: "if (!seenIndices.has(day.day_index)) {",
    mutated: "if (true) { // MUTANT - always add",
  },
  {
    name: "m0-never-started-guard",
    description: "Day-one guard removed (shows missed on first day)",
    file: "src/lib/today/missed-day.ts",
    original: "if (!hasStartedAny) {",
    mutated: "if (false) { // MUTANT - disable guard",
  },
  
  // New mutants for first-session and day-1 guard features
  {
    name: "m1-first-session-offer-removed",
    description: "First-session offer disabled",
    file: "src/lib/today/prompt-blocks.ts",
    original: "const showFirstSessionOffer = !isTraining && !!firstTrainingDay;",
    mutated: "const showFirstSessionOffer = false; // MUTANT",
  },
  {
    name: "m2-next-calendar-day",
    description: "Returns last training day instead of plan day 1",
    file: "src/lib/today/first-training-day.ts",
    original: ".sort((a, b) => a.day_index - b.day_index);",
    mutated: ".sort((a, b) => b.day_index - a.day_index); // MUTANT",
  },
  {
    name: "m3-signup-guard-removed",
    description: "Signup date ignored in earliestCountableDate",
    file: "src/lib/today/missed-day.ts",
    original: "return createdAtLocal > programStartedOn ? createdAtLocal : programStartedOn;",
    mutated: "return programStartedOn; // MUTANT",
  },
];

console.log("=== Running All Mutants Against Full Test Suite ===\n");
console.log(`Total mutants: ${mutants.length}\n`);

const results: Array<{ 
  name: string; 
  description: string;
  killed: boolean; 
  firstFailingTest: string | null;
}> = [];

for (const mutant of mutants) {
  console.log(`\n--- ${mutant.name}: ${mutant.description} ---`);
  
  const filePath = path.join(process.cwd(), mutant.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: File not found: ${mutant.file}`);
    results.push({
      name: mutant.name,
      description: mutant.description,
      killed: false,
      firstFailingTest: "FILE_NOT_FOUND",
    });
    continue;
  }
  
  const originalContent = fs.readFileSync(filePath, "utf-8");
  
  if (!originalContent.includes(mutant.original)) {
    console.error(`❌ ERROR: Original code not found in ${mutant.file}`);
    console.error(`Looking for: ${mutant.original.substring(0, 80)}...`);
    results.push({
      name: mutant.name,
      description: mutant.description,
      killed: false,
      firstFailingTest: "CODE_NOT_FOUND",
    });
    continue;
  }
  
  // Apply mutant
  const mutatedContent = originalContent.replace(mutant.original, mutant.mutated);
  fs.writeFileSync(filePath, mutatedContent, "utf-8");
  console.log(`Applied mutant to ${mutant.file}`);
  
  // Run full test suite
  let testResult = { killed: false, firstFailingTest: null as string | null };
  try {
    execSync("npm test 2>&1", { stdio: "pipe", encoding: "utf-8" });
    console.log("⚠️  MUTANT SURVIVED: All tests passed (needs coverage!)");
    testResult.killed = false;
  } catch (error: any) {
    const output = error.stdout || error.stderr || "";
    console.log("✓ MUTANT KILLED: Test suite failed");
    
    // Extract first failing test name
    const testMatch = output.match(/> abhyas@[^\n]+\n> (test:[a-z0-9-]+)/);
    if (testMatch) {
      testResult.firstFailingTest = testMatch[1];
      console.log(`First failing test: ${testResult.firstFailingTest}`);
    } else {
      testResult.firstFailingTest = "UNKNOWN_TEST";
    }
    testResult.killed = true;
  }
  
  // Revert mutant
  fs.writeFileSync(filePath, originalContent, "utf-8");
  console.log(`Reverted ${mutant.file}`);
  
  results.push({
    name: mutant.name,
    description: mutant.description,
    killed: testResult.killed,
    firstFailingTest: testResult.firstFailingTest,
  });
}

// Generate summary table
console.log("\n\n=== MUTANT TEST RESULTS ===\n");
console.log("| Mutant | Description | Status | First Failing Test |");
console.log("|--------|-------------|--------|-------------------|");
for (const result of results) {
  const status = result.killed ? "✓ KILLED" : "⚠️ SURVIVED";
  const test = result.firstFailingTest || "N/A";
  console.log(`| ${result.name} | ${result.description} | ${status} | ${test} |`);
}

const allKilled = results.every((r) => r.killed);
const survivorCount = results.filter((r) => !r.killed).length;

console.log(`\nSummary: ${results.filter(r => r.killed).length}/${results.length} mutants killed`);
if (survivorCount > 0) {
  console.log(`⚠️  ${survivorCount} mutant(s) survived - need better test coverage!`);
  process.exit(1);
} else {
  console.log("✅ All mutants killed - test coverage is sufficient!");
  process.exit(allKilled ? 0 : 1);
}
