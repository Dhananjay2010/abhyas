#!/usr/bin/env node
/**
 * Shared logic for calculating test shard boundaries based on measured timings.
 * Used by both run-test-shard.js and verify-test-shards.js.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

/**
 * Calculate optimal contiguous shard boundaries to minimize the slowest shard.
 * @param {string[]} testEntries - Full list of test names from package.json
 * @param {number} totalShards - Number of shards to create
 * @returns {{boundaries: number[], estimatedTimes: number[], shardAssignments: Array<{start: number, end: number, tests: string[], estimatedTime: number}>}}
 */
function calculateShardBoundaries(testEntries, totalShards) {
  // Load timings
  const timingsPath = path.join(__dirname, 'test-timings.json');
  let timings = {};
  if (fs.existsSync(timingsPath)) {
    timings = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));
  }

  // Get weights for each test (use median for missing entries)
  const allTimes = Object.values(timings);
  const median = allTimes.length > 0 
    ? allTimes.sort((a, b) => a - b)[Math.floor(allTimes.length / 2)] 
    : 0.5;

  const weights = testEntries.map(test => timings[test] || median);
  const totalTime = weights.reduce((sum, w) => sum + w, 0);

  // Try to find boundaries that minimize the maximum shard time
  // Dynamic programming approach for optimal contiguous partitioning
  let bestBoundaries = null;
  let bestMaxTime = Infinity;

  // For each possible partition, calculate max shard time
  function tryPartition(boundaries) {
    const shardTimes = [];
    let start = 0;
    for (const end of [...boundaries, testEntries.length]) {
      const time = weights.slice(start, end).reduce((sum, w) => sum + w, 0);
      shardTimes.push(time);
      start = end;
    }
    const maxTime = Math.max(...shardTimes);
    if (maxTime < bestMaxTime) {
      bestMaxTime = maxTime;
      bestBoundaries = [...boundaries];
    }
    return shardTimes;
  }

  // For 3 shards, we need 2 boundaries. Try different positions.
  if (totalShards === 3) {
    // Use a greedy approach: find the boundary that minimizes max shard time
    for (let b1 = 1; b1 < testEntries.length - 1; b1++) {
      for (let b2 = b1 + 1; b2 < testEntries.length; b2++) {
        tryPartition([b1, b2]);
      }
    }
  } else if (totalShards === 4) {
    // For 4 shards, we need 3 boundaries
    for (let b1 = 1; b1 < testEntries.length - 2; b1++) {
      for (let b2 = b1 + 1; b2 < testEntries.length - 1; b2++) {
        for (let b3 = b2 + 1; b3 < testEntries.length; b3++) {
          tryPartition([b1, b2, b3]);
        }
      }
    }
  }

  // Calculate final shard assignments
  const boundaries = bestBoundaries || [];
  const shardAssignments = [];
  let start = 0;
  for (let i = 0; i < totalShards; i++) {
    const end = i === totalShards - 1 ? testEntries.length : boundaries[i];
    const tests = testEntries.slice(start, end);
    const estimatedTime = weights.slice(start, end).reduce((sum, w) => sum + w, 0);
    shardAssignments.push({
      start: start + 1, // 1-indexed for display
      end,
      tests,
      estimatedTime
    });
    start = end;
  }

  const estimatedTimes = shardAssignments.map(s => s.estimatedTime);

  return { boundaries, estimatedTimes, shardAssignments };
}

/**
 * Validate test entries format
 * @param {string[]} testEntries - Test names to validate
 * @throws {Error} if any entry doesn't match expected format
 */
function validateTestEntries(testEntries) {
  for (const entry of testEntries) {
    if (!entry.match(/^test:[a-z0-9-]+$/)) {
      throw new Error(`Invalid test entry format: "${entry}". Expected "test:<name>" with lowercase letters, numbers, and hyphens only.`);
    }
  }
}

module.exports = {
  calculateShardBoundaries,
  validateTestEntries
};
