#!/usr/bin/env npx tsx
/**
 * Mutation testing for M-3 wrist/lower-back contraindications.
 * Tests that bugs are caught by introducing mutants in migration/generator/catalogue.
 * Each mutant must compile, verifiably change file, restore from backup, and be killed.
 * Exits 0 if all killed, 1 if any survive OR skip OR don't compile.
 */

import { execSync, spawn, type ChildProcess } from 'child_process';
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
  {
    name: 'migration-duplicate-guard-broken',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "AND NOT ('wrist'::body_region = ANY(contraindicated_regions));",
    mutated: ";",
    description: 'Migration breaks duplicate guard (allows re-adding tags)',
  },
  {
    name: 'migration-raise-to-notice',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "RAISE EXCEPTION 'Migration 20261025000026: Missing exercises: %'",
    mutated: "RAISE NOTICE 'Migration 20261025000026: Missing exercises: %'",
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
  
  {
    name: 'no-injury-drop-staples',
    file: 'src/lib/program/generate.ts',
    original: 'export function isEligible(ex: CandidateExercise, input: GeneratorInput): boolean {\n',
    mutated: 'export function isEligible(ex: CandidateExercise, input: GeneratorInput): boolean {\n  if (input.currentInjuryRegions.length === 0 && ["pushups", "goblet-squat", "barbell-squat"].includes(ex.slug)) return false;\n',
    description: 'No-injury users lose pushups/goblet-squat/barbell-squat (baseline must catch)',
  },
  {
    name: 'empty-swaps-grow-lower-back',
    file: 'src/lib/program/generate.ts',
    original: 'if (ex.spinal_load === "high") {\n    derived.push("lower_back");',
    mutated: 'if (ex.spinal_load === "high" || ex.spinal_load === "low") {\n    derived.push("lower_back");',
    description: 'Low spinal load also excluded for lower_back (empty-swap pin must catch)',
  },
  {
    name: 'swap-path-isEligible-ignores-lower_back',
    file: 'src/lib/program/generate.ts',
    original: 'if (allContraindications.some((r) => input.currentInjuryRegions.includes(r))) {',
    mutated: 'if (allContraindications.some((r) => input.currentInjuryRegions.includes(r) && !(r === "lower_back" && input.catalogue.length === 0))) {',
    description: 'Swap path drops lower_back filter (the swap path calls isEligible with catalogue: [], so catalogue.length === 0 is always true there)',
  },
  {
    name: 'migration-drop-thruster-update-only',
    file: 'supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql',
    original: "'two-arm-kettlebell-jerk', 'kettlebell-thruster',",
    mutated: "'two-arm-kettlebell-jerk',",
    description: 'Migration drops kettlebell-thruster from UPDATE list',
  },
];

// Check for stale backups
const staleBackups: string[] = [];
for (const dir of ['supabase/migrations', 'src/lib/program']) {
  try {
    const files = execSync(`find ${dir} -name "*.mutant-backup" 2>/dev/null || true`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    staleBackups.push(...files);
  } catch {
    // Directory may not exist
  }
}
if (staleBackups.length > 0) {
  console.error(`FAIL: Found stale backup(s): ${staleBackups.join(', ')}`);
  process.exit(1);
}

// Async child runner: keeps the event loop free so the signal trap below can actually fire
// (with spawnSync/execSync the loop is blocked and tsx SIGKILLs this process ~30ms after relaying a signal).
let current: ChildProcess | null = null;
function run(cmd: string, args: string[]): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    current = child;
    let stdout = '';
    child.stdout?.on('data', (d) => { stdout += String(d); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.on('close', (status) => { clearTimeout(timer); current = null; resolve({ status, stdout }); });
  });
}

// Active mutation tracking and cleanup trap
let active: { filepath: string; backupPath: string } | null = null;
function restoreActive() {
  if (active && existsSync(active.backupPath)) {
    writeFileSync(active.filepath, readFileSync(active.backupPath, 'utf-8'));
    unlinkSync(active.backupPath);
  }
  active = null;
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    current?.kill('SIGKILL');
    restoreActive();
    process.exit(1);
  });
}
process.on('exit', restoreActive);

async function main() {
// Run unmutated test first
console.log('Running unmutated test:m3-wrist...');
const base = await run('npm', ['run', 'test:m3-wrist']);
if (base.status !== 0) {
  console.log('FAIL: unmutated test:m3-wrist fails; aborting');
  process.exit(1);
}
console.log('✓ Baseline test passes\n');

let killed = 0;
let survived = 0;
let skipped = 0;
let errors = 0;
const results: Array<{name: string; status: 'KILLED' | 'SURVIVED' | 'SKIPPED' | 'ERROR'; reason?: string}> = [];

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
  active = { filepath, backupPath };
  
  try {
    writeFileSync(filepath, mutated, 'utf-8');
    console.log(`  Applied mutation`);
    
    // Verify file changed
    const changed = readFileSync(filepath, 'utf-8');
    if (changed === original) {
      console.log(`  SKIP: File didn't change`);
      skipped++;
      results.push({name: mutant.name, status: 'SKIPPED', reason: 'file unchanged after write'});
      continue; // finally restores from the on-disk backup
    }
    
    // For TS files, verify compilation
    if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
      const tsc = await run('npx', ['tsc', '--noEmit']);
      if (tsc.status === 0) {
        console.log(`  Mutant compiles`);
      } else {
        console.log(`  SKIP: Does not compile`);
        skipped++;
        results.push({name: mutant.name, status: 'SKIPPED', reason: 'does not compile'});
        continue; // finally restores from the on-disk backup
      }
    }
    
    // Run test
    const testResult = await run('npm', ['run', 'test:m3-wrist']);
    
    const hasFail = testResult.stdout.includes('  FAIL ');
    const exitNonZero = testResult.status !== 0;
    
    if (exitNonZero && hasFail) {
      console.log(`  ✓ KILLED: Test caught mutant`);
      killed++;
      results.push({name: mutant.name, status: 'KILLED'});
    } else if (!exitNonZero) {
      console.log(`  ❌ SURVIVED: Test passed with mutant`);
      survived++;
      results.push({name: mutant.name, status: 'SURVIVED'});
    } else {
      console.log(`  ERROR: Test exited non-zero but no FAIL marker`);
      errors++;
      results.push({name: mutant.name, status: 'ERROR', reason: 'no fail marker'});
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
    active = null;
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`Results: ${killed} killed, ${survived} survived, ${skipped} skipped, ${errors} errors`);
console.log("=".repeat(70));
console.log('\n| Mutant | Status |');
console.log('|--------|--------|');
for (const r of results) {
  console.log(`| ${r.name} | ${r.status}${r.reason ? ` (${r.reason})` : ''} |`);
}

if (survived > 0 || skipped > 0 || errors > 0) {
  console.log(`\n❌ FAIL: ${survived} mutant(s) survived, ${skipped} skipped, ${errors} errors`);
  process.exit(1);
} else {
  console.log(`\n✓ PASS: All ${killed} mutants killed`);
  process.exit(0);
}
}

main().catch((e: unknown) => {
  console.error(e);
  restoreActive();
  process.exit(1);
});
