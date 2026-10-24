import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('\n=== Testing Catalogue Descriptions Migration ===\n');
  
  const db = await PGlite.create();
  
  // Create auth stub
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$ LANGUAGE SQL;
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END$$;
  `);
  
  // Apply all main migrations
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
    } catch {
      // Continue on errors - we only need the exercises table
    }
  }
  console.log('Main migrations applied.\n');
  
  // Load the catalogue migration
  const migrationSql = readFileSync(join(migrationsDir, '20261025000011_catalogue_descriptions.sql'), 'utf-8');
  
  // Parse SQL into individual statements
  // Each UPDATE statement spans 2 lines: "UPDATE ... SET ..." and "WHERE ...;"
  const lines = migrationSql.split('\n');
  const updateStatements: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toUpperCase().startsWith('UPDATE ')) {
      // Collect lines until we hit a semicolon
      let stmt = line;
      let j = i + 1;
      while (j < lines.length && !stmt.includes(';')) {
        stmt += ' ' + lines[j].trim();
        j++;
      }
      updateStatements.push(stmt.replace(/;$/, ''));
      i = j - 1;
    }
  }
  
  console.log(`Migration has ${updateStatements.length} UPDATE statements\n`);
  
  // Test 1: Each UPDATE must have a WHERE slug clause
  console.log('Test 1: Verifying all UPDATEs have slug filters...');
  for (const stmt of updateStatements) {
    if (!stmt.match(/WHERE\s+slug\s*=/i)) {
      throw new Error(`UPDATE statement lacks slug filter: ${stmt.substring(0, 100)}...`);
    }
  }
  console.log('✅ All UPDATEs have slug filters\n');
  
  // Test 2: Run migration first time - each statement should change exactly 1 row
  console.log('Test 2: Running migration (first pass)...');
  const firstRunResults: number[] = [];
  
  for (const stmt of updateStatements) {
    const result = await db.exec(stmt + ';');
    const rowsAffected = result[0]?.affectedRows ?? 0;
    firstRunResults.push(rowsAffected);
  }
  
  const totalFirstRun = firstRunResults.reduce((a, b) => a + b, 0);
  const statementsWithNoMatch = firstRunResults.filter(r => r === 0).length;
  const statementsWithMultiMatch = firstRunResults.filter(r => r > 1).length;
  
  console.log(`  Total rows changed: ${totalFirstRun}`);
  console.log(`  Statements with 0 rows: ${statementsWithNoMatch}`);
  console.log(`  Statements with >1 rows: ${statementsWithMultiMatch}`);
  
  if (statementsWithMultiMatch > 0) {
    throw new Error(`${statementsWithMultiMatch} statements updated multiple rows - migration is not slug-scoped!`);
  }
  
  if (statementsWithNoMatch > 0) {
    console.log(`  ⚠️  Warning: ${statementsWithNoMatch} statements matched 0 rows (old value may have changed)\n`);
  } else {
    console.log('  ✅ All statements matched exactly 1 row\n');
  }
  
  // Test 3: Run migration second time - should be idempotent (0 rows changed)
  console.log('Test 3: Running migration (second pass - idempotency check)...');
  const secondRunResults: number[] = [];
  
  for (const stmt of updateStatements) {
    const result = await db.exec(stmt + ';');
    const rowsAffected = result[0]?.affectedRows ?? 0;
    secondRunResults.push(rowsAffected);
  }
  
  const totalSecondRun = secondRunResults.reduce((a, b) => a + b, 0);
  
  if (totalSecondRun > 0) {
    throw new Error(`Second run changed ${totalSecondRun} rows - migration is NOT idempotent!`);
  }
  
  console.log('  ✅ Migration is idempotent (0 rows changed on second run)\n');
  
  // Test 4: Verify no lower-body exercises have push/pull cues (except documented exclusions)
  console.log('Test 4: Checking for remaining push/pull terminology in lower-body exercises...');
  
  const excludedSlugs = new Set([
    'catch-and-overhead-throw', 'straight-arm-dumbbell-pullover',
    'double-kettlebell-snatch', 'one-arm-kettlebell-snatch', 'one-arm-kettlebell-split-snatch',
    'two-arm-kettlebell-clean', 'external-rotation', 'band-assisted-external-rotation',
    'cable-external-rotation', 'cable-internal-rotation', 'butterfly', 'dumbbell-raise',
    'front-raise-and-pullover', 'wide-grip-decline-barbell-pullover', 'standing-two-arm-overhead-throw',
    'box-squat', 'leg-extensions', 'single-leg-leg-extension'
  ]);
  
  const badCues = await db.query<{slug: string; cue: string; movement_pattern: string}>(
    `SELECT slug, cue, movement_pattern
     FROM exercises
     WHERE movement_pattern IN ('squat', 'lunge', 'hinge', 'calf')
       AND (cue LIKE '%push movement%' OR cue LIKE '%pull movement%')
     ORDER BY slug`
  );
  
  const unexpectedBadCues = badCues.rows.filter(r => !excludedSlugs.has(r.slug));
  
  if (unexpectedBadCues.length > 0) {
    console.log('  ❌ Found lower-body exercises still using push/pull (excluding documented exceptions):');
    for (const row of unexpectedBadCues.slice(0, 10)) {
      console.log(`    - ${row.slug} (${row.movement_pattern}): "${row.cue}"`);
    }
    if (unexpectedBadCues.length > 10) {
      console.log(`    ... and ${unexpectedBadCues.length - 10} more`);
    }
    throw new Error(`${unexpectedBadCues.length} lower-body exercises still have push/pull cues`);
  }
  
  const excludedCount = badCues.rows.filter(r => excludedSlugs.has(r.slug)).length;
  console.log(`  ✅ No lower-body exercises have push/pull terminology (${excludedCount} documented exclusions)\n`);
  
  // Test 5: Verify critical slugs are fixed
  console.log('Test 5: Verifying critical slug fixes...');
  
  const criticalSlugs = await db.query<{slug: string; cue: string}>(
    `SELECT slug, cue FROM exercises WHERE slug IN ('barbell-squat', 'cable-judo-flip')`
  );
  
  const expected: Record<string, RegExp> = {
    'barbell-squat': /^Compound squat movement targeting quads\./i,
    'cable-judo-flip': /^Compound core movement targeting abs\./i
  };
  
  for (const row of criticalSlugs.rows) {
    const pattern = expected[row.slug];
    if (!pattern) continue;
    
    if (!pattern.test(row.cue)) {
      throw new Error(`${row.slug} has wrong cue: "${row.cue}"`);
    }
    console.log(`  ✅ ${row.slug}: "${row.cue}"`);
  }
  
  if (criticalSlugs.rows.length < 2) {
    throw new Error('Critical slugs not found in database');
  }
  
  console.log();
  
  // Test 6: Verify isometric-chest-squeezes impact
  console.log('Test 6: Verifying isometric-chest-squeezes impact level...');
  const impactCheck = await db.query<{impact: string}>(
    `SELECT impact FROM exercises WHERE slug = 'isometric-chest-squeezes'`
  );
  
  if (impactCheck.rows.length === 0) {
    throw new Error('isometric-chest-squeezes not found');
  }
  
  if (impactCheck.rows[0].impact !== 'low') {
    throw new Error(`isometric-chest-squeezes has impact ${impactCheck.rows[0].impact}, expected low`);
  }
  
  console.log('  ✅ Impact is low\n');
  
  // Test 7: Verify cat-cow-stretch type
  console.log('Test 7: Verifying cat-cow-stretch type...');
  const catCowCheck = await db.query<{type: string}>(
    `SELECT type FROM warmup_exercises WHERE slug = 'cat-cow-stretch'`
  );
  
  if (catCowCheck.rows.length === 0) {
    throw new Error('cat-cow-stretch not found in warmup_exercises');
  }
  
  if (catCowCheck.rows[0].type !== 'mobility') {
    throw new Error(`cat-cow-stretch has type ${catCowCheck.rows[0].type}, expected mobility`);
  }
  
  console.log('  ✅ Type is mobility\n');
  
  await db.close();
  
  console.log('=== All Tests Passed ===\n');
  console.log(`Summary:`);
  console.log(`  - First run: ${totalFirstRun} rows updated`);
  console.log(`  - Second run: ${totalSecondRun} rows updated (idempotent)`);
  console.log(`  - ${updateStatements.length} UPDATE statements`);
  console.log(`  - All critical fixes verified\n`);
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
