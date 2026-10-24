#!/usr/bin/env tsx
/**
 * M3: Mutant testing script for wrist/lower_back contraindication fix
 * 
 * Applies real mutants to the code and runs tests to verify they're caught.
 * Mutants represent common bugs that could have been introduced or missed.
 * 
 * Exit code 1 if any mutant survives (tests don't catch it).
 * Exit code 0 if all mutants are killed (tests catch all bugs).
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const MUTANTS = [
  {
    name: "Drop wrist tag from pike-push-up",
    file: "supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql",
    search: "WHERE slug IN ('pike-push-up', 'elevated-pike-push-up')",
    replace: "WHERE slug IN ('elevated-pike-push-up')",
    description: "Pike push-up missing wrist tag should cause wrist-injured user to get it in plans"
  },
  {
    name: "Swaps skip shared contraindication check",
    file: "src/lib/program/alternatives.ts",
    search: "const allContraindications = getContraindications(candidate);",
    replace: "const allContraindications = candidate.contraindicated_regions; // BUG: skip derived",
    description: "Swaps only checking explicit tags should allow pike push-ups for wrist injuries"
  },
  {
    name: "Dips untagged for wrist",
    file: "supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql",
    search: "WHERE slug IN ('dips-triceps-version', 'bench-dips')",
    replace: "WHERE slug IN ('bench-dips')",
    description: "Triceps dips missing wrist tag should appear in wrist-injured user plans"
  },
  {
    name: "Lower_back tag removed from good morning",
    file: "supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql",
    search: "WHERE slug = 'jefferson-squats'",
    replace: "WHERE slug = 'never-matches'",
    description: "Jefferson squats without lower_back tag should appear for lower_back injuries"
  },
  {
    name: "Filter inverted in generation",
    file: "src/lib/program/generate.ts",
    search: "if (allContraindications.some((r) => input.currentInjuryRegions.includes(r))) {",
    replace: "if (!allContraindications.some((r) => input.currentInjuryRegions.includes(r))) { // BUG: inverted",
    description: "Inverted filter should ONLY select contraindicated exercises"
  },
];

interface MutantResult {
  name: string;
  survived: boolean;
  error?: string;
}

function applyMutant(mutant: typeof MUTANTS[0]): boolean {
  const filePath = path.join(process.cwd(), mutant.file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ File not found: ${mutant.file}`);
    return false;
  }

  const original = fs.readFileSync(filePath, "utf-8");
  const mutated = original.replace(mutant.search, mutant.replace);

  if (mutated === original) {
    console.error(`  ✗ Mutation pattern not found in ${mutant.file}`);
    console.error(`    Searched for: ${mutant.search}`);
    return false;
  }

  fs.writeFileSync(filePath, mutated);
  return true;
}

function revertMutant(mutant: typeof MUTANTS[0]): void {
  const filePath = path.join(process.cwd(), mutant.file);
  const mutated = fs.readFileSync(filePath, "utf-8");
  const reverted = mutated.replace(mutant.replace, mutant.search);
  fs.writeFileSync(filePath, reverted);
}

function runTests(): boolean {
  try {
    execSync("npm test -- test-m3-wrist-lowerback-contraindications.ts", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return true;
  } catch (error) {
    return false;
  }
}

function main(): void {
  console.log("M3 Mutant Testing\n");
  console.log("Running baseline tests (no mutations)...");
  
  const baselinePassed = runTests();
  if (!baselinePassed) {
    console.error("✗ Baseline tests FAILED. Fix tests before running mutant testing.");
    process.exit(1);
  }
  console.log("✓ Baseline tests passed\n");

  const results: MutantResult[] = [];
  let survivorCount = 0;

  for (const mutant of MUTANTS) {
    console.log(`Mutant: ${mutant.name}`);
    console.log(`  ${mutant.description}`);
    
    const applied = applyMutant(mutant);
    if (!applied) {
      results.push({ name: mutant.name, survived: true, error: "Failed to apply" });
      survivorCount++;
      continue;
    }

    console.log("  Applied mutation, running tests...");
    const testsPassed = runTests();

    revertMutant(mutant);

    if (testsPassed) {
      console.log(`  ✗ SURVIVED - Tests still passed! This is a bug in the tests.`);
      results.push({ name: mutant.name, survived: true });
      survivorCount++;
    } else {
      console.log(`  ✓ KILLED - Tests caught this mutant`);
      results.push({ name: mutant.name, survived: false });
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log("Mutant Testing Summary");
  console.log("=".repeat(60));
  console.log(`Total mutants: ${MUTANTS.length}`);
  console.log(`Killed: ${MUTANTS.length - survivorCount}`);
  console.log(`Survived: ${survivorCount}`);
  console.log();

  if (survivorCount > 0) {
    console.log("Surviving mutants:");
    results
      .filter(r => r.survived)
      .forEach(r => {
        console.log(`  - ${r.name}${r.error ? ` (${r.error})` : ""}`);
      });
    console.log();
    console.log("✗ FAILURE: Some mutants survived. Tests are insufficient.");
    process.exit(1);
  }

  console.log("✓ SUCCESS: All mutants killed. Tests are comprehensive.");
  process.exit(0);
}

main();
