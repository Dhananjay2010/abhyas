import { readFileSync } from 'fs';
import { join } from 'path';

let pass = true;

console.log('\n=== Catalogue Descriptions Tests ===\n');

// Excluded slugs - exercises where pattern tag appears wrong
export const EXCLUDED_SLUGS = [
  'catch-and-overhead-throw',
  'straight-arm-dumbbell-pullover',
  'double-kettlebell-snatch',
  'one-arm-kettlebell-snatch',
  'one-arm-kettlebell-split-snatch',
  'two-arm-kettlebell-clean',
  'external-rotation',
  'band-assisted-external-rotation',
  'cable-external-rotation',
  'cable-internal-rotation',
  'butterfly',
  'dumbbell-raise',
  'front-raise-and-pullover',
  'wide-grip-decline-barbell-pullover',
  'standing-two-arm-overhead-throw'
];

// Test 1: Parse migration and verify excluded slugs don't appear
console.log('1. Excluded slugs validation');
const migrationPath = join(process.cwd(), 'supabase/migrations/20261025000011_catalogue_descriptions.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

let excludedInMigration = false;
for (const slug of EXCLUDED_SLUGS) {
  if (migrationSQL.includes(`'${slug}'`)) {
    console.error(`  FAIL excluded slug '${slug}' appears in migration`);
    excludedInMigration = true;
    pass = false;
  }
}
if (!excludedInMigration) {
  console.log(`  ok   none of the ${EXCLUDED_SLUGS.length} excluded slugs appear in migration`);
}

// Test 2: Parse migration and verify each slug appears at most once
console.log('\n2. Migration updates each slug at most once');
const slugsUpdated = new Map<string, number>();
const updateMatches = migrationSQL.matchAll(/WHERE slug = '([^']+)'/g);
for (const match of updateMatches) {
  const slug = match[1];
  slugsUpdated.set(slug, (slugsUpdated.get(slug) || 0) + 1);
}

const duplicates = Array.from(slugsUpdated.entries()).filter(([_, count]) => count > 1);
if (duplicates.length > 0) {
  console.error(`  FAIL Multiple updates for same slug: ${duplicates.map(([slug, count]) => `${slug} (${count}x)`).join(', ')}`);
  pass = false;
} else {
  console.log(`  ok   No duplicate slug updates (${slugsUpdated.size} slugs updated)`);
}

// Test 3: Parse migration updates
console.log('\n3. Parse migration and apply to main fixture');

interface Exercise {
  slug: string;
  cue?: string;
  impact?: string;
}

interface WarmupExercise {
  slug: string;
  type: string;
}

// Parse all UPDATE statements from migration
interface Update {
  table: string;
  slug: string;
  field: string;
  newValue: string;
  oldValue: string;
}

const updates: Update[] = [];

// Match exercise cue updates
const cueMatches = migrationSQL.matchAll(/UPDATE exercises SET cue = '([^']+(?:''[^']+)*)'\s+WHERE slug = '([^']+)' AND cue = '([^']+(?:''[^']+)*)'/g);
for (const match of cueMatches) {
  const newCue = match[1].replace(/''/g, "'");
  const slug = match[2];
  const oldCue = match[3].replace(/''/g, "'");
  updates.push({ table: 'exercises', slug, field: 'cue', newValue: newCue, oldValue: oldCue });
}

// Match impact updates
const impactMatches = migrationSQL.matchAll(/UPDATE exercises SET impact = '([^']+)'\s+WHERE slug = '([^']+)' AND impact = '([^']+)'/g);
for (const match of impactMatches) {
  updates.push({ table: 'exercises', slug: match[2], field: 'impact', newValue: match[1], oldValue: match[3] });
}

// Match warmup type updates
const warmupMatches = migrationSQL.matchAll(/UPDATE warmup_exercises SET type = '([^']+)'\s+WHERE slug = '([^']+)' AND type = '([^']+)'/g);
for (const match of warmupMatches) {
  updates.push({ table: 'warmup_exercises', slug: match[2], field: 'type', newValue: match[1], oldValue: match[3] });
}

console.log(`  Parsed ${updates.length} updates from migration`);

// Load main's fixtures
const mainCatalogue: Exercise[] = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/catalogue.json'), 'utf-8')
);
const mainWarmups: WarmupExercise[] = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/warmups.json'), 'utf-8')
);

// Apply updates to main fixture
const updatedCatalogue = JSON.parse(JSON.stringify(mainCatalogue));
const updatedWarmups = JSON.parse(JSON.stringify(mainWarmups));

for (const update of updates) {
  if (update.table === 'exercises') {
    const ex = updatedCatalogue.find((e: Exercise) => e.slug === update.slug);
    if (ex) {
      if (update.field === 'cue') {
        ex.cue = update.newValue;
      } else if (update.field === 'impact') {
        ex.impact = update.newValue;
      }
    }
  } else if (update.table === 'warmup_exercises') {
    const w = updatedWarmups.find((w: WarmupExercise) => w.slug === update.slug);
    if (w) {
      w.type = update.newValue;
    }
  }
}

// Compare with PR fixture - only for exercises that have cue/impact fields in fixture
let fixtureMatches = true;
const fixtureExercisesWithCue = mainCatalogue.filter((e: Exercise) => e.cue !== undefined);
console.log(`  Found ${fixtureExercisesWithCue.length} exercises with cue field in catalogue.json`);

for (const ex of fixtureExercisesWithCue) {
  const updated = updatedCatalogue.find((e: Exercise) => e.slug === ex.slug);
  const pr = mainCatalogue.find((e: Exercise) => e.slug === ex.slug);
  
  if (!updated || !pr) continue;
  
  if (updated.cue !== pr.cue || updated.impact !== pr.impact) {
    console.error(`  FAIL slug '${ex.slug}' fixture doesn't match migration result`);
    if (updated.cue !== pr.cue) {
      console.error(`    cue: "${updated.cue}" vs "${pr.cue}"`);
    }
    if (updated.impact !== pr.impact) {
      console.error(`    impact: "${updated.impact}" vs "${pr.impact}"`);
    }
    fixtureMatches = false;
    pass = false;
  }
}

// Check impact for isometric-chest-squeezes specifically
const isometricChest = mainCatalogue.find((e: Exercise) => e.slug === 'isometric-chest-squeezes');
if (isometricChest && isometricChest.impact !== 'low') {
  console.error(`  FAIL isometric-chest-squeezes impact should be 'low', got '${isometricChest.impact}'`);
  fixtureMatches = false;
  pass = false;
}

// Check warmup
const prCatCow = mainWarmups.find((w: WarmupExercise) => w.slug === 'cat-cow-stretch');
if (prCatCow && prCatCow.type !== 'mobility') {
  console.error(`  FAIL cat-cow-stretch type should be 'mobility', got '${prCatCow.type}'`);
  fixtureMatches = false;
  pass = false;
}

if (fixtureMatches) {
  console.log(`  ok   fixture matches migration for exercises with cue/impact fields`);
  console.log(`  ok   isometric-chest-squeezes has impact='low'`);
  console.log(`  ok   cat-cow-stretch has type='mobility'`);
}

if (pass) {
  console.log('\n✅ All catalogue description checks passed!\n');
  process.exit(0);
} else {
  console.error('\n❌ Some checks failed\n');
  process.exit(1);
}
