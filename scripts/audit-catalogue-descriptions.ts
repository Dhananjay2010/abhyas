#!/usr/bin/env tsx
/**
 * Audit catalogue exercise descriptions (cues) for correctness.
 * 
 * Checks that:
 * 1. Description force (push/pull) matches movement pattern
 * 2. Description mechanic (compound/isolation) matches actual mechanic
 * 3. Core/squat/lunge/hinge patterns aren't described as push/pull
 */

import { readFileSync } from "fs";
import { join } from "path";

type MovementPattern =
  | "horizontal_press"
  | "vertical_press"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "calf"
  | "core"
  | "biceps"
  | "triceps"
  | "lateral_delt"
  | "rear_delt"
  | "forearm"
  | "neck"
  | "carry"
  | "cardio"
  | "other";

type Mechanic = "compound" | "isolation";

// Pattern categories
const PUSH_PATTERNS: MovementPattern[] = ["horizontal_press", "vertical_press"];
const PULL_PATTERNS: MovementPattern[] = ["horizontal_pull", "vertical_pull", "biceps", "forearm"];
const LOWER_BODY_PATTERNS: MovementPattern[] = ["squat", "lunge", "hinge"];
const CORE_PATTERN: MovementPattern = "core";

export interface ExerciseFromSeed {
  slug: string;
  name: string;
  cue: string;
  movement_pattern: MovementPattern;
  mechanic: Mechanic;
}

export interface DescriptionMismatch {
  slug: string;
  name: string;
  cue: string;
  movement_pattern: MovementPattern;
  mechanic: Mechanic;
  issues: string[];
}

/**
 * Audit a single exercise's description for correctness.
 */
export function auditExercise(exercise: ExerciseFromSeed): string[] {
  const issues: string[] = [];
  const cue = exercise.cue;
  
  if (!cue) {
    return issues;
  }

  const cueLower = cue.toLowerCase();
  const pattern = exercise.movement_pattern;
  const mechanic = exercise.mechanic;

  // Check 1: Force direction (push/pull) must match pattern
  const saysPush = cueLower.includes(" push ");
  const saysPull = cueLower.includes(" pull ");
  
  if (saysPush && !PUSH_PATTERNS.includes(pattern)) {
    issues.push(`Described as "push" but pattern is ${pattern}`);
  }
  
  if (saysPull && !PULL_PATTERNS.includes(pattern)) {
    issues.push(`Described as "pull" but pattern is ${pattern}`);
  }

  // Check 2: Lower-body and core patterns should not be described as push/pull
  if (LOWER_BODY_PATTERNS.includes(pattern) || pattern === CORE_PATTERN) {
    if (saysPush) {
      issues.push(`${pattern} pattern should not be described as "push"`);
    }
    if (saysPull && pattern !== CORE_PATTERN) {
      // Core exercises with "pull" force can have "pull" in the cue
      // But squat/lunge/hinge should never say "pull"
      issues.push(`${pattern} pattern should not be described as "pull"`);
    }
  }

  // Check 3: Mechanic (compound vs isolation) must match
  const saysCompound = cueLower.includes("compound");
  const saysIsolation = cueLower.includes("isolation");
  
  if (saysCompound && mechanic === "isolation") {
    issues.push(`Described as "compound" but mechanic is isolation`);
  }
  
  if (saysIsolation && mechanic === "compound") {
    issues.push(`Described as "isolation" but mechanic is compound`);
  }

  return issues;
}

/**
 * Parse exercise INSERT statements from the seed migration.
 * Returns exercises with their cues.
 */
function parseExercisesFromMigration(migrationPath: string): ExerciseFromSeed[] {
  const content = readFileSync(migrationPath, "utf-8");
  const exercises: ExerciseFromSeed[] = [];

  // Split into lines and find INSERT value rows
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that start with ('slug', 'Name', ...)
    if (!trimmed.startsWith("('")) continue;
    
    // Extract values between quotes
    const parts: string[] = [];
    let inQuote = false;
    let current = '';
    let escaped = false;
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        current += char;
        continue;
      }
      
      if (char === "'") {
        if (inQuote) {
          // Check if it's a doubled quote (SQL escape)
          if (i + 1 < trimmed.length && trimmed[i + 1] === "'") {
            current += "'";
            i++; // skip next quote
            continue;
          }
          parts.push(current);
          current = '';
          inQuote = false;
        } else {
          inQuote = true;
        }
      } else if (inQuote) {
        current += char;
      }
    }
    
    // We need at least: slug, name, ..., and cue at position 15
    if (parts.length < 16) continue;
    
    const slug = parts[0];
    const name = parts[1];
    // parts[2] = tracks (JSON)
    // parts[3] = category
    const mechanic = parts[4];
    // parts[5] = force
    const movement_pattern = parts[6];
    // parts[7] = primary_muscles (JSON)
    // parts[8] = secondary_muscles (JSON)
    // parts[9] = equipment_ids (JSON)
    // parts[10] = level_min
    // parts[11] = contraindicated_regions (JSON)
    // parts[12] = impact
    // parts[13] = spinal_load
    // parts[14] = default_rest_seconds (number, not in quotes)
    // After default_rest_seconds, the next quoted string is the cue
    
    // Find cue - it's after spinal_load and before progression_chain
    // Count through the format to find the 15th string value (0-indexed)
    const cue = parts[14]; // This should be the cue
    
    if (!cue || cue.includes('::')) {
      // Skip if we didn't parse correctly
      continue;
    }
    
    exercises.push({
      slug,
      name,
      cue,
      movement_pattern: movement_pattern as MovementPattern,
      mechanic: mechanic as Mechanic,
    });
  }

  return exercises;
}

/**
 * Audit all exercises from the seed migration and return mismatches.
 */
export function auditCatalogueDescriptions(): DescriptionMismatch[] {
  const mismatches: DescriptionMismatch[] = [];
  
  // Read from the most recent exercise seed migration
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260909110000_fix_separator_safety_rules.sql"
  );

  const exercises = parseExercisesFromMigration(migrationPath);
  
  for (const exercise of exercises) {
    const issues = auditExercise(exercise);
    if (issues.length > 0) {
      mismatches.push({
        ...exercise,
        issues,
      });
    }
  }

  return mismatches;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const mismatches = auditCatalogueDescriptions();

  if (mismatches.length === 0) {
    console.log("✓ All exercise descriptions are correct!");
    process.exit(0);
  }

  console.log(`Found ${mismatches.length} exercises with description issues:\n`);
  
  for (const mismatch of mismatches) {
    console.log(`${mismatch.slug} (${mismatch.name})`);
    console.log(`  Current cue: "${mismatch.cue}"`);
    console.log(`  Pattern: ${mismatch.movement_pattern}, Mechanic: ${mismatch.mechanic}`);
    console.log(`  Issues:`);
    for (const issue of mismatch.issues) {
      console.log(`    - ${issue}`);
    }
    console.log();
  }

  process.exit(1);
}
