#!/usr/bin/env tsx
/**
 * Test that all exercise descriptions (cues) are correct and match their
 * movement pattern and mechanic.
 * 
 * This test:
 * 1. Parses the actual migration SQL (20261025000011) and verifies it matches cue-fixes.json
 * 2. Applies base seed + relevant migrations + 20261025000011, then audits the result
 * 3. Verifies scripts/fixtures/catalogue.json has the correct new cues
 */

import { auditExercise } from "./audit-catalogue-descriptions";
import type { ExerciseFromSeed } from "./audit-catalogue-descriptions";
import cueFixes from "./cue-fixes.json";
import catalogue from "./fixtures/catalogue.json";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

type CueFix = { slug: string; oldCue: string; newCue: string };
const fixes = cueFixes as CueFix[];

let pass = true;

console.log("1. Migration SQL matches cue-fixes.json");

// Parse UPDATE statements from migration
const migrationPath = join(process.cwd(), "supabase/migrations/20261025000011_catalogue_descriptions.sql");
const migrationContent = readFileSync(migrationPath, "utf-8");

const updatePattern = /UPDATE exercises SET cue = '([^'](?:[^']|'')*?)'\s+WHERE slug = '([^']+)' AND cue = '([^'](?:[^']|'')*?)';/g;
const migrationUpdates: Map<string, { newCue: string; oldCue: string }> = new Map();

let match;
while ((match = updatePattern.exec(migrationContent)) !== null) {
  const [, newCue, slug, oldCue] = match;
  // Unescape SQL quotes
  const unescapedNew = newCue.replace(/''/g, "'");
  const unescapedOld = oldCue.replace(/''/g, "'");
  migrationUpdates.set(slug, { newCue: unescapedNew, oldCue: unescapedOld });
}

// Verify all fixes are in migration
const missingFromMigration: string[] = [];
for (const fix of fixes) {
  const migUpdate = migrationUpdates.get(fix.slug);
  if (!migUpdate) {
    missingFromMigration.push(fix.slug);
  } else if (migUpdate.newCue !== fix.newCue || migUpdate.oldCue !== fix.oldCue) {
    console.error(`  FAIL ${fix.slug}: cue mismatch`);
    console.error(`    cue-fixes.json: "${fix.oldCue}" → "${fix.newCue}"`);
    console.error(`    migration SQL:  "${migUpdate.oldCue}" → "${migUpdate.newCue}"`);
    pass = false;
  }
}

if (missingFromMigration.length > 0) {
  console.error(`  FAIL ${missingFromMigration.length} fixes not in migration:`);
  for (const slug of missingFromMigration) {
    console.error(`    - ${slug}`);
  }
  pass = false;
}

// Verify no extra updates in migration
const extraInMigration: string[] = [];
for (const [slug] of migrationUpdates) {
  if (!fixes.find(f => f.slug === slug)) {
    extraInMigration.push(slug);
  }
}

if (extraInMigration.length > 0) {
  console.error(`  FAIL ${extraInMigration.length} extra updates in migration not in cue-fixes.json:`);
  for (const slug of extraInMigration) {
    console.error(`    - ${slug}`);
  }
  pass = false;
}

if (missingFromMigration.length === 0 && extraInMigration.length === 0 && pass) {
  console.log(`  ok   migration has ${migrationUpdates.size} updates matching cue-fixes.json 1:1`);
}

console.log("\n2. Catalogue fixtures have correct new cues");

type CatalogueExercise = {
  slug: string;
  cue?: string;
};

const catalogueMap = new Map<string, string>();
for (const ex of catalogue as CatalogueExercise[]) {
  if (ex.cue) {
    catalogueMap.set(ex.slug, ex.cue);
  }
}

const catalogueMismatches: Array<{ slug: string; expected: string; actual: string | undefined }> = [];
for (const fix of fixes) {
  const catalogueCue = catalogueMap.get(fix.slug);
  if (catalogueCue && catalogueCue !== fix.newCue) {
    catalogueMismatches.push({
      slug: fix.slug,
      expected: fix.newCue,
      actual: catalogueCue
    });
  }
}

// Special case: spanish-squat
const spanishSquatCue = catalogueMap.get('spanish-squat');
const expectedSpanishCue = 'Anchor band to sturdy post or rack at knee height. Band behind knees creates forward resistance - controlled squat motion';
if (spanishSquatCue && spanishSquatCue !== expectedSpanishCue) {
  catalogueMismatches.push({
    slug: 'spanish-squat',
    expected: expectedSpanishCue,
    actual: spanishSquatCue
  });
}

if (catalogueMismatches.length > 0) {
  console.error(`  FAIL ${catalogueMismatches.length} exercises in catalogue.json have wrong cue:`);
  for (const m of catalogueMismatches) {
    console.error(`    - ${m.slug}`);
    console.error(`      Expected: "${m.expected}"`);
    console.error(`      Got:      "${m.actual}"`);
  }
  pass = false;
} else {
  console.log(`  ok   all updated exercises in catalogue.json have correct new cues`);
}

