import { readFileSync } from 'fs';
import { join } from 'path';

let pass = true;

console.log('\n=== Catalogue Descriptions Tests ===\n');

// Test 1: Parse migration and verify it only updates each slug once
console.log('1. Migration updates each slug at most once');
const migrationPath = join(process.cwd(), 'supabase/migrations/20261025000011_catalogue_descriptions.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

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
  console.log(`  ok   No duplicate slug updates (${slugsUpdated.size} slugs total)`);
}

// Test 2: Parse migration and verify impact fix statement exists and is correct
console.log('\n2. Impact level fix for isometric-chest-squeezes');
const impactFixMatch = migrationSQL.match(/UPDATE exercises SET impact = '([^']+)'\s+WHERE slug = 'isometric-chest-squeezes' AND impact = '([^']+)'/);
if (!impactFixMatch) {
  console.error(`  FAIL Migration does not contain impact fix for isometric-chest-squeezes`);
  pass = false;
} else {
  const [_, newImpact, oldImpact] = impactFixMatch;
  if (newImpact !== 'low') {
    console.error(`  FAIL New impact should be 'low', got '${newImpact}'`);
    pass = false;
  } else if (oldImpact !== 'high') {
    console.error(`  FAIL Old impact guard should be 'high', got '${oldImpact}'`);
    pass = false;
  } else {
    console.log(`  ok   Migration sets impact='low' WHERE impact='high'`);
  }
}

// Test 3: Verify fixture has been updated
console.log('\n3. Fixture has correct impact value');
interface Exercise {
  slug: string;
  name: string;
  impact?: string;
}
const catalogue: Exercise[] = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/catalogue.json'), 'utf-8')
);
const isometricChest = catalogue.find(ex => ex.slug === 'isometric-chest-squeezes');
if (!isometricChest) {
  console.error(`  FAIL isometric-chest-squeezes not found in catalogue.json`);
  pass = false;
} else if (isometricChest.impact !== 'low') {
  console.error(`  FAIL isometric-chest-squeezes impact in fixture is '${isometricChest.impact}', should be 'low'`);
  pass = false;
} else {
  console.log(`  ok   isometric-chest-squeezes has impact='low' in fixture`);
}

if (pass) {
  console.log('\n✅ All catalogue description checks passed!\n');
  process.exit(0);
} else {
  console.error('\n❌ Some checks failed\n');
  process.exit(1);
}
