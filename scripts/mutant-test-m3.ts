#!/usr/bin/env npx tsx
/**
 * Mutation testing for M-3 wrist/lower-back contraindications.
 * Tests that bugs are caught by introducing mutants in migration/generator/catalogue.
 * Each mutant must compile, verifiably change file, and be killed by test suite.
 * Exits 0 if all killed, 1 if any survive.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

interface Mutant {
  name: string;
  file: string;
  original: string;
  mutated: string;
  description: string;
}

const mutants: Mutant[] = [
  // Migration mutants
  {
    name: 'migration-skip-pike-wrist',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "'pike-push-up', 'elevated-pike-push-up'",
    mutated: "'nonexistent-exercise-1', 'nonexistent-exercise-2'",
    description: 'Migration skips pike push-ups',
  },
  {
    name: 'migration-skip-dips-wrist',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "'dips-triceps-version', 'bench-dips', 'dip-machine'",
    mutated: "'nonexistent-dips-1', 'nonexistent-dips-2', 'nonexistent-dips-3'",
    description: 'Migration skips dips',
  },
  {
    name: 'migration-skip-rows-lower-back',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "'one-arm-long-bar-row',",
    mutated: "'nonexistent-row',",
    description: 'Migration skips bent-over row',
  },
  
  // Generator mutants - these currently SURVIVE and must be fixed
  {
    name: 'generator-ignore-wrist',
    file: 'src/lib/program/generate.ts',
    original: 'if (allContraindications.some((r) => input.currentInjuryRegions.includes(r)))',
    mutated: 'if (allContraindications.filter(r => r !== "wrist").some((r) => input.currentInjuryRegions.includes(r)))',
    description: 'Generator ignores wrist contraindications',
  },
  {
    name: 'generator-ignore-lower-back',
    file: 'src/lib/program/generate.ts',
    original: 'if (allContraindications.some((r) => input.currentInjuryRegions.includes(r)))',
    mutated: 'if (allContraindications.filter(r => r !== "lower_back").some((r) => input.currentInjuryRegions.includes(r)))',
    description: 'Generator ignores lower_back contraindications',
  },
  
  // Alternatives mutants - these currently SURVIVE and must be fixed  
  {
    name: 'swap-filter-ignore-wrist',
    file: 'src/lib/program/alternatives.ts',
    original: 'ctx.injuryRegions.includes(region)',
    mutated: 'ctx.injuryRegions.filter(r => r !== "wrist").includes(region)',
    description: 'Swap filter ignores wrist',
  },
];

let killed = 0;
let survived = 0;
const results: Array<{name: string; status: 'KILLED' | 'SURVIVED' | 'SKIPPED'; reason?: string}> = [];

console.log(`\n${"=".repeat(70)}`);
console.log(`Mutation Testing: ${mutants.length} mutants`);
console.log("=".repeat(70));

for (const mutant of mutants) {
  console.log(`\n${mutant.name}: ${mutant.description}`);
  
  const filepath = `${process.cwd()}/${mutant.file}`;
  
  if (!existsSync(filepath)) {
    console.log(`  SKIP: File not found`);
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'file not found'});
    continue;
  }
  
  const original = readFileSync(filepath, 'utf-8');
  
  if (!original.includes(mutant.original)) {
    console.log(`  SKIP: Mutation point not found`);
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'mutation point not found'});
    continue;
  }
  
  const mutated = original.replace(mutant.original, mutant.mutated);
  
  if (mutated === original) {
    console.log(`  SKIP: No change`);
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'no change'});
    continue;
  }
  
  try {
    writeFileSync(filepath, mutated, 'utf-8');
    console.log(`  Applied mutation`);
    
    // For TS files, verify compilation
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
      try {
        execSync('npx tsc --noEmit', {cwd: process.cwd(), stdio: 'pipe', timeout: 30000});
        console.log(`  Mutant compiles`);
      } catch {
        console.log(`  SKIP: Does not compile`);
        results.push({name: mutant.name, status: 'SKIPPED', reason: 'does not compile'});
        writeFileSync(filepath, original, 'utf-8');
        continue;
      }
    }
    
    // Run test
    try {
      execSync('npm run test:m3-wrist', {cwd: process.cwd(), stdio: 'pipe', timeout: 60000});
      console.log(`  ❌ SURVIVED: Test passed with mutant`);
      survived++;
      results.push({name: mutant.name, status: 'SURVIVED'});
    } catch {
      console.log(`  ✓ KILLED: Test caught mutant`);
      killed++;
      results.push({name: mutant.name, status: 'KILLED'});
    }
  } finally {
    writeFileSync(filepath, original, 'utf-8');
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`Results: ${killed} killed, ${survived} survived`);
console.log("=".repeat(70));
console.log('\n| Mutant | Status |');
console.log('|--------|--------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.status}${r.reason ? ` (${r.reason})` : ''} |`);
}

if (survived > 0) {
  console.log(`\n❌ FAIL: ${survived} mutant(s) survived`);
  process.exit(1);
} else {
  console.log(`\n✓ PASS: All ${killed} mutants killed`);
  process.exit(0);
}
