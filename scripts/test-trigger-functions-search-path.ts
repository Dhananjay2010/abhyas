#!/usr/bin/env tsx

/**
 * Test that trigger functions in 20261024140000_trigger_functions_search_path.sql
 * have proper search_path configuration and fully qualified names.
 * 
 * Verifies:
 * 1. Each function has `set search_path = ''`
 * 2. No unqualified table/function references
 * 3. Column lists match newest previous definitions
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20261024140000_trigger_functions_search_path.sql");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
}

function assertMatch(text: string, pattern: RegExp, message: string): void {
  if (!pattern.test(text)) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`Pattern: ${pattern}`);
    process.exit(1);
  }
}

function assertNoMatch(text: string, pattern: RegExp, message: string): void {
  if (pattern.test(text)) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`Pattern: ${pattern}`);
    console.error(`Found: ${text.match(pattern)?.[0]}`);
    process.exit(1);
  }
}

console.log("Testing trigger functions search_path migration...\n");

// Read the migration file
const migrationContent = fs.readFileSync(migrationPath, "utf-8");

// Test 1: Check that all three functions are present
const functions = [
  "set_updated_at",
  "set_user_id_from_parent",
  "handle_new_user"
];

for (const funcName of functions) {
  assertMatch(
    migrationContent,
    new RegExp(`create or replace function public\\.${funcName}\\(\\)`, "i"),
    `Function ${funcName}() should be defined`
  );
  console.log(`✓ Found function ${funcName}()`);
}

// Test 2: Check each function has search_path = ''
for (const funcName of functions) {
  const funcRegex = new RegExp(
    `create or replace function public\\.${funcName}\\(\\)[\\s\\S]*?set search_path = ''`,
    "i"
  );
  assertMatch(
    migrationContent,
    funcRegex,
    `Function ${funcName}() should have 'set search_path = \\'\\'`
  );
  console.log(`✓ ${funcName}() has search_path = ''`);
}

// Test 3: Extract function bodies and check for qualified names
const functionBodyRegex = /create or replace function public\.(\w+)\(\)([\s\S]*?)\$fn\$;/gi;
const bodies = [...migrationContent.matchAll(functionBodyRegex)];

assert(bodies.length === 3, "Should extract exactly 3 function bodies");

for (const [, funcName, body] of bodies) {
  console.log(`\nChecking ${funcName}() body...`);
  
  // Test 3a: Check for fully qualified function calls
  // Should have: pg_catalog.now(), pg_catalog.coalesce(), pg_catalog.split_part(), etc.
  if (funcName === "set_updated_at") {
    assertMatch(body, /pg_catalog\.now\(\)/, `${funcName}() should use pg_catalog.now()`);
    console.log(`  ✓ Uses pg_catalog.now()`);
  }
  
  if (funcName === "set_user_id_from_parent") {
    assertMatch(body, /pg_catalog\.to_jsonb/, `${funcName}() should use pg_catalog.to_jsonb`);
    assertMatch(body, /pg_catalog\.format/, `${funcName}() should use pg_catalog.format`);
    console.log(`  ✓ Uses pg_catalog.to_jsonb and pg_catalog.format`);
  }
  
  if (funcName === "handle_new_user") {
    assertMatch(body, /pg_catalog\.coalesce/, `${funcName}() should use pg_catalog.coalesce`);
    assertMatch(body, /pg_catalog\.split_part/, `${funcName}() should use pg_catalog.split_part`);
    console.log(`  ✓ Uses pg_catalog.coalesce and pg_catalog.split_part`);
  }
  
  // Test 3b: Check for fully qualified table references
  // Should have: public.profiles, public.user_settings, auth.users
  if (funcName === "handle_new_user") {
    assertMatch(body, /insert into public\.profiles/, `${funcName}() should use public.profiles`);
    assertMatch(body, /insert into public\.user_settings/, `${funcName}() should use public.user_settings`);
    console.log(`  ✓ Uses public.profiles and public.user_settings`);
  }
  
  // Test 3c: Check for unqualified references (should not exist)
  // These patterns would indicate unqualified references
  // Use negative lookbehind to exclude qualified references
  const unqualifiedPatterns = [
    /(?<!pg_catalog\.)\bnow\(\)/,  // now() not preceded by pg_catalog.
    /(?<!pg_catalog\.)\bcoalesce\(/,  // coalesce( not preceded by pg_catalog.
    /(?<!pg_catalog\.)\bsplit_part\(/,  // split_part( not preceded by pg_catalog.
    /(?<!pg_catalog\.)\bto_jsonb\(/,  // to_jsonb( not preceded by pg_catalog.
    /(?<!pg_catalog\.)\bformat\(/,  // format( not preceded by pg_catalog.
    /\binsert into profiles\b/,  // Should be public.profiles
    /\binsert into user_settings\b/,  // Should be public.user_settings
    /\bfrom profiles\b/,  // Should be public.profiles
    /\bfrom user_settings\b/,  // Should be public.user_settings
  ];
  
  for (const pattern of unqualifiedPatterns) {
    assertNoMatch(body, pattern, `${funcName}() should not have unqualified references matching ${pattern}`);
  }
  console.log(`  ✓ No unqualified references found`);
}

// Test 4: Check that column lists match previous definitions
// For handle_new_user, check that it inserts the same columns as in 20260922090000
console.log("\nChecking column lists match previous definitions...");

// Read the previous migration to compare
const previousMigrationPath = path.join(repoRoot, "supabase/migrations/20260922090000_restore_signup_trigger.sql");
const previousContent = fs.readFileSync(previousMigrationPath, "utf-8");

// Extract the profiles insert from both
const newProfilesInsert = migrationContent.match(/insert into public\.profiles \(([\s\S]*?)\)/i)?.[1];
const oldProfilesInsert = previousContent.match(/insert into public\.profiles \(([\s\S]*?)\)/i)?.[1];

assert(!!newProfilesInsert, "Should extract profiles insert from new migration");
assert(!!oldProfilesInsert, "Should extract profiles insert from old migration");

// Normalize whitespace for comparison
const normalizeColumns = (text: string) => 
  text.replace(/\s+/g, " ").trim().toLowerCase();

const newCols = normalizeColumns(newProfilesInsert!);
const oldCols = normalizeColumns(oldProfilesInsert!);

assert(
  newCols === oldCols,
  `Column list for profiles should match: expected "${oldCols}", got "${newCols}"`
);
console.log("✓ profiles insert columns match previous definition");

// Check the VALUES clause has the same structure
const newValuesCount = (migrationContent.match(/insert into public\.profiles[\s\S]*?values \(([\s\S]*?)\)/i)?.[1].match(/new\./g) || []).length;
const oldValuesCount = (previousContent.match(/insert into public\.profiles[\s\S]*?values \(([\s\S]*?)\)/i)?.[1].match(/new\./g) || []).length;

assert(
  newValuesCount === oldValuesCount,
  `profiles VALUES should have same structure (expected ${oldValuesCount} 'new.' references, got ${newValuesCount})`
);
console.log("✓ profiles VALUES structure matches");

// Test 5: Check that revoke statements are present for all functions
console.log("\nChecking revoke statements...");
for (const funcName of functions) {
  assertMatch(
    migrationContent,
    new RegExp(`revoke execute on function public\\.${funcName}\\(\\) from`, "i"),
    `Should have revoke statement for ${funcName}()`
  );
  console.log(`✓ ${funcName}() has revoke statement`);
}

console.log("\n✅ All trigger function tests passed!");
