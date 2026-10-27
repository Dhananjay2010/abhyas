#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';

// Get package.json from both versions
const mainPkg = JSON.parse(execSync('git show origin/main:package.json', { encoding: 'utf8' }));
const prPkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }));

// Extract test scripts from both
const mainTests: [string, string][] = [];
const prTests: [string, string][] = [];

for (const [key, value] of Object.entries(mainPkg.scripts)) {
  if (key.startsWith('test:') && typeof value === 'string') {
    mainTests.push([key, value]);
  }
}

for (const [key, value] of Object.entries(prPkg.scripts)) {
  if (key.startsWith('test:') && typeof value === 'string') {
    prTests.push([key, value]);
  }
}

console.error(`Main has ${mainTests.length} test: entries`);
console.error(`PR has ${prTests.length} test: entries`);

// Find PR additions (tests in PR but not in main)
const mainTestKeys = new Set(mainTests.map(([k]) => k));
const prAdditions = prTests.filter(([k]) => !mainTestKeys.has(k));

console.error(`PR adds ${prAdditions.length} new test entries`);

// Build merged scripts: all non-test from main, then main's tests, then PR additions, then test: script
const merged = { ...mainPkg };
merged.scripts = {};

// Add non-test scripts from main
for (const [key, value] of Object.entries(mainPkg.scripts)) {
  if (!key.startsWith('test')) {
    merged.scripts[key] = value;
  }
}

// Add all main test: entries
for (const [key, value] of mainTests) {
  merged.scripts[key] = value;
}

// Add PR additions
for (const [key, value] of prAdditions) {
  merged.scripts[key] = value;
}

// Build the test chain
const allTests = [...mainTests, ...prAdditions];
const testChain = allTests.map(([k]) => `npm run ${k}`).join(' && ');

// Add prefix validation
const prefixCheck = `bash -c 'set -u; for f in package.json; do lines=$(jq -r ".scripts.test" "$f" | grep -o "npm run test:" | wc -l); [ "$lines" -ge ${mainTests.length} ] || { echo "❌ test chain in $f has $lines entries, expected >= ${mainTests.length}"; exit 1; }; done; echo "✅ test chain prefix validated ($lines entries)"'`;

merged.scripts.test = `${prefixCheck} && ${testChain}`;

// Write result
fs.writeFileSync('package.json', JSON.stringify(merged, null, 2) + '\n');

console.error(`\n✅ Merged package.json written with ${allTests.length} test entries (${mainTests.length} from main + ${prAdditions.length} from PR)`);
console.error(`Prefix check validates >= ${mainTests.length} entries`);
