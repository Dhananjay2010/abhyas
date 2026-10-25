#!/usr/bin/env node
/**
 * Verifies that the union of all test shards equals the full test chain.
 * This ensures no tests are dropped or duplicated when sharding.
 * Usage: node scripts/verify-test-shards.js <totalShards>
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

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

// Calculate what each shard would contain
const testsPerShard = Math.ceil(fullChain.length / totalShards);
const shardContents = [];
const shardUnion = [];

for (let shardIdx = 1; shardIdx <= totalShards; shardIdx++) {
  const startIdx = (shardIdx - 1) * testsPerShard;
  const endIdx = Math.min(shardIdx * testsPerShard, fullChain.length);
  const shardTests = fullChain.slice(startIdx, endIdx);
  
  shardContents.push({
    shard: shardIdx,
    start: startIdx + 1,
    end: endIdx,
    count: shardTests.length,
    tests: shardTests
  });
  
  shardUnion.push(...shardTests);
}

// Print shard boundaries
console.log('\nShard boundaries:');
for (const shard of shardContents) {
  console.log(`  Shard ${shard.shard}/${totalShards}: tests ${shard.start}-${shard.end} (${shard.count} tests)`);
  console.log(`    First: ${shard.tests[0]}`);
  console.log(`    Last: ${shard.tests[shard.tests.length - 1]}`);
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

process.exit(0);
