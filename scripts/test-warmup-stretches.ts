import { readFileSync } from 'fs';
import { join } from 'path';

let pass = true;

console.log('\n=== Warmup Stretches Tests ===\n');

interface WarmupExercise {
  slug: string;
  name: string;
  type: string;
}

const warmups: WarmupExercise[] = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/warmups.json'), 'utf-8')
);

// All warmup exercises with type='stretch' should be static holds (not dynamic movements)
// Dynamic movements should be type='mobility'
const staticOnlyStretches: string[] = [
  'child-pose',
  'seated-hamstring-stretch',
  'standing-quad-stretch',
  'calf-stretch-wall',
  'chest-doorway-stretch',
  'shoulder-crossbody-stretch',
  'tricep-overhead-stretch',
  'hip-flexor-lunge-stretch',
  'seated-spinal-twist',
  'supine-figure-four'
];

const dynamicMobilityMoves: string[] = [
  'cat-cow-stretch',
  'arm-circles',
  'leg-swings-forward-back',
  'leg-swings-side-to-side',
  'hip-circles'
];

console.log('Validating warmup stretch types:\n');

let allCorrect = true;

for (const warmup of warmups) {
  if (warmup.type === 'stretch') {
    if (dynamicMobilityMoves.includes(warmup.slug)) {
      console.error(`  FAIL '${warmup.slug}' is type='stretch' but should be 'mobility' (dynamic movement)`);
      allCorrect = false;
      pass = false;
    }
  }
}

const catCow: WarmupExercise | undefined = warmups.find(w => w.slug === 'cat-cow-stretch');
if (!catCow) {
  console.error(`  FAIL cat-cow-stretch not found`);
  pass = false;
  allCorrect = false;
} else if (catCow.type !== 'mobility') {
  console.error(`  FAIL cat-cow-stretch type is '${catCow.type}', should be 'mobility'`);
  pass = false;
  allCorrect = false;
} else {
  console.log(`  ok   cat-cow-stretch is type='mobility' (dynamic movement)`);
}

if (allCorrect && pass) {
  console.log(`  ok   all warmup stretches have correct types (static vs dynamic)`);
}

if (pass) {
  console.log('\n✅ All warmup stretches are correctly typed!\n');
  process.exit(0);
} else {
  console.error('\n❌ Some checks failed\n');
  process.exit(1);
}
