#!/usr/bin/env node
// Verify package.json structure: base keys present, chain prefix correct, non-scripts match
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const current = JSON.parse(readFileSync('package.json', 'utf8'));
const baseJson = execSync('git show origin/cursor/gym-tenant-data-model-73d4:package.json', { encoding: 'utf8' });
const base = JSON.parse(baseJson);

let failures = 0;

console.log('=== Package.json Verification ===\n');

// Check 1: All base script keys present with identical values (except 'test' which is checked separately)
console.log('Check 1: Base script keys (excluding test chain)');
const baseScripts = Object.keys(base.scripts).filter(k => k !== 'test');
const currentScripts = current.scripts;
let missingKeys = 0, differentValues = 0;

for (const key of baseScripts) {
  if (!(key in currentScripts)) {
    console.log(`  MISSING: ${key}`);
    missingKeys++;
  } else if (currentScripts[key] !== base.scripts[key]) {
    console.log(`  DIFF: ${key}`);
    console.log(`    base:    ${base.scripts[key].slice(0, 80)}...`);
    console.log(`    current: ${currentScripts[key].slice(0, 80)}...`);
    differentValues++;
  }
}

if (missingKeys === 0 && differentValues === 0) {
  console.log(`  ✓ All ${baseScripts.length} base script keys (excluding test) present with identical values`);
} else {
  console.log(`  ✗ Missing: ${missingKeys}, Different: ${differentValues}`);
  failures++;
}
console.log();

// Check 2: PR-specific keys defined
console.log('Check 2: PR-specific keys defined');
const prKeys = ['test:gym-domains-real-db', 'test:gym-brand-unit', 'test:gym-brand-error-cache', 'ci:mutant-gym-domains', 'test:gym-domains-3-cases'];
for (const key of prKeys) {
  if (key in currentScripts) {
    console.log(`  ✓ ${key}: ${currentScripts[key]}`);
  } else {
    console.log(`  ✗ MISSING: ${key}`);
    failures++;
  }
}
console.log();

// Check 3: Test chain prefix
console.log('Check 3: Test chain prefix');
const baseChain = base.scripts.test.split(' && ');
const currentChain = current.scripts.test.split(' && ');

console.log(`  Base chain length: ${baseChain.length}`);
console.log(`  Current chain length: ${currentChain.length}`);

let prefixMatch = true;
for (let i = 0; i < baseChain.length; i++) {
  if (baseChain[i] !== currentChain[i]) {
    console.log(`  ✗ Mismatch at index ${i}:`);
    console.log(`    base:    ${baseChain[i]}`);
    console.log(`    current: ${currentChain[i]}`);
    prefixMatch = false;
    break;
  }
}

if (prefixMatch) {
  console.log(`  ✓ Base chain (${baseChain.length} entries) is an exact prefix`);
} else {
  failures++;
}

// Show appended entries
if (currentChain.length > baseChain.length) {
  console.log(`  Appended entries (${currentChain.length - baseChain.length}):`);
  for (let i = baseChain.length; i < currentChain.length; i++) {
    console.log(`    [${i}] ${currentChain[i]}`);
  }
}
console.log();

// Check 4: Non-scripts fields match
console.log('Check 4: Non-scripts fields');
const nonScriptFields = ['name', 'version', 'private', 'dependencies', 'devDependencies', 'engines'];
let fieldMismatches = 0;

for (const field of nonScriptFields) {
  if (JSON.stringify(base[field]) !== JSON.stringify(current[field])) {
    console.log(`  ✗ ${field} differs`);
    fieldMismatches++;
  }
}

if (fieldMismatches === 0) {
  console.log(`  ✓ All non-scripts fields match base`);
} else {
  failures++;
}
console.log();

// Check 5: package-lock.json
console.log('Check 5: package-lock.json');
try {
  const baseLock = execSync('git show origin/cursor/gym-tenant-data-model-73d4:package-lock.json', { encoding: 'utf8' });
  const currentLock = readFileSync('package-lock.json', 'utf8');
  if (baseLock === currentLock) {
    console.log('  ✓ package-lock.json matches base');
  } else {
    console.log('  ✗ package-lock.json differs from base');
    failures++;
  }
} catch (e) {
  console.log('  ⚠ Could not compare package-lock.json:', e.message);
}
console.log();

// Summary
console.log('=== Summary ===');
if (failures === 0) {
  console.log('✅ All checks passed');
  process.exit(0);
} else {
  console.log(`❌ ${failures} check(s) failed`);
  process.exit(1);
}
