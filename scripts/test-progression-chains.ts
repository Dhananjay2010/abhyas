import { readFileSync } from 'fs';
import { join } from 'path';
import { BODYWEIGHT_CHAINS, nextVariation } from '../src/lib/program/variations.js';

let pass = true;

console.log('\n=== Progression Chains Tests ===\n');

// Load catalogue
interface Exercise {
  slug: string;
  name: string;
  equipment_ids?: string[];
}
const catalogue: Exercise[] = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/catalogue.json'), 'utf-8')
);

// Test 1: nextVariation function tests
console.log('1. nextVariation function tests');

const midChainResult: string | null = nextVariation('push-up', 'pushups');
if (midChainResult !== 'push-ups-with-feet-elevated') {
  console.error(`  FAIL mid-chain should return next variation, got ${midChainResult}`);
  pass = false;
} else {
  console.log(`  ok   mid-chain returns next variation`);
}

const endChainResult: string | null = nextVariation('push-up', 'single-arm-push-up');
if (endChainResult !== null) {
  console.error(`  FAIL end of chain should return null, got ${endChainResult}`);
  pass = false;
} else {
  console.log(`  ok   end of chain returns null`);
}

const unknownSlugResult: string | null = nextVariation('push-up', 'nonexistent-slug');
if (unknownSlugResult !== null) {
  console.error(`  FAIL unknown slug should return null, got ${unknownSlugResult}`);
  pass = false;
} else {
  console.log(`  ok   unknown slug returns null`);
}

const unknownChainResult: string | null = nextVariation('unknown-chain', 'some-slug');
if (unknownChainResult !== null) {
  console.error(`  FAIL unknown chain should return null, got ${unknownChainResult}`);
  pass = false;
} else {
  console.log(`  ok   unknown chain returns null`);
}

const firstElementResult: string | null = nextVariation('plank', 'plank');
if (firstElementResult !== 'side-bridge') {
  console.error(`  FAIL first element should return second, got ${firstElementResult}`);
  pass = false;
} else {
  console.log(`  ok   first element returns second`);
}

// Test 2: All chain slugs exist in catalogue
console.log('\n2. Chain slug existence validation');
let allSlugsExist = true;
for (const [chainName, slugs] of Object.entries(BODYWEIGHT_CHAINS)) {
  for (const slug of slugs) {
    const exercise: Exercise | undefined = catalogue.find(ex => ex.slug === slug);
    if (!exercise) {
      console.error(`  FAIL slug '${slug}' in chain '${chainName}' not found in catalogue`);
      allSlugsExist = false;
      pass = false;
    }
  }
}
if (allSlugsExist) {
  console.log(`  ok   all chain slugs exist in catalogue`);
}

// Test 3: All chain exercises are bodyweight-only (no equipment)
console.log('\n3. Bodyweight-only validation');
let allBodyweight = true;
for (const [chainName, slugs] of Object.entries(BODYWEIGHT_CHAINS)) {
  for (const slug of slugs) {
    const exercise: Exercise | undefined = catalogue.find(ex => ex.slug === slug);
    if (exercise) {
      const equipmentIds: string[] = exercise.equipment_ids || [];
      if (equipmentIds.length > 0) {
        console.error(`  FAIL '${slug}' in chain '${chainName}' has equipment: ${JSON.stringify(equipmentIds)}`);
        allBodyweight = false;
        pass = false;
      }
    }
  }
}
if (allBodyweight) {
  console.log(`  ok   all chain exercises are bodyweight-only (no equipment)`);
}

// Test 4: Negative test - barbell-squat should fail bodyweight check
console.log('\n4. Negative test for equipment detection');
const barbellSquat: Exercise | undefined = catalogue.find(ex => ex.slug === 'barbell-squat');
if (!barbellSquat) {
  console.error(`  FAIL barbell-squat not found in catalogue`);
  pass = false;
} else {
  const equipmentIds: string[] = barbellSquat.equipment_ids || [];
  if (equipmentIds.length === 0) {
    console.error(`  FAIL barbell-squat should have equipment but has none`);
    pass = false;
  } else {
    console.log(`  ok   barbell-squat correctly has equipment: ${JSON.stringify(equipmentIds)}`);
  }
}

// Test 5: No empty or single-exercise chains
console.log('\n5. Chain structure validation');
let noShortChains = true;
for (const [chainName, slugs] of Object.entries(BODYWEIGHT_CHAINS)) {
  if (slugs.length < 2) {
    console.error(`  FAIL chain '${chainName}' has only ${slugs.length} exercise(s), minimum is 2`);
    noShortChains = false;
    pass = false;
  }
}
if (noShortChains) {
  console.log(`  ok   no chains with fewer than 2 exercises`);
}

if (pass) {
  console.log('\n✅ All progression chain checks passed!\n');
  process.exit(0);
} else {
  console.error('\n❌ Some checks failed\n');
  process.exit(1);
}
