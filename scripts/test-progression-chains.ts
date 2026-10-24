#!/usr/bin/env tsx
/**
 * Test bodyweight progression chains and nextVariation function.
 */

import { BODYWEIGHT_CHAINS, nextVariation } from "../src/lib/program/variations";
import { readFileSync } from "fs";
import { join } from "path";

// Parse exercises from the seed migration
function getExerciseSlugs(): Map<string, { equipment_ids: string[] }> {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260909110000_fix_separator_safety_rules.sql"
  );
  
  const content = readFileSync(migrationPath, "utf-8");
  const exercises = new Map<string, { equipment_ids: string[] }>();
  
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("('")) continue;
    
    // Extract slug and equipment
    const slugMatch = trimmed.match(/^\('([^']+)'/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    
    // Extract equipment_ids array
    const equipMatch = trimmed.match(/\{([^}]*)\}::(text\[\])/);
    const equipment_ids = equipMatch ? equipMatch[1].replace(/'/g, '').split(',').filter(Boolean) : [];
    
    exercises.set(slug, { equipment_ids });
  }
  
  return exercises;
}

const catalogue = getExerciseSlugs();
let pass = true;

console.log("1. nextVariation function tests");

// Test: next step mid-chain
const nextInPushup = nextVariation("push-up", "pushups");
if (nextInPushup === "push-ups-with-feet-elevated") {
  console.log("  ok   mid-chain returns next variation");
} else {
  console.error(`  FAIL mid-chain: expected "push-ups-with-feet-elevated", got "${nextInPushup}"`);
  pass = false;
}

// Test: null at end of chain
const nextAtEnd = nextVariation("push-up", "single-arm-push-up");
if (nextAtEnd === null) {
  console.log("  ok   end of chain returns null");
} else {
  console.error(`  FAIL end of chain: expected null, got "${nextAtEnd}"`);
  pass = false;
}

// Test: null for unknown slug
const nextUnknownSlug = nextVariation("push-up", "nonexistent-exercise");
if (nextUnknownSlug === null) {
  console.log("  ok   unknown slug returns null");
} else {
  console.error(`  FAIL unknown slug: expected null, got "${nextUnknownSlug}"`);
  pass = false;
}

// Test: null for unknown chain
const nextUnknownChain = nextVariation("nonexistent-chain", "pushups");
if (nextUnknownChain === null) {
  console.log("  ok   unknown chain returns null");
} else {
  console.error(`  FAIL unknown chain: expected null, got "${nextUnknownChain}"`);
  pass = false;
}

// Test: first element returns second
const nextFirst = nextVariation("squat", "chair-squat");
if (nextFirst === "box-squat") {
  console.log("  ok   first element returns second");
} else {
  console.error(`  FAIL first element: expected "box-squat", got "${nextFirst}"`);
  pass = false;
}

console.log("\n2. Chain slug existence validation");

const missingSlugs: Array<{ chain: string; slug: string }> = [];
for (const [chainName, variations] of Object.entries(BODYWEIGHT_CHAINS)) {
  for (const slug of variations) {
    if (!catalogue.has(slug)) {
      missingSlugs.push({ chain: chainName, slug });
    }
  }
}

if (missingSlugs.length === 0) {
  console.log("  ok   all chain slugs exist in catalogue");
} else {
  console.error(`  FAIL ${missingSlugs.length} slugs not found in catalogue:`);
  for (const { chain, slug } of missingSlugs) {
    console.error(`    - ${chain}: ${slug}`);
  }
  pass = false;
}

console.log("\n3. Bodyweight-only validation");

const nonBodyweight: Array<{ chain: string; slug: string; equipment: string[] }> = [];
for (const [chainName, variations] of Object.entries(BODYWEIGHT_CHAINS)) {
  for (const slug of variations) {
    const exercise = catalogue.get(slug);
    if (exercise && exercise.equipment_ids.length > 0) {
      nonBodyweight.push({ chain: chainName, slug, equipment: exercise.equipment_ids });
    }
  }
}

if (nonBodyweight.length === 0) {
  console.log("  ok   all chain exercises are bodyweight-only (no equipment)");
} else {
  console.error(`  FAIL ${nonBodyweight.length} exercises require equipment:`);
  for (const { chain, slug, equipment } of nonBodyweight) {
    console.error(`    - ${chain}: ${slug} requires [${equipment.join(', ')}]`);
  }
  pass = false;
}

console.log("\n4. Chain structure validation");

let hasEmptyChains = false;
for (const [chainName, variations] of Object.entries(BODYWEIGHT_CHAINS)) {
  if (variations.length === 0) {
    console.error(`  FAIL ${chainName}: empty chain`);
    hasEmptyChains = true;
    pass = false;
  } else if (variations.length === 1) {
    console.log(`  note ${chainName}: single-exercise chain (no progression)`);
  }
}

if (!hasEmptyChains) {
  console.log("  ok   no empty chains");
}

console.log();
if (pass) {
  console.log("ALL CHECKS PASSED");
  process.exit(0);
} else {
  console.error("SOME CHECKS FAILED");
  process.exit(1);
}
