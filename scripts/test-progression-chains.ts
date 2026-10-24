#!/usr/bin/env tsx
/**
 * Test that all exercise slugs referenced in progression chains exist in the
 * seed catalogue.
 */

import { BODYWEIGHT_CHAINS } from "../src/lib/program/variations";
import { readFileSync } from "fs";
import { join } from "path";

// Parse all exercise slugs from the migration
function getExerciseSlugs(): Set<string> {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260909110000_fix_separator_safety_rules.sql"
  );
  
  const content = readFileSync(migrationPath, "utf-8");
  const slugs = new Set<string>();
  
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("('")) continue;
    
    // Extract the first quoted string (the slug)
    const match = trimmed.match(/^\('([^']+)'/);
    if (match) {
      slugs.add(match[1]);
    }
  }
  
  return slugs;
}

const existingSlugs = getExerciseSlugs();
const missingSlugs: Array<{ chain: string; slug: string }> = [];

for (const [chainName, variations] of Object.entries(BODYWEIGHT_CHAINS)) {
  for (const slug of variations) {
    if (!existingSlugs.has(slug)) {
      missingSlugs.push({ chain: chainName, slug });
    }
  }
}

if (missingSlugs.length > 0) {
  console.error(`❌ Found ${missingSlugs.length} slugs in progression chains that don't exist in the catalogue:\n`);
  
  for (const missing of missingSlugs) {
    console.error(`  Chain "${missing.chain}": slug "${missing.slug}" not found`);
  }
  
  console.error();
  console.error("All progression chain slugs must reference exercises that exist in the seed catalogue.");
  
  process.exit(1);
}

console.log("✅ All progression chain slugs exist in the catalogue!");
process.exit(0);
