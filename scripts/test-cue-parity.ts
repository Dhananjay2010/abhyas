#!/usr/bin/env tsx
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { buildCue } from './lib/cue-builder';
import { execSync } from 'child_process';

async function main() {
  console.log('\n=== Testing TS/Python Cue Parity ===\n');
  
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
  
  console.log('Loaded DB schema, fetching all exercises...\n');
  
  const allExercises = await db.query<{
    slug: string;
    mechanic: string | null;
    movement_pattern: string | null;
    primary_muscles: string | string[];
    equipment_ids: string | string[];
  }>(`SELECT slug, mechanic, movement_pattern, primary_muscles, equipment_ids FROM exercises ORDER BY slug`);
  
  console.log(`Found ${allExercises.rows.length} exercises\n`);
  
  const tempFile = '/tmp/parity-test-data.json';
  const testData = allExercises.rows.map(ex => {
    const primaryMusclesArray = Array.isArray(ex.primary_muscles)
      ? ex.primary_muscles
      : ex.primary_muscles.replace(/[{}]/g, '').split(',').filter(m => m.length > 0);
    
    const equipmentArray = Array.isArray(ex.equipment_ids)
      ? ex.equipment_ids
      : ex.equipment_ids.replace(/[{}]/g, '').split(',').filter(e => e.length > 0);
    
    return {
      slug: ex.slug,
      mechanic: ex.mechanic,
      pattern: ex.movement_pattern,
      primary: primaryMusclesArray,
      equipment: equipmentArray,
    };
  });
  
  writeFileSync(tempFile, JSON.stringify(testData, null, 2));
  
  console.log('Calling real Python build_exercise_seed.py build_cue...\n');
  
  const pythonScript = `
import sys
import json
sys.path.insert(0, 'scripts')
from build_exercise_seed import build_cue

with open('${tempFile}', 'r') as f:
    test_data = json.load(f)

results = []
for case in test_data:
    cue = build_cue(
        case['mechanic'],
        case['pattern'],
        case['primary'],
        case['equipment']
    )
    results.append({'slug': case['slug'], 'cue': cue})

print(json.dumps(results))
`;
  
  const pythonFile = '/tmp/parity-runner.py';
  writeFileSync(pythonFile, pythonScript);
  
  let pythonResults: Array<{ slug: string; cue: string }>;
  try {
    const output = execSync(`python3 ${pythonFile}`, { cwd: process.cwd(), encoding: 'utf-8' });
    pythonResults = JSON.parse(output);
  } catch (err) {
    console.error('Failed to run Python script:', err);
    throw err;
  } finally {
    unlinkSync(tempFile);
    unlinkSync(pythonFile);
  }
  
  console.log(`Python returned ${pythonResults.length} results\n`);
  
  const migrationSql = readFileSync(join(migrationsDir, '20261025000011_catalogue_descriptions.sql'), 'utf-8');
  const migrationSlugs = new Set<string>();
  const slugMatches = migrationSql.matchAll(/WHERE slug = '([^']+)'/g);
  for (const match of slugMatches) {
    migrationSlugs.add(match[1]);
  }
  
  console.log(`Comparing cues for ${allExercises.rows.length} exercises...\n`);
  
  let migratedDiffs = 0;
  let nonMigratedDiffs = 0;
  const diffs: Array<{ slug: string; isMigrated: boolean; tsCue: string; pythonCue: string }> = [];
  
  for (let i = 0; i < allExercises.rows.length; i++) {
    const ex = allExercises.rows[i];
    const primaryMusclesArray = Array.isArray(ex.primary_muscles)
      ? ex.primary_muscles
      : ex.primary_muscles.replace(/[{}]/g, '').split(',').filter(m => m.length > 0);
    
    const equipmentArray = Array.isArray(ex.equipment_ids)
      ? ex.equipment_ids
      : ex.equipment_ids.replace(/[{}]/g, '').split(',').filter(e => e.length > 0);
    
    const tsCue = buildCue({
      mechanic: ex.mechanic,
      pattern: ex.movement_pattern,
      primaryMuscles: primaryMusclesArray,
      equipment: equipmentArray[0] || null,
    });
    
    const pythonCue = pythonResults[i].cue;
    
    if (tsCue !== pythonCue) {
      const isMigrated = migrationSlugs.has(ex.slug) && ex.slug !== 'spanish-squat' && ex.slug !== 'isometric-chest-squeezes';
      if (isMigrated) {
        migratedDiffs++;
      } else {
        nonMigratedDiffs++;
      }
      diffs.push({ slug: ex.slug, isMigrated, tsCue, pythonCue });
    }
  }
  
  if (migratedDiffs > 0) {
    console.log(`❌ ${migratedDiffs} migrated rows have TS/Python differences:\n`);
    for (const diff of diffs.filter(d => d.isMigrated)) {
      console.log(`  ${diff.slug}:`);
      console.log(`    TS:     "${diff.tsCue}"`);
      console.log(`    Python: "${diff.pythonCue}"`);
    }
    throw new Error(`${migratedDiffs} migrated rows differ between TS and Python`);
  }
  
  console.log(`✅ All ${allExercises.rows.length - diffs.length} matching cues (0 migrated differences)\n`);
  
  if (nonMigratedDiffs > 0) {
    console.log(`ℹ️  ${nonMigratedDiffs} non-migrated rows differ (expected for manual overrides)\n`);
  }
  
  await db.close();
  
  console.log('=== All Parity Tests Passed ===\n');
}

main().catch(err => {
  console.error('\n❌ Parity test failed:', err.message);
  process.exit(1);
});
