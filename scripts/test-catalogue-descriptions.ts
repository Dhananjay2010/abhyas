#!/usr/bin/env tsx
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildCue, EQUIPMENT_LABEL } from './lib/cue-builder';

async function main() {
  console.log('\n=== Testing Catalogue Descriptions Migration ===\n');
  
  const db = await PGlite.create();
  
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$ LANGUAGE SQL;
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END$$;
  `);
  
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  const allMigrations = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const mainMigrations = allMigrations.filter(f => f !== '20261025000011_catalogue_descriptions.sql');
  
  console.log(`Applying ${mainMigrations.length} main migrations...`);
  for (const file of mainMigrations) {
    let sql = readFileSync(join(migrationsDir, file), 'utf-8');
    sql = sql.replace(/grant .* on schema auth to .*;/gi, '');
    sql = sql.replace(/grant .* on all tables in schema auth to .*;/gi, '');
    sql = sql.replace(/alter table if exists auth\.\w+ .*/gi, '');
    try {
      await db.exec(sql);
    } catch (err) {
      const msg = (err instanceof Error) ? err.message : String(err);
      if (!msg.includes('role "anon"') && !msg.includes('breathing_') && !msg.includes('raw_user_meta_data') && !msg.includes('how_to') && !msg.includes('subtitle')) {
        throw err;
      }
    }
  }
  console.log('Main migrations applied.\n');
  
  const migrationSql = readFileSync(join(migrationsDir, '20261025000011_catalogue_descriptions.sql'), 'utf-8');
  
  console.log('Test 1: Extract migration target slugs and count statements...\n');
  
  const migrationSlugs = new Set<string>();
  const slugMatches = migrationSql.matchAll(/WHERE slug = '([^']+)'/g);
  for (const match of slugMatches) {
    migrationSlugs.add(match[1]);
  }
  
  const exercisesStatementCount = migrationSql.split('\n').filter(line => line.trim().toLowerCase().startsWith('update exercises')).length;
  const totalStatementCount = migrationSql.split('\n').filter(line => {
    const trimmed = line.trim().toLowerCase();
    return trimmed.startsWith('update exercises') || trimmed.startsWith('update warmup_exercises');
  }).length;
  
  console.log(`  Found ${migrationSlugs.size} slugs targeted by migration`);
  console.log(`  Found ${exercisesStatementCount} UPDATE exercises statements`);
  console.log(`  Found ${totalStatementCount} total UPDATE statements\n`);
  
  console.log('Test 2: Validate migration safety (must have WHERE slug guards)...\n');
  
  const unsafeStatements = migrationSql.split(/;\s*\n/).filter(stmt => {
    const trimmed = stmt.trim();
    const isExercisesUpdate = trimmed.toLowerCase().startsWith('update exercises');
    const isWarmupUpdate = trimmed.toLowerCase().startsWith('update warmup_exercises');
    if (!isExercisesUpdate && !isWarmupUpdate) return false;
    if (!/WHERE\s+slug\s*=/i.test(trimmed)) return true;
    if (isExercisesUpdate && !/AND\s+cue\s*=/i.test(trimmed)) return true;
    return false;
  });
  
  if (unsafeStatements.length > 0) {
    console.log('  ❌ Found unsafe statements:');
    unsafeStatements.forEach(s => console.log(`     ${s.substring(0, 100)}...`));
    throw new Error('Migration contains unsafe UPDATE statements');
  }
  
  console.log(`  ✅ All ${totalStatementCount} statements have slug/cue or slug/type guards\n`);
  
  console.log('Test 3: Pattern check (all migrated slugs must be lower-body/core/cardio/other)...\n');
  
  const targetedExercisePatterns = await db.query<{slug: string; movement_pattern: string | null}>(
    `SELECT slug, movement_pattern FROM exercises WHERE slug = ANY($1)`,
    [Array.from(migrationSlugs).filter(s => s !== 'spanish-squat' && s !== 'isometric-chest-squeezes')]
  );
  
  const allowedPatterns = new Set(['squat', 'lunge', 'hinge', 'calf', 'core', 'cardio', 'other', 'static']);
  const upperBodyPatterns = new Set(['push', 'pull', 'carry']);
  
  let badPatternCount = 0;
  for (const ex of targetedExercisePatterns.rows) {
    if (ex.movement_pattern && upperBodyPatterns.has(ex.movement_pattern)) {
      console.log(`  ❌ ${ex.slug}: pattern="${ex.movement_pattern}" is upper-body`);
      badPatternCount++;
    }
  }
  
  if (badPatternCount > 0) {
    throw new Error(`${badPatternCount} migrated exercises have upper-body patterns`);
  }
  
  console.log(`  ✅ All ${targetedExercisePatterns.rows.length} migrated exercises have allowed patterns\n`);
  
  console.log('Test 4: Capture pre-migration state for ALL exercises...\n');
  
  const allExercisesBefore = await db.query<{slug: string; cue: string; impact: string}>(
    `SELECT slug, cue, impact FROM exercises ORDER BY slug`
  );
  
  const beforeState = new Map(allExercisesBefore.rows.map(r => [r.slug, { cue: r.cue, impact: r.impact }]));
  console.log(`  Captured ${beforeState.size} exercises\n`);
  
  console.log('Test 5: Capture pre-migration warmup exercises...\n');
  
  const warmupBefore = await db.query<{slug: string; type: string}>(
    `SELECT slug, type FROM warmup_exercises WHERE slug = 'cat-cow-stretch'`
  );
  
  const catCowBefore = warmupBefore.rows[0];
  console.log(`  cat-cow-stretch type before: ${catCowBefore?.type || 'not found'}\n`);
  
  console.log('Test 6: Running migration (first pass)...\n');
  
  await db.exec(migrationSql);
  
  console.log(`  ✅ Migration applied successfully\n`);
  
  console.log('Test 7: Running migration (second pass - idempotency)...\n');
  
  await db.exec(migrationSql);
  
  console.log('  ✅ Migration is idempotent (no errors on second run)\n');
  
  console.log('Test 8: Validate exactly N rows changed on first run, 0 on second...\n');
  
  const allExercisesAfterFirst = await db.query<{slug: string; cue: string; impact: string}>(
    `SELECT slug, cue, impact FROM exercises ORDER BY slug`
  );
  
  let changedOnFirstRun = 0;
  for (const row of allExercisesAfterFirst.rows) {
    const before = beforeState.get(row.slug);
    if (before && (before.cue !== row.cue || before.impact !== row.impact)) {
      changedOnFirstRun++;
    }
  }
  
  if (changedOnFirstRun !== exercisesStatementCount) {
    throw new Error(`Expected exactly ${exercisesStatementCount} exercise rows to change on first run, got ${changedOnFirstRun}`);
  }
  
  console.log(`  ✅ Exactly ${changedOnFirstRun} exercise rows changed on first run\n`);
  
  const beforeSecondRun = allExercisesAfterFirst.rows.map(r => ({ slug: r.slug, cue: r.cue, impact: r.impact }));
  
  await db.exec(migrationSql);
  
  const afterSecondRun = await db.query<{slug: string; cue: string; impact: string}>(
    `SELECT slug, cue, impact FROM exercises ORDER BY slug`
  );
  
  let changedOnSecondRun = 0;
  for (let i = 0; i < afterSecondRun.rows.length; i++) {
    if (beforeSecondRun[i].cue !== afterSecondRun.rows[i].cue || beforeSecondRun[i].impact !== afterSecondRun.rows[i].impact) {
      changedOnSecondRun++;
    }
  }
  
  if (changedOnSecondRun !== 0) {
    throw new Error(`Expected 0 rows to change on second run, got ${changedOnSecondRun}`);
  }
  
  console.log(`  ✅ Exactly 0 rows changed on second run (idempotent)\n`);
  
  console.log('Test 9: Validate migration targets match builder output...\n');
  
  const targetedExercises = await db.query<{
    slug: string;
    cue: string;
    mechanic: string | null;
    movement_pattern: string | null;
    primary_muscles: string | string[];
    equipment_ids: string | string[];
  }>(
    `SELECT slug, cue, mechanic, movement_pattern, primary_muscles, equipment_ids 
     FROM exercises 
     WHERE slug = ANY($1)`,
    [Array.from(migrationSlugs).filter(s => s !== 'spanish-squat' && s !== 'isometric-chest-squeezes')]
  );
  
  let mismatchCount = 0;
  
  for (const ex of targetedExercises.rows) {
    const primaryMusclesArray = Array.isArray(ex.primary_muscles)
      ? ex.primary_muscles
      : ex.primary_muscles.replace(/[{}]/g, '').split(',').filter(m => m.length > 0);
    
    const equipmentArray = Array.isArray(ex.equipment_ids)
      ? ex.equipment_ids
      : ex.equipment_ids.replace(/[{}]/g, '').split(',').filter(e => e.length > 0);
    
    const expectedCue = buildCue({
      mechanic: ex.mechanic,
      pattern: ex.movement_pattern,
      primaryMuscles: primaryMusclesArray,
      equipment: equipmentArray[0] || null,
    });
    
    if (ex.cue !== expectedCue) {
      console.log(`  ❌ ${ex.slug}:`);
      console.log(`     Expected: "${expectedCue}"`);
      console.log(`     Got:      "${ex.cue}"`);
      mismatchCount++;
    }
  }
  
  if (mismatchCount > 0) {
    throw new Error(`${mismatchCount} migrated exercises don't match builder output`);
  }
  
  console.log(`  ✅ All ${targetedExercises.rows.length} migrated cues match builder output\n`);
  
  console.log('Test 10: Validate untouched exercises are byte-identical...\n');
  
  const allExercisesAfter = await db.query<{slug: string; cue: string; impact: string}>(
    `SELECT slug, cue, impact FROM exercises ORDER BY slug`
  );
  
  const afterState = new Map(allExercisesAfter.rows.map(r => [r.slug, { cue: r.cue, impact: r.impact }]));
  
  let unchangedCount = 0;
  let changedCount = 0;
  
  for (const [slug, before] of beforeState) {
    if (migrationSlugs.has(slug)) {
      continue;
    }
    
    const after = afterState.get(slug);
    if (!after) {
      console.log(`  ❌ ${slug}: missing after migration`);
      changedCount++;
      continue;
    }
    
    if (before.cue !== after.cue || before.impact !== after.impact) {
      console.log(`  ❌ ${slug}: modified but not in migration target list`);
      console.log(`     Before cue: "${before.cue}"`);
      console.log(`     After cue:  "${after.cue}"`);
      console.log(`     Before impact: "${before.impact}"`);
      console.log(`     After impact:  "${after.impact}"`);
      changedCount++;
    } else {
      unchangedCount++;
    }
  }
  
  if (changedCount > 0) {
    throw new Error(`${changedCount} exercises changed but were not in migration target list`);
  }
  
  console.log(`  ✅ All ${unchangedCount} untouched exercises are byte-identical\n`);
  
  console.log('Test 11: Validate specific fixes...\n');
  
  const isometricChestSqueeze = await db.query<{impact: string}>('SELECT impact FROM exercises WHERE slug = \'isometric-chest-squeezes\'');
  if (!isometricChestSqueeze.rows[0] || isometricChestSqueeze.rows[0].impact !== 'low') {
    throw new Error('isometric-chest-squeezes impact should be low');
  }
  console.log(`  ✅ isometric-chest-squeezes: impact = "${isometricChestSqueeze.rows[0].impact}"`);
  
  const spanishSquat = await db.query<{cue: string}>('SELECT cue FROM exercises WHERE slug = \'spanish-squat\'');
  if (!spanishSquat.rows[0] || !spanishSquat.rows[0].cue.includes('Anchor band to sturdy post')) {
    throw new Error('spanish-squat cue should include setup instructions');
  }
  console.log(`  ✅ spanish-squat: cue enhanced with setup instructions`);
  
  const warmupAfter = await db.query<{type: string}>('SELECT type FROM warmup_exercises WHERE slug = \'cat-cow-stretch\'');
  if (!warmupAfter.rows[0] || warmupAfter.rows[0].type !== 'mobility') {
    throw new Error('cat-cow-stretch type should be mobility');
  }
  console.log(`  ✅ cat-cow-stretch: type = "${warmupAfter.rows[0].type}"\n`);
  
  console.log('Test 12: Validate no bad words in any cue...\n');
  
  const ALL_EQUIPMENT_IDS = Object.keys(EQUIPMENT_LABEL);
  
  const allCues = await db.query<{slug: string; cue: string}>(
    `SELECT slug, cue FROM exercises WHERE slug = ANY($1)`,
    [Array.from(migrationSlugs).filter(s => s !== 'spanish-squat' && s !== 'isometric-chest-squeezes')]
  );
  
  let badWordCount = 0;
  
  for (const row of allCues.rows) {
    const errors: string[] = [];
    
    if (row.cue.includes('_')) {
      errors.push('underscore');
    }
    
    if (ALL_EQUIPMENT_IDS.some(id => row.cue.includes(id))) {
      errors.push('raw equipment ID');
    }
    
    if (!/^[A-Z]/.test(row.cue)) {
      errors.push('not capitalized');
    }
    
    if (/cardio movement/i.test(row.cue)) {
      errors.push('"cardio movement" wording');
    }
    
    if (errors.length > 0) {
      console.log(`  ❌ ${row.slug}: ${errors.join(', ')}`);
      badWordCount++;
    }
  }
  
  if (badWordCount > 0) {
    throw new Error(`${badWordCount} cues have bad words`);
  }
  
  console.log(`  ✅ All ${allCues.rows.length} migrated cues are clean\n`);
  
  await db.close();
  
  console.log('=== All Tests Passed ===\n');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
