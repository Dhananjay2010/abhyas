#!/usr/bin/env npx tsx
/**
 * Mutation testing for M-3 wrist/lower-back contraindications.
 * Tests that bugs are caught by introducing mutants in migration/generator/catalogue.
 * Each mutant must compile, verifiably change file, restore from backup, and be killed.
 * Exits 0 if all killed, 1 if any survive OR skip OR don't compile.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';

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
    file: 'supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql',
    original: "'pike-push-up', 'elevated-pike-push-up'",
    mutated: "'nonexistent-exercise-1', 'nonexistent-exercise-2'",
    description: 'Migration skips pike push-ups',
  },
  {
    name: 'migration-skip-dips-wrist',
    file: 'supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql',
    original: "'dips-triceps-version', 'bench-dips', 'dip-machine'",
    mutated: "'nonexistent-dips-1', 'nonexistent-dips-2', 'nonexistent-dips-3'",
    description: 'Migration skips dips',
  },
  {
    name: 'migration-skip-rows-lower-back',
    file: 'supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql',
    original: "'one-arm-long-bar-row',",
    mutated: "'nonexistent-row',",
    description: 'Migration skips bent-over row',
  },
  {
    name: 'migration-duplicate-guard-broken',
    file: 'supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql',
    original: "AND NOT ('wrist'::body_region = ANY(contraindicated_regions));",
    mutated: ";",
    description: 'Migration breaks duplicate guard (allows re-adding tags)',
  },
  {
    name: 'migration-raise-to-notice',
    file: 'supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql',
    original: "RAISE EXCEPTION 'Migration 20261025000028: Missing exercises: %'",
    mutated: "RAISE NOTICE 'Migration 20261025000028: Missing exercises: %'",
    description: 'Migration downgrades EXCEPTION to NOTICE',
  },
  
  // Generator mutants
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
  
  // Alternatives mutants
  {
    name: 'swap-filter-ignore-wrist',
    file: 'src/lib/program/alternatives.ts',
    original: 'candidate.contraindicated_regions.some((region) =>\n        ctx.injuryRegions.includes(region)\n      )',
    mutated: 'candidate.contraindicated_regions.some((region) =>\n        region !== "wrist" && ctx.injuryRegions.includes(region)\n      )',
    description: 'Swap filter ignores wrist',
  },
  {
    name: 'swap-filter-ignore-lower-back',
    file: 'src/lib/program/alternatives.ts',
    original: 'candidate.contraindicated_regions.some((region) =>\n        ctx.injuryRegions.includes(region)\n      )',
    mutated: 'candidate.contraindicated_regions.some((region) =>\n        region !== "lower_back" && ctx.injuryRegions.includes(region)\n      )',
    description: 'Swap filter ignores lower_back',
  },
];

let killed = 0;
let survived = 0;
let skipped = 0;
const results: Array<{name: string; status: 'KILLED' | 'SURVIVED' | 'SKIPPED'; reason?: string}> = [];

console.log(`\n${"=".repeat(70)}`);
console.log(`Mutation Testing: ${mutants.length} mutants`);
console.log("=".repeat(70));

for (const mutant of mutants) {
  console.log(`\n${mutant.name}: ${mutant.description}`);
  
  const filepath = `${process.cwd()}/${mutant.file}`;
  const backupPath = `${filepath}.mutant-backup`;
  
  if (!existsSync(filepath)) {
    console.log(`  SKIP: File not found`);
    skipped++;
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'file not found'});
    continue;
  }
  
  const original = readFileSync(filepath, 'utf-8');
  
  if (!original.includes(mutant.original)) {
    console.log(`  SKIP: Mutation point not found`);
    skipped++;
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'mutation point not found'});
    continue;
  }
  
  const mutated = original.replace(mutant.original, mutant.mutated);
  
  if (mutated === original) {
    console.log(`  SKIP: No change`);
    skipped++;
    results.push({name: mutant.name, status: 'SKIPPED', reason: 'no change'});
    continue;
  }
  
  // Save backup to disk
  writeFileSync(backupPath, original, 'utf-8');
  
  try {
    writeFileSync(filepath, mutated, 'utf-8');
    console.log(`  Applied mutation`);
    
    // Verify file changed
    const changed = readFileSync(filepath, 'utf-8');
    if (changed === original) {
      console.log(`  SKIP: File didn't change`);
      skipped++;
      results.push({name: mutant.name, status: 'SKIPPED', reason: 'file unchanged after write'});
      writeFileSync(filepath, original, 'utf-8');
      unlinkSync(backupPath);
      continue;
    }
    
    // For TS files, verify compilation
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
      try {
        execSync('npx tsc --noEmit', {cwd: process.cwd(), stdio: 'pipe', timeout: 30000});
        console.log(`  Mutant compiles`);
      } catch {
        console.log(`  SKIP: Does not compile`);
        skipped++;
        results.push({name: mutant.name, status: 'SKIPPED', reason: 'does not compile'});
        writeFileSync(filepath, original, 'utf-8');
        unlinkSync(backupPath);
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
    // Restore from on-disk backup
    const backup = readFileSync(backupPath, 'utf-8');
    writeFileSync(filepath, backup, 'utf-8');
    
    // Byte compare
    const restored = readFileSync(filepath, 'utf-8');
    if (restored !== backup) {
      console.log(`  ERROR: Restore failed byte compare!`);
      process.exit(1);
    }
    
    unlinkSync(backupPath);
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`Results: ${killed} killed, ${survived} survived, ${skipped} skipped`);
console.log("=".repeat(70));
console.log('\n| Mutant | Status |');
console.log('|--------|--------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.status}${r.reason ? ` (${r.reason})` : ''} |`);
}

if (survived > 0 || skipped > 0) {
  console.log(`\n❌ FAIL: ${survived} mutant(s) survived, ${skipped} skipped`);
  process.exit(1);
} else {
  console.log(`\n✓ PASS: All ${killed} mutants killed`);
  process.exit(0);
}
