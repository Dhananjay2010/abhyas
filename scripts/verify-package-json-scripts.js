#!/usr/bin/env node
/**
 * Verify package.json scripts match main exactly plus only our new keys.
 * Ensures every main key exists with identical value and every chain entry has a definition.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Get base branch's package.json (we're stacked on cursor/gym-tenant-data-model-73d4)
const basePkgJson = execSync('git show origin/cursor/gym-tenant-data-model-73d4:package.json', { encoding: 'utf8' });
const basePkg = JSON.parse(basePkgJson);
const baseScripts = basePkg.scripts;

// Get our package.json
const ourPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const ourScripts = ourPkg.scripts;

console.log("Verifying package.json scripts...\n");

// Check every base key exists with identical value
console.log("TEST: Every base key exists with identical value in our package.json");
const baseKeys = Object.keys(baseScripts).filter(k => k !== 'test');
for (const key of baseKeys) {
  const baseValue = baseScripts[key];
  const ourValue = ourScripts[key];
  check(`${key} matches base`, ourValue === baseValue, ourValue !== baseValue ? `\n    base: ${baseValue}\n    ours: ${ourValue}` : '');
}
console.log();

// Check base test chain is a prefix of ours
console.log("TEST: Base's test chain is an exact prefix of ours");
const baseTestChain = baseScripts.test.split(' && ').map(s => s.trim().replace(/^npm run /, ''));
const ourTestChain = ourScripts.test.split(' && ').map(s => s.trim().replace(/^npm run /, ''));

console.log(`Base test chain: ${baseTestChain.length} tests`);
console.log(`Our test chain: ${ourTestChain.length} tests`);

let chainMatches = true;
for (let i = 0; i < baseTestChain.length; i++) {
  if (baseTestChain[i] !== ourTestChain[i]) {
    check(`Chain position ${i + 1} matches`, false, `\n    base: ${baseTestChain[i]}\n    ours: ${ourTestChain[i]}`);
    chainMatches = false;
    break;
  }
}

if (chainMatches && ourTestChain.length >= baseTestChain.length) {
  check("Base's test chain is an exact prefix", true);
  
  const appendedTests = ourTestChain.slice(baseTestChain.length);
  console.log(`Appended tests (${appendedTests.length}):`);
  appendedTests.forEach((t, i) => console.log(`  ${baseTestChain.length + i + 1}: ${t}`));
  
  // Check every appended test has a definition
  console.log();
  console.log("TEST: Every appended test has a script definition");
  for (const test of appendedTests) {
    const scriptKey = test;
    check(`${scriptKey} has definition`, !!ourScripts[scriptKey], !ourScripts[scriptKey] ? `Missing definition for ${scriptKey}` : '');
  }
} else if (chainMatches && ourTestChain.length < baseTestChain.length) {
  check("Base's test chain is an exact prefix", false, `Our chain is shorter than base (${ourTestChain.length} < ${baseTestChain.length})`);
}
console.log();

// Check every test chain entry has a script definition
console.log("TEST: Every test chain entry has a script definition");
for (const test of ourTestChain) {
  const scriptKey = test;
  check(`${scriptKey} has definition`, !!ourScripts[scriptKey], !ourScripts[scriptKey] ? `Missing definition for ${scriptKey}` : '');
}
console.log();

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}

console.log("\n✅ All checks passed\n");
process.exit(0);
