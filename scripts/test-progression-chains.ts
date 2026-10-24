import { readFileSync } from 'fs';
import { join } from 'path';
import { BODYWEIGHT_CHAINS, nextVariation, findNonBodyweightSlugs } from '../src/lib/program/variations.js';

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

const firstElementResult: string | null = nextVariation('bridge', 'butt-lift-bridge');
if (firstElementResult !== 'single-leg-glute-bridge') {
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

// Test 3: Use the exported validator
console.log('\n3. Bodyweight-only validation using findNonBodyweightSlugs');
const nonBodyweight: string[] = findNonBodyweightSlugs(BODYWEIGHT_CHAINS, catalogue);
if (nonBodyweight.length > 0) {
  console.error(`  FAIL found non-bodyweight exercises: ${nonBodyweight.join(', ')}`);
  pass = false;
} else {
  console.log(`  ok   all chain exercises are bodyweight-only (no equipment)`);
}

// Test 4: Negative test - synthetic chain with barbell-squat
console.log('\n4. Negative test for equipment detection');
const syntheticChains: Readonly<Record<string, readonly string[]>> = {
  "test-chain": ["barbell-squat"]
};
const syntheticNonBodyweight: string[] = findNonBodyweightSlugs(syntheticChains, catalogue);
if (syntheticNonBodyweight.length !== 1 || syntheticNonBodyweight[0] !== 'barbell-squat') {
  console.error(`  FAIL synthetic chain should detect barbell-squat, got ${JSON.stringify(syntheticNonBodyweight)}`);
  pass = false;
} else {
  console.log(`  ok   findNonBodyweightSlugs correctly detects barbell-squat in synthetic chain`);
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

// Test 6: Unknown slug throws error
console.log('\n6. Unknown slug error handling');
const syntheticChainsWithUnknown: Readonly<Record<string, readonly string[]>> = {
  "test-chain": ["pushups", "this-slug-does-not-exist-xyz"]
};

let threwError = false;
let errorMessage = '';

try {
  findNonBodyweightSlugs(syntheticChainsWithUnknown, catalogue);
} catch (err) {
  threwError = true;
  errorMessage = (err instanceof Error) ? err.message : String(err);
}

if (!threwError) {
  console.error(`  FAIL findNonBodyweightSlugs should throw on unknown slug`);
  pass = false;
} else if (!errorMessage.includes('this-slug-does-not-exist-xyz') || !errorMessage.includes('not found')) {
  console.error(`  FAIL error message should contain slug name and "not found", got: "${errorMessage}"`);
  pass = false;
} else {
  console.log(`  ok   findNonBodyweightSlugs throws on unknown slug`);
  console.log(`  ok   error message contains slug name and "not found"`);
}

if (pass) {
  console.log('\n✅ All progression chain checks passed!\n');
  process.exit(0);
} else {
  console.error('\n❌ Some checks failed\n');
  process.exit(1);
}
