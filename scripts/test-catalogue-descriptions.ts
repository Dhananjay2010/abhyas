#!/usr/bin/env tsx
/**
 * Test that all exercise descriptions (cues) are correct and match their
 * movement pattern and mechanic.
 * 
 * This test verifies that our migration fixes (20261024140700) will resolve
 * all description issues.
 */

import { auditCatalogueDescriptions, auditExercise } from "./audit-catalogue-descriptions";
import type { ExerciseFromSeed } from "./audit-catalogue-descriptions";
import cueFixes from "./cue-fixes.json" assert { type: "json" };
import { readFileSync } from "fs";
import { join } from "path";

// Parse exercises from the base migration
function parseExercisesFromBaseMigration(): Map<string, ExerciseFromSeed> {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260909110000_fix_separator_safety_rules.sql"
  );
  
  const content = readFileSync(migrationPath, "utf-8");
  const exercises = new Map<string, ExerciseFromSeed>();
  
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("('")) continue;
    
    const parts: string[] = [];
    let inQuote = false;
    let current = "";
    let escaped = false;
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      
      if (char === "\\") {
        escaped = true;
        current += char;
        continue;
      }
      
      if (char === "'") {
        if (inQuote) {
          if (i + 1 < trimmed.length && trimmed[i + 1] === "'") {
            current += "'";
            i++;
            continue;
          }
          parts.push(current);
          current = "";
          inQuote = false;
        } else {
          inQuote = true;
        }
      } else if (inQuote) {
        current += char;
      }
    }
    
    if (parts.length < 16) continue;
    
    const slug = parts[0];
    const name = parts[1];
    const mechanic = parts[4];
    const movement_pattern = parts[6];
    const cue = parts[14];
    
    if (!cue || cue.includes("::")) continue;
    
    exercises.set(slug, {
      slug,
      name,
      cue,
      movement_pattern: movement_pattern as ExerciseFromSeed["movement_pattern"],
      mechanic: mechanic as ExerciseFromSeed["mechanic"],
    });
  }
  
  return exercises;
}

// Get base exercises
const baseExercises = parseExercisesFromBaseMigration();

// Apply our fixes
type CueFix = { slug: string; oldCue: string; newCue: string };
for (const fix of cueFixes as CueFix[]) {
  const exercise = baseExercises.get(fix.slug);
  if (exercise && exercise.cue === fix.oldCue) {
    exercise.cue = fix.newCue;
  }
}

// Audit the updated exercises
interface Mismatch extends ExerciseFromSeed {
  issues: string[];
}
const mismatches: Mismatch[] = [];
for (const exercise of baseExercises.values()) {
  const issues = auditExercise(exercise);
  if (issues.length > 0) {
    mismatches.push({
      ...exercise,
      issues,
    });
  }
}

if (mismatches.length > 0) {
  console.error(`❌ Found ${mismatches.length} exercises with incorrect descriptions AFTER applying fixes:\n`);
  
  for (const mismatch of mismatches) {
    console.error(`  ${mismatch.slug} (${mismatch.name})`);
    console.error(`    Current cue: "${mismatch.cue}"`);
    console.error(`    Pattern: ${mismatch.movement_pattern}, Mechanic: ${mismatch.mechanic}`);
    console.error(`    Issues:`);
    for (const issue of mismatch.issues) {
      console.error(`      - ${issue}`);
    }
    console.error();
  }
  
  console.error("This means our migration does not fix all the issues!");
  process.exit(1);
}

console.log("✅ All exercise descriptions will be correct after applying the migration!");
process.exit(0);
