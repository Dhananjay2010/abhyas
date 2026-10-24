import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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
        // Expected - optional features not in test DB
      } else {
        throw err;
      }
    }
  }
  console.log('Main migrations applied.\n');
  
  const migrationSql = readFileSync(join(migrationsDir, '20261025000011_catalogue_descriptions.sql'), 'utf-8');
  
  // Parse UPDATE statements
  const lines = migrationSql.split('\n');
  const updateStatements: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('UPDATE ')) {
      let stmt = lines[i];
      // Continue collecting until we hit a semicolon
      while (i < lines.length && !stmt.includes(';')) {
        i++;
        stmt += '\n' + lines[i];
      }
      updateStatements.push(stmt);
    }
  }
  
  console.log(`Test 1: Running ${updateStatements.length} UPDATE statements (first pass)...\n`);
  
  let totalFirstRun = 0;
  let failedStatements = 0;
  
  for (const stmt of updateStatements) {
    const result = await db.exec(stmt);
    const affected = result[0]?.affectedRows ?? 0;
    totalFirstRun += affected;
    
    if (affected !== 1) {
      failedStatements++;
      if (failedStatements <= 5) {
        const slugMatch = stmt.match(/slug = '([^']+)'/);
        console.log(`  Statement for ${slugMatch?.[1] || 'unknown'} matched ${affected} rows`);
      }
    }
  }
  
  if (failedStatements > 0) {
    throw new Error(`${failedStatements} statements did not match exactly 1 row`);
  }
  
  console.log(`  ✅ All ${updateStatements.length} statements matched exactly 1 row each`);
  console.log(`  Total rows changed: ${totalFirstRun}\n`);
  
  // Test 2: Idempotency
  console.log('Test 2: Running migration (second pass - idempotency)...\n');
  
  let totalSecondRun = 0;
  
  for (const stmt of updateStatements) {
    const result = await db.exec(stmt);
    const affected = result[0]?.affectedRows ?? 0;
    totalSecondRun += affected;
  }
  
  if (totalSecondRun !== 0) {
    throw new Error(`Second run changed ${totalSecondRun} rows - migration is NOT idempotent!`);
  }
  
  console.log('  ✅ Migration is idempotent (0 rows changed on second run)\n');
  
  // Test 3: Validate cues
  console.log('Test 3: Validating cue quality...\n');
  
  const changedSlugs = updateStatements
    .map(stmt => stmt.match(/slug = '([^']+)'/)?.[1])
    .filter((slug): slug is string => slug !== undefined);
  
  const RAW_EQUIPMENT_IDS = ['adjustable_bench', 'pull_up_bar', 'ez_bar', 'stability_ball', 'squat_rack', 'cable_machine'];
  
  const changedExercises = await db.query<{slug: string; cue: string; primary_muscles: string}>(
    `SELECT slug, cue, primary_muscles FROM exercises WHERE slug = ANY($1)`,
    [changedSlugs]
  );
  
  let validationErrors = 0;
  
  for (const ex of changedExercises.rows) {
    const errors: string[] = [];
    
    if (ex.cue.includes('_')) errors.push('underscore');
    if (RAW_EQUIPMENT_IDS.some(id => ex.cue.includes(id))) errors.push('raw equipment ID');
    if (!/^[A-Z]/.test(ex.cue)) errors.push('not capitalized');
    
    const muscleMatch = ex.cue.match(/targeting ([^.]+)\./);
    if (muscleMatch) {
      const muscles = muscleMatch[1].split(',');
      const primaryMusclesArray = ex.primary_muscles.replace(/[{}]/g, '').split(',');
      const expectedCount = Math.min(3, primaryMusclesArray.length);
      if (muscles.length !== expectedCount) {
        errors.push(`wrong muscle count (${muscles.length} vs ${expectedCount})`);
      }
    }
    
    if (errors.length > 0) {
      console.log(`  ❌ ${ex.slug}: ${errors.join(', ')}`);
      validationErrors++;
    }
  }
  
  if (validationErrors > 0) {
    throw new Error(`${validationErrors} exercises have invalid cues`);
  }
  
  console.log(`  ✅ All ${changedExercises.rows.length} changed cues passed validation\n`);
  
  // Test 4: Check critical slugs
  console.log('Test 4: Verifying critical fixes...\n');
  
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
  
  await db.close();
  
  console.log('=== All Tests Passed ===\n');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
