#!/usr/bin/env node
/**
 * Verifies that the union of all test shards equals the full test chain.
 * This ensures no tests are dropped or duplicated when sharding.
 * Usage: node scripts/verify-test-shards.js <totalShards>
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { calculateShardBoundaries, validateTestEntries } = require('./shard-boundaries');

const totalShards = parseInt(process.argv[2], 10);

if (!totalShards || totalShards < 1) {
  console.error('Usage: node scripts/verify-test-shards.js <totalShards>');
  console.error('Example: node scripts/verify-test-shards.js 3');
  process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const testScript = packageJson.scripts.test;
if (!testScript) {
  console.error('❌ No test script found in package.json');
  process.exit(1);
}

// Parse the test chain
const fullChain = testScript
  .split(' && ')
  .map(s => s.trim().replace(/^npm run /, ''));

console.log(`Full test chain: ${fullChain.length} entries`);

// Validate test entries format
try {
  validateTestEntries(fullChain);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

// Calculate time-balanced shard boundaries
const { shardAssignments } = calculateShardBoundaries(fullChain, totalShards);

// Check for empty shards
for (let i = 0; i < shardAssignments.length; i++) {
  if (shardAssignments[i].tests.length === 0) {
    console.error(`❌ FAIL: Shard ${i + 1} is empty!`);
    process.exit(1);
  }
}

// Print shard boundaries
console.log('\nShard boundaries (time-balanced):');
for (const shard of shardAssignments) {
  const shardIdx = shardAssignments.indexOf(shard) + 1;
  console.log(`  Shard ${shardIdx}/${totalShards}: tests ${shard.start}-${shard.end} (${shard.tests.length} tests, ~${shard.estimatedTime.toFixed(0)}s)`);
  console.log(`    First: ${shard.tests[0]}`);
  console.log(`    Last: ${shard.tests[shard.tests.length - 1]}`);
}

// Build union
const shardUnion = [];
for (const shard of shardAssignments) {
  shardUnion.push(...shard.tests);
}

// Verify union equals full chain
console.log('\nVerifying shard coverage...');

// Check count
if (shardUnion.length !== fullChain.length) {
  console.error(`❌ FAIL: Shard union has ${shardUnion.length} tests, expected ${fullChain.length}`);
  process.exit(1);
}

// Check each test is present exactly once in the correct order
let allMatch = true;
for (let i = 0; i < fullChain.length; i++) {
  if (fullChain[i] !== shardUnion[i]) {
    console.error(`❌ FAIL: Position ${i + 1}: expected "${fullChain[i]}", got "${shardUnion[i]}"`);
    allMatch = false;
  }
}

if (!allMatch) {
  process.exit(1);
}

// Check for duplicates
const uniqueTests = new Set(shardUnion);
if (uniqueTests.size !== shardUnion.length) {
  console.error(`❌ FAIL: Duplicate tests found! Unique: ${uniqueTests.size}, Total: ${shardUnion.length}`);
  process.exit(1);
}

console.log('✅ PASS: Shard union exactly equals the full test chain');
console.log(`  - All ${fullChain.length} tests present`);
console.log(`  - No duplicates`);
console.log(`  - Correct order maintained`);
console.log(`  - No empty shards`);
console.log(`  - All entries match "npm run test:<name>" format`);

process.exit(0);
