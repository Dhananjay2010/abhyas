#!/usr/bin/env tsx
/**
 * Test: package.json has no duplicate keys
 * 
 * Validates that package.json is valid JSON with no duplicate keys.
 * Duplicate keys can occur after merge conflicts and are invalid JSON.
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
  try {
    JSON.parse(content);
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
  
  console.log('\n✅ All package.json validation tests passed\n');
}

runTest();
