#!/usr/bin/env node
/**
 * Runs a shard of the test suite by parsing package.json scripts.test
 * Usage: node scripts/run-test-shard.js <shardIndex> <totalShards>
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { calculateShardBoundaries, validateTestEntries } = require('./shard-boundaries');

const shardIndex = parseInt(process.argv[2], 10);
const totalShards = parseInt(process.argv[3], 10);

if (!shardIndex || !totalShards || shardIndex < 1 || shardIndex > totalShards) {
  console.error('Usage: node scripts/run-test-shard.js <shardIndex> <totalShards>');
  console.error('Example: node scripts/run-test-shard.js 1 3');
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const testScript = packageJson.scripts.test;
if (!testScript) {
  console.error('No test script found in package.json');
  process.exit(1);
}

// Parse the test chain
const testEntries = testScript
  .split(' && ')
  .map(s => s.trim().replace(/^npm run /, ''));

console.log(`Total test entries: ${testEntries.length}`);

// Validate test entries
try {
  validateTestEntries(testEntries);
} catch (error) {
  console.error(`❌ Validation failed: ${error.message}`);
  process.exit(1);
}

// Calculate time-balanced shard boundaries
const { shardAssignments } = calculateShardBoundaries(testEntries, totalShards);
const shard = shardAssignments[shardIndex - 1];

if (!shard || shard.tests.length === 0) {
  console.error(`❌ Shard ${shardIndex} is empty!`);
  process.exit(1);
}

console.log(`Running shard ${shardIndex}/${totalShards}`);
console.log(`Tests ${shard.start} to ${shard.end} (${shard.tests.length} tests)`);
console.log(`Estimated time: ${shard.estimatedTime.toFixed(2)}s (${(shard.estimatedTime / 60).toFixed(2)}m)`);
console.log('---');

// Run each test in the shard
let failed = false;
for (let i = 0; i < shard.tests.length; i++) {
  const testName = shard.tests[i];
  const testNum = shard.start + i;
  console.log(`[${testNum}/${testEntries.length}] Running ${testName}...`);
  
  try {
    execSync(`npm run ${testName}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
  } catch (error) {
    console.error(`\n❌ Test failed: ${testName}`);
    failed = true;
    break;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`\n✅ Shard ${shardIndex}/${totalShards} completed successfully!`);
