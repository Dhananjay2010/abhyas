#!/usr/bin/env tsx
/**
 * Test: package.json validation
 * 
 * Validates that package.json is valid JSON with no duplicate keys
 * and that scripts.test contains no literal newlines (breaks npm test locally).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function hasDuplicateKeys(jsonString: string): { hasDuplicates: boolean; duplicates: string[] } {
  const duplicates: string[] = [];
  const keys = new Set<string>();
  
  // Parse manually to detect duplicate keys (JSON.parse silently uses the last value)
  const keyPattern = /"([^"]+)"\s*:/g;
  let match;
  
  while ((match = keyPattern.exec(jsonString)) !== null) {
    const key = match[1];
    if (keys.has(key)) {
      duplicates.push(key);
    }
    keys.add(key);
  }
  
  return { hasDuplicates: duplicates.length > 0, duplicates };
}

function runTest(): void {
  const packageJsonPath = resolve(__dirname, '../package.json');
  const content = readFileSync(packageJsonPath, 'utf-8');
  
  // Test 1: Valid JSON
  let pkg: { scripts?: { test?: string } };
  try {
    pkg = JSON.parse(content);
    console.log('✓ package.json is valid JSON');
  } catch (error) {
    console.error('✗ package.json is invalid JSON:', (error as Error).message);
    process.exit(1);
  }
  
  // Test 2: No duplicate keys
  const { hasDuplicates, duplicates } = hasDuplicateKeys(content);
  if (hasDuplicates) {
    console.error('✗ package.json has duplicate keys:', duplicates.join(', '));
    process.exit(1);
  }
  console.log('✓ package.json has no duplicate keys');
  
  // Test 3: scripts.test must not contain literal newlines
  // Newlines break local `npm test` with "Syntax error: '&&' unexpected"
  // (CI shards pass because they parse differently)
  const testScript = pkg.scripts?.test;
  if (testScript && testScript.includes('\n')) {
    console.error('✗ scripts.test contains literal newline(s) - breaks local npm test');
    console.error('  Run: sh -n -c "$(jq -r .scripts.test package.json)" to verify');
    process.exit(1);
  }
  console.log('✓ scripts.test contains no literal newlines');
  
  console.log('\n✅ All package.json validation tests passed\n');
}

runTest();
