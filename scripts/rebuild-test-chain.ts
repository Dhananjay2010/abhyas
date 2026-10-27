#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';

// Get package.json from both versions
const mainPkg = JSON.parse(execSync('git show 831e2cb1:package.json', { encoding: 'utf8' }));
const prPkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }));

// Extract main's test chain (438 entries)
const mainTestChain = mainPkg.scripts.test;
const mainTestEntries = mainTestChain.split(' && ').filter((e: string) => e.startsWith('npm run test:'));

console.error(`Main test chain has ${mainTestEntries.length} entries`);

// Extract all test: definitions from main
const mainTestDefs: Record<string, string> = {};
for (const [key, value] of Object.entries(mainPkg.scripts)) {
  if (key.startsWith('test:') && typeof value === 'string') {
    mainTestDefs[key.substring(5)] = value; // Remove "test:" prefix
  }
}

// Extract all test: definitions from PR
const prTestDefs: Record<string, string> = {};
for (const [key, value] of Object.entries(prPkg.scripts)) {
  if (key.startsWith('test:') && typeof value === 'string') {
    prTestDefs[key.substring(5)] = value;
  }
}

// Find PR additions (not in main's chain)
const mainChainSet = new Set(mainTestEntries.map((e: string) => e.replace('npm run test:', '')));
const prAdditions = Object.keys(prTestDefs).filter(k => !mainChainSet.has(k));

console.error(`PR adds ${prAdditions.length} new test entries`);

// Main-only entries to exclude
const mainOnlyExclude = new Set([
  'sw-built-output',
  'proxy-routes', 
  'sitemap-route',
  'swap-guard-real-db',
  'block-range-db-followup',
  'block-range-cleanup',
  'progress-active-days',
  'superseded-override',
  'first-build-ended-on',
  'equipment-two-client',
  'injuries-two-client',
  'stale-stash-two-client',
  'ended-early-real-db',
  'past-knee-warmup-identity:baseline',
  'shard1',
  'shard2',
  'shard3',
]);

// Build merged scripts
const merged = { ...mainPkg };
merged.scripts = {};

// Add all non-test scripts from main
for (const [key, value] of Object.entries(mainPkg.scripts)) {
  if (!key.startsWith('test')) {
    merged.scripts[key] = value;
  }
}

// Add all main test: definitions (not just chain entries)
for (const [name, value] of Object.entries(mainTestDefs)) {
  merged.scripts[`test:${name}`] = value;
}

// Add PR additions
for (const name of prAdditions) {
  merged.scripts[`test:${name}`] = prTestDefs[name];
}

// Build test chain: main's 438 + PR additions (excluding main-only)
const finalChain = [
  ...mainTestEntries,
  ...prAdditions
    .filter(name => !mainOnlyExclude.has(name))
    .map(name => `npm run test:${name}`)
];

merged.scripts.test = finalChain.join(' && ');

// Write result
fs.writeFileSync('package.json', JSON.stringify(merged, null, 2) + '\n');

console.error(`\n✅ Test chain: ${finalChain.length} entries (438 from main + ${prAdditions.filter(n => !mainOnlyExclude.has(n)).length} from PR)`);
console.error(`Total test: definitions: ${Object.keys(merged.scripts).filter(k => k.startsWith('test:')).length}`);