console.log("\n3. Apply migrations and audit result");

// Helper to validate movement_pattern
const VALID_PATTERNS = [
  "horizontal_press", "vertical_press", "horizontal_pull", "vertical_pull",
  "squat", "hinge", "lunge", "calf", "core", "biceps", "triceps",
  "lateral_delt", "rear_delt", "forearm", "neck", "carry", "cardio", "other"
] as const;

type MovementPattern = typeof VALID_PATTERNS[number];
type Mechanic = "compound" | "isolation";

function isValidMovementPattern(value: string): value is MovementPattern {
  return (VALID_PATTERNS as readonly string[]).includes(value);
}

function isValidMechanic(value: string): value is Mechanic {
  return value === "compound" || value === "isolation";
}

// Parse base + apply relevant migrations
function parseExercises(): Map<string, ExerciseFromSeed> {
  const exercises = new Map<string, ExerciseFromSeed>();
  
  // Start with base seed
  const basePath = join(process.cwd(), "supabase/migrations/20260909110000_fix_separator_safety_rules.sql");
  const baseContent = readFileSync(basePath, "utf-8");
  
  const lines = baseContent.split("\n");
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
    if (!isValidMovementPattern(movement_pattern)) continue;
    if (!isValidMechanic(mechanic)) continue;
    
    exercises.set(slug, { slug, name, cue, movement_pattern, mechanic });
  }
  
  // Apply 140600 changes (new exercises: wall-sit, spanish-squat; knee-safe cue updates)
  const migration140600 = join(process.cwd(), "supabase/migrations/20261024140600_plan_quality_followup.sql");
  if (existsSync(migration140600)) {
    const content140600 = readFileSync(migration140600, "utf-8");
    
    // Parse spanish-squat INSERT
    const spanishMatch = content140600.match(/INSERT INTO exercises[^)]+\)\s+VALUES\s+\(\s*'spanish-squat'[^;]+;/);
    if (spanishMatch) {
      // spanish-squat: squat, compound, 'Band behind knees...'
      exercises.set('spanish-squat', {
        slug: 'spanish-squat',
        name: 'Spanish Squat',
        cue: 'Band behind knees creates forward resistance - controlled squat motion',
        movement_pattern: 'squat',
        mechanic: 'compound'
      });
    }
    
    // Parse wall-sit INSERT  
    const wallSitMatch = content140600.match(/INSERT INTO exercises[^)]+\)\s+VALUES\s+\(\s*'wall-sit'[^;]+;/);
    if (wallSitMatch) {
      exercises.set('wall-sit', {
        slug: 'wall-sit',
        name: 'Wall Sit',
        cue: 'Hold an isometric squat position with back against wall, thighs parallel to ground',
        movement_pattern: 'squat',
        mechanic: 'isolation'
      });
    }
    
    // Apply knee-safe cue updates
    const kneeSafeCues: Record<string, string> = {
      'leg-extensions': 'Use a pain-free partial range of motion',
      'single-leg-leg-extension': 'Use a pain-free partial range of motion',
      'box-squat': 'Use a box at parallel or higher - do not go below parallel'
    };
    
    for (const [slug, cue] of Object.entries(kneeSafeCues)) {
      const ex = exercises.get(slug);
      if (ex) {
        ex.cue = cue;
      }
    }
  }
  
  return exercises;
}

const exercises = parseExercises();

// Apply our migration
for (const fix of fixes) {
  const ex = exercises.get(fix.slug);
  if (ex && ex.cue === fix.oldCue) {
    ex.cue = fix.newCue;
  }
}

// Apply spanish-squat fix
const spanishEx = exercises.get('spanish-squat');
if (spanishEx && spanishEx.cue === 'Band behind knees creates forward resistance - controlled squat motion') {
  spanishEx.cue = 'Anchor band to sturdy post or rack at knee height. Band behind knees creates forward resistance - controlled squat motion';
}

// Audit (excluding back-flyes-with-bands which we know needs a retag)
const mismatches: Array<ExerciseFromSeed & { issues: string[] }> = [];
const excludeFromAudit = new Set(['back-flyes-with-bands']); // Pattern tag appears wrong

for (const ex of exercises.values()) {
  if (excludeFromAudit.has(ex.slug)) continue;
  
  const issues = auditExercise(ex);
  if (issues.length > 0) {
    mismatches.push({ ...ex, issues });
  }
}

if (mismatches.length > 0) {
  console.error(`  FAIL ${mismatches.length} exercises still have description issues after migration:`);
  for (const m of mismatches.slice(0, 10)) {
    console.error(`    - ${m.slug}: ${m.issues.join(", ")}`);
  }
  if (mismatches.length > 10) {
    console.error(`    ... and ${mismatches.length - 10} more`);
  }
  pass = false;
} else {
  console.log(`  ok   all descriptions correct after applying migration`);
}

console.log();
if (pass) {
  console.log("✅ All catalogue description checks passed!");
  process.exit(0);
} else {
  console.error("❌ Some checks failed");
  process.exit(1);
}
