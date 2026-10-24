import { readFileSync } from 'fs';
import { join } from 'path';

console.log('Testing Node version requirements...');

// Simple semver parser and validator
type SemverVersion = { major: number; minor: number; patch: number };

function parseSemverVersion(version: string): SemverVersion {
  const cleaned = version.replace(/^v/, '');
  const parts = cleaned.split('.').map(p => parseInt(p, 10));

  if (parts.length === 1 && !isNaN(parts[0])) {
    // Handle major-only versions like "23" -> "23.0.0"
    return { major: parts[0], minor: 0, patch: 0 };
  }

  if (parts.length === 2 && !parts.some(isNaN)) {
    // Handle major.minor versions like "22.13" -> "22.13.0"
    return { major: parts[0], minor: parts[1], patch: 0 };
  }

  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function compareSemver(a: SemverVersion, b: SemverVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function satisfiesRange(version: SemverVersion, rangeStr: string): boolean {
  // Parse range like ">=22.13.0 <23"
  const rangeStr_trimmed = rangeStr.trim();

  // Split by whitespace to handle multiple constraints
  const constraints = rangeStr_trimmed.split(/\s+/);

  for (const constraint of constraints) {
    if (constraint.startsWith('>=')) {
      const minVersion = parseSemverVersion(constraint.slice(2));
      if (compareSemver(version, minVersion) < 0) {
        return false;
      }
    } else if (constraint.startsWith('>')) {
      const minVersion = parseSemverVersion(constraint.slice(1));
      if (compareSemver(version, minVersion) <= 0) {
        return false;
      }
    } else if (constraint.startsWith('<=')) {
      const maxVersion = parseSemverVersion(constraint.slice(2));
      if (compareSemver(version, maxVersion) > 0) {
        return false;
      }
    } else if (constraint.startsWith('<')) {
      const maxVersion = parseSemverVersion(constraint.slice(1));
      if (compareSemver(version, maxVersion) >= 0) {
        return false;
      }
    } else if (constraint.startsWith('=')) {
      const exactVersion = parseSemverVersion(constraint.slice(1));
      if (compareSemver(version, exactVersion) !== 0) {
        return false;
      }
    } else if (constraint.includes('.')) {
      // Assume exact version match if it contains a dot
      const exactVersion = parseSemverVersion(constraint);
      if (compareSemver(version, exactVersion) !== 0) {
        return false;
      }
    }
  }

  return true;
}

function validateEnginesRange(rangeStr: string): { hasMinimum: boolean; excludes23: boolean; meetsMinimum: boolean } {
  const rangeStr_trimmed = rangeStr.trim();
  const constraints = rangeStr_trimmed.split(/\s+/);

  let hasMinimum = false;
  let meetsMinimum = false;
  let excludes23 = false;

  const requiredMin = parseSemverVersion('22.13.0');
  const version23 = parseSemverVersion('23.0.0');

  for (const constraint of constraints) {
    if (constraint.startsWith('>=')) {
      hasMinimum = true;
      const minVersion = parseSemverVersion(constraint.slice(2));
      if (compareSemver(minVersion, requiredMin) >= 0) {
        meetsMinimum = true;
      }
    }

    if (constraint.startsWith('<')) {
      const maxVersion = parseSemverVersion(constraint.slice(1));
      if (compareSemver(version23, maxVersion) >= 0) {
        excludes23 = true;
      }
    }
  }

  return { hasMinimum, excludes23, meetsMinimum };
}

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
const nvmrc = readFileSync(join(process.cwd(), '.nvmrc'), 'utf-8').trim();
const enginesNode = pkg.engines?.node;

if (!enginesNode) {
  console.error('✗ package.json missing engines.node field');
  process.exit(1);
}

console.log(`  .nvmrc: ${nvmrc}`);
console.log(`  engines.node: ${enginesNode}`);
console.log(`  current Node: ${process.version}`);

// Parse versions
let nvmrcVersion: SemverVersion;
let currentVersion: SemverVersion;

try {
  nvmrcVersion = parseSemverVersion(nvmrc);
  currentVersion = parseSemverVersion(process.version);
} catch (e) {
  console.error(`✗ Failed to parse version: ${(e as Error).message}`);
  process.exit(1);
}

// Required range for running Node and .nvmrc
const requiredRange = '>=22.13.0 <23';

// Validate .nvmrc satisfies the required range
if (!satisfiesRange(nvmrcVersion, requiredRange)) {
  console.error(`✗ .nvmrc version ${nvmrc} does not satisfy required range: ${requiredRange}`);
  process.exit(1);
}

// Validate current Node satisfies the required range
if (!satisfiesRange(currentVersion, requiredRange)) {
  console.error(`✗ Current Node version ${process.version} does not satisfy required range: ${requiredRange}`);
  process.exit(1);
}

// Validate engines.node range
const engineValidation = validateEnginesRange(enginesNode);

if (!engineValidation.hasMinimum || !engineValidation.meetsMinimum) {
  console.error(`✗ engines.node must require >=22.13.0, got: ${enginesNode}`);
  process.exit(1);
}

if (!engineValidation.excludes23) {
  console.error(`✗ engines.node must restrict to <23, got: ${enginesNode}`);
  process.exit(1);
}

console.log('✓ Node version requirements validated');
console.log('  - .nvmrc satisfies >=22.13.0 <23');
console.log('  - Current Node satisfies >=22.13.0 <23');
console.log('  - engines.node requires >=22.13.0 and excludes 23.x');

// Negative test cases (these should fail on old logic)
console.log('\nRunning negative test cases...');

const negativeCases = [
  { version: '22.12.0', shouldFail: true, reason: 'below minimum 22.13.0' },
  { version: '21.9.0', shouldFail: true, reason: 'major version 21' },
  { version: '23.0.0', shouldFail: true, reason: 'major version 23' },
];

for (const testCase of negativeCases) {
  const testVersion = parseSemverVersion(testCase.version);
  const passes = satisfiesRange(testVersion, requiredRange);

  if (testCase.shouldFail && passes) {
    console.error(`✗ Test case failed: ${testCase.version} should NOT satisfy range but did`);
    process.exit(1);
  } else if (!testCase.shouldFail && !passes) {
    console.error(`✗ Test case failed: ${testCase.version} should satisfy range but didn't`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${testCase.version} correctly ${testCase.shouldFail ? 'rejected' : 'accepted'} (${testCase.reason})`);
  }
}

// Test that old substring logic would have failed
const badEnginesRanges = [
  { range: '>=22', shouldPass: false, reason: 'no upper bound' },
  { range: '>=22.0.0', shouldPass: false, reason: 'minimum too low and no upper bound' },
  { range: '>=22.13.0 <24', shouldPass: false, reason: 'allows 23.x' },
];

console.log('\nTesting engines.node range validation...');
for (const testCase of badEnginesRanges) {
  const validation = validateEnginesRange(testCase.range);
  const passes = validation.hasMinimum && validation.meetsMinimum && validation.excludes23;

  if (testCase.shouldPass && !passes) {
    console.error(`✗ Range test failed: "${testCase.range}" should be valid but was rejected`);
    process.exit(1);
  } else if (!testCase.shouldPass && passes) {
    console.error(`✗ Range test failed: "${testCase.range}" should be invalid but was accepted`);
    process.exit(1);
  } else {
    console.log(`  ✓ "${testCase.range}" correctly ${testCase.shouldPass ? 'accepted' : 'rejected'} (${testCase.reason})`);
  }
}

console.log('\n✓ All validation tests passed');
