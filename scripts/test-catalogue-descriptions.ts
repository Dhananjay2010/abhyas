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
      if (msg.includes('role "anon"') || msg.includes('breathing_') || msg.includes('raw_user_meta_data') || msg.includes('how_to') || msg.includes('subtitle')) {
      } else {
        throw err;
      }
    }
  }
  console.log('Main migrations applied.\n');
  
  const migrationSql = readFileSync(join(migrationsDir, '20261025000011_catalogue_descriptions.sql'), 'utf-8');
  
  console.log('Test 0: Validating SQL statement safety...\n');
  
  const statements = migrationSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const stmt of statements) {
    const upperStmt = stmt.toUpperCase();
    const firstLine = stmt.split('\n')[0].toUpperCase();
    
    if (firstLine.startsWith('UPDATE EXERCISES') || upperStmt.startsWith('UPDATE EXERCISES')) {
      if (!/(WHERE|where)\s+(slug|SLUG)\s*=\s*'[^']+'/.test(stmt)) {
        throw new Error(`Un-scoped UPDATE detected: ${stmt.slice(0, 100)}...`);
      }
      if (!/(cue|CUE|impact|IMPACT|type|TYPE)\s*=/.test(stmt)) {
        throw new Error(`UPDATE without proper constraint: ${stmt.slice(0, 100)}...`);
      }
    } else if (upperStmt.includes('UPDATE') && !firstLine.startsWith('--')) {
      const cleanStmt = stmt.replace(/--[^\n]*\n/g, '');
      if (cleanStmt.toUpperCase().includes('UPDATE') && !cleanStmt.toUpperCase().startsWith('UPDATE EXERCISES') && !cleanStmt.toUpperCase().startsWith('UPDATE WARMUP')) {
        throw new Error(`Non-exercises/warmup UPDATE detected: ${stmt.slice(0, 100)}...`);
      }
    }
  }
  
  console.log(`  ✅ All ${statements.length} statements are properly scoped\n`);
  
  console.log('Test 1: Capturing pre-migration upper-body cues...\n');
  
  const upperBodyExercises = await db.query<{slug: string; cue: string; category: string; movement_pattern: string}>(
    `SELECT slug, cue, category, movement_pattern FROM exercises 
     WHERE movement_pattern IN ('horizontal_press', 'vertical_press', 'horizontal_pull', 'vertical_pull', 'biceps', 'triceps', 'lateral_delt', 'rear_delt', 'forearm', 'neck')`
  );
  
  const upperBodyCues = new Map(upperBodyExercises.rows.map(r => [r.slug, r.cue]));
  console.log(`  Captured ${upperBodyCues.size} upper-body cues\n`);
  
  console.log('Test 2: Running migration (first pass)...\n');
  
  await db.exec(migrationSql);
  
  console.log(`  ✅ Migration applied successfully\n`);
  
  console.log('Test 3: Running migration (second pass - idempotency)...\n');
  
  await db.exec(migrationSql);
  
  console.log('  ✅ Migration is idempotent (no errors on second run)\n');
  
  console.log('Test 4: Validating upper-body cues unchanged...\n');
  
  const upperBodyAfter = await db.query<{slug: string; cue: string}>(
    `SELECT slug, cue FROM exercises WHERE slug = ANY($1)`,
    [Array.from(upperBodyCues.keys())]
  );
  
  let unchangedCount = 0;
  let changedCount = 0;
  
  for (const row of upperBodyAfter.rows) {
    const before = upperBodyCues.get(row.slug);
    if (before !== row.cue) {
      console.log(`  ❌ ${row.slug}: cue changed`);
      console.log(`     Before: "${before}"`);
      console.log(`     After:  "${row.cue}"`);
      changedCount++;
    } else {
      unchangedCount++;
    }
  }
  
  if (changedCount > 0) {
    throw new Error(`${changedCount} upper-body cues were modified`);
  }
  
  console.log(`  ✅ All ${unchangedCount} upper-body push/pull cues are byte-identical\n`);
  
  console.log('Test 5: Validating changed cues match builder output...\n');
  
  const changedExercises = await db.query<{
    slug: string;
    cue: string;
    mechanic: string | null;
    movement_pattern: string | null;
    primary_muscles: string;
    equipment_ids: string;
  }>(
    `SELECT slug, cue, mechanic, movement_pattern, primary_muscles, equipment_ids FROM exercises 
     WHERE movement_pattern IN ('squat', 'hinge', 'lunge', 'calf', 'core', 'cardio', 'other', 'carry')`
  );
  
  const ALL_EQUIPMENT_IDS = Object.keys(EQUIPMENT_LABEL);
  let validationErrors = 0;
  
  for (const ex of changedExercises.rows) {
    const errors: string[] = [];
    
    if (ex.cue.includes('_')) {
      errors.push('underscore');
    }
    
    if (ALL_EQUIPMENT_IDS.some(id => ex.cue.includes(id))) {
      errors.push('raw equipment ID');
    }
    
    if (!/^[A-Z]/.test(ex.cue)) {
      errors.push('not capitalized');
    }
    
    const primaryMusclesArray = ex.primary_muscles
      .replace(/[{}]/g, '')
      .split(',')
      .filter(m => m.length > 0);
    
    const expectedCue = buildCue({
      mechanic: ex.mechanic,
      pattern: ex.movement_pattern,
      primaryMuscles: primaryMusclesArray,
      equipment: ex.equipment,
    });
    
    if (ex.cue !== expectedCue) {
      errors.push(`cue mismatch`);
      console.log(`  ❌ ${ex.slug}:`);
      console.log(`     Expected: "${expectedCue}"`);
      console.log(`     Got:      "${ex.cue}"`);
    }
    
    if (errors.length > 0 && !errors.includes('cue mismatch')) {
      console.log(`  ❌ ${ex.slug}: ${errors.join(', ')}`);
      validationErrors++;
    } else if (errors.includes('cue mismatch')) {
      validationErrors++;
    }
  }
  
  if (validationErrors > 0) {
    throw new Error(`${validationErrors} exercises have invalid cues`);
  }
  
  console.log(`  ✅ All ${changedExercises.rows.length} changed cues match builder output\n`);
  
  console.log('Test 6: Verifying critical fixes...\n');
  
  const barbell = await db.query<{cue: string}>('SELECT cue FROM exercises WHERE slug = \'barbell-squat\'');
  if (!barbell.rows[0] || !/^Compound squat movement targeting quads\./i.test(barbell.rows[0].cue)) {
    throw new Error('barbell-squat not fixed correctly');
  }
  console.log(`  ✅ barbell-squat: "${barbell.rows[0].cue}"`);
  
  const cable = await db.query<{cue: string}>('SELECT cue FROM exercises WHERE slug = \'cable-judo-flip\'');
  if (!cable.rows[0] || !/^Compound core movement targeting abs\./i.test(cable.rows[0].cue)) {
    throw new Error('cable-judo-flip not fixed correctly');
  }
  console.log(`  ✅ cable-judo-flip: "${cable.rows[0].cue}"\n`);
  
  const isometricChestSqueeze = await db.query<{impact: string}>('SELECT impact FROM exercises WHERE slug = \'isometric-chest-squeezes\'');
  if (!isometricChestSqueeze.rows[0] || isometricChestSqueeze.rows[0].impact !== 'low') {
    throw new Error('isometric-chest-squeezes impact should be low');
  }
  console.log(`  ✅ isometric-chest-squeezes: impact = "${isometricChestSqueeze.rows[0].impact}"\n`);
  
  await db.close();
  
  console.log('=== All Tests Passed ===\n');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
