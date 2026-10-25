#!/usr/bin/env node
/**
 * Runs all tests with timing to identify the slowest ones.
 * Usage: node scripts/time-tests.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

console.log(`Timing ${testEntries.length} tests...`);
console.log('This will take a while (~18 minutes).\n');

const timings = [];

for (let i = 0; i < testEntries.length; i++) {
  const testName = testEntries[i];
  const testNum = i + 1;
  
  process.stdout.write(`[${testNum}/${testEntries.length}] ${testName}...`);
  
  const startTime = Date.now();
  try {
    execSync(`npm run ${testName}`, {
      stdio: 'pipe',
      cwd: path.join(__dirname, '..'),
      timeout: 120000 // 2 minute timeout per test
    });
    const duration = Date.now() - startTime;
    timings.push({ test: testName, duration, passed: true });
    console.log(` ${(duration / 1000).toFixed(2)}s ✅`);
  } catch (error) {
    const duration = Date.now() - startTime;
    timings.push({ test: testName, duration, passed: false });
    console.log(` ${(duration / 1000).toFixed(2)}s ❌`);
    console.error(`Test failed: ${testName}`);
    break;
  }
}

// Sort by duration
timings.sort((a, b) => b.duration - a.duration);

// Print top 10 slowest
console.log('\n\n=== TOP 10 SLOWEST TESTS ===');
for (let i = 0; i < Math.min(10, timings.length); i++) {
  const { test, duration, passed } = timings[i];
  const status = passed ? '✅' : '❌';
  console.log(`${i + 1}. ${test}: ${(duration / 1000).toFixed(2)}s ${status}`);
}

// Calculate shard timings
const testsPerShard = Math.ceil(testEntries.length / 3);
const shard1Timings = timings.slice(0, testsPerShard);
const shard2Timings = timings.slice(testsPerShard, testsPerShard * 2);
const shard3Timings = timings.slice(testsPerShard * 2);

const shard1Total = shard1Timings.reduce((sum, t) => sum + t.duration, 0);
const shard2Total = shard2Timings.reduce((sum, t) => sum + t.duration, 0);
const shard3Total = shard3Timings.reduce((sum, t) => sum + t.duration, 0);

console.log('\n=== SHARD TIMINGS (by original order) ===');
console.log(`Shard 1 (tests 1-${testsPerShard}): ${(shard1Total / 1000).toFixed(2)}s`);
console.log(`Shard 2 (tests ${testsPerShard + 1}-${testsPerShard * 2}): ${(shard2Total / 1000).toFixed(2)}s`);
console.log(`Shard 3 (tests ${testsPerShard * 2 + 1}-${testEntries.length}): ${(shard3Total / 1000).toFixed(2)}s`);

const totalTime = shard1Total + shard2Total + shard3Total;
console.log(`\nTotal time: ${(totalTime / 1000).toFixed(2)}s (${(totalTime / 60000).toFixed(2)} minutes)`);
console.log(`Parallel time (3 shards): ~${(Math.max(shard1Total, shard2Total, shard3Total) / 60000).toFixed(2)} minutes`);

// Save results
const resultsFile = path.join(__dirname, 'test-timings.json');
fs.writeFileSync(resultsFile, JSON.stringify({ timings, testEntries }, null, 2));
console.log(`\nResults saved to ${resultsFile}`);
