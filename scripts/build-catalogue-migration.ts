import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

interface Exercise {
  slug: string;
  name: string;
  mechanic: string;
  force: string;
  movement_pattern: string;
  primary_muscles: string[];
  equipment: string[];
  cue: string;
}

async function main() {
  console.log('\n=== Building Catalogue Migration from DB State ===\n');
  
  // Create in-memory database
  const db = await PGlite.create();
  
  // Create auth schema to avoid errors
  await db.exec('CREATE SCHEMA IF NOT EXISTS auth;');
  
  // Apply all migrations in order
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && f !== '20261025000011_catalogue_descriptions.sql')
    .sort();
  
  console.log(`Applying ${migrationFiles.length} migrations...`);
  
  // Create auth schema and stub tables/roles to avoid errors
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT '00000000-0000-0000-0000-000000000000'::uuid;
    $$ LANGUAGE SQL;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
    END$$;
  `);
  
  for (const file of migrationFiles) {
    let sql = readFileSync(join(migrationsDir, file), 'utf-8');
    
    // Skip auth.* operations that aren't needed for exercises table
    sql = sql.replace(/grant .* on schema auth to .*;/gi, '');
    sql = sql.replace(/grant .* on all tables in schema auth to .*;/gi, '');
    sql = sql.replace(/alter table if exists auth\.\w+ .*/gi, '');
    
    try {
      await db.exec(sql);
    } catch (err) {
      console.warn(`Warning: Failed to apply ${file} (continuing anyway):`, (err instanceof Error) ? err.message : String(err));
      // Continue anyway - we only need the exercises table
    }
  }
  console.log('All migrations applied.\n');
  
  // Excluded slugs
  const EXCLUDED_SLUGS = new Set([
    'catch-and-overhead-throw', 'straight-arm-dumbbell-pullover',
    'double-kettlebell-snatch', 'one-arm-kettlebell-snatch', 'one-arm-kettlebell-split-snatch',
    'two-arm-kettlebell-clean', 'external-rotation', 'band-assisted-external-rotation',
    'cable-external-rotation', 'cable-internal-rotation', 'butterfly', 'dumbbell-raise',
    'front-raise-and-pullover', 'wide-grip-decline-barbell-pullover', 'standing-two-arm-overhead-throw',
    // Knee-safe cues from 140600
    'box-squat', 'leg-extensions', 'single-leg-leg-extension'
  ]);
  
  // Query ALL exercises with push/pull cues (not just lower-body)
  const result = await db.query<{
    slug: string;
    name: string;
    movement_pattern: string;
    mechanic: string;
    cue: string;
    primary_muscles: string[];
    equipment_ids: string[];
  }>(
    `SELECT slug, name, movement_pattern, mechanic, cue, primary_muscles, equipment_ids
     FROM exercises
     WHERE (cue LIKE '%push movement%' OR cue LIKE '%pull movement%')
     ORDER BY slug`
  );
  
  console.log(`Found ${result.rows.length} exercises with push/pull terminology\n`);
  
  // Generate UPDATE statements
  const updates: Array<{slug: string; name: string; oldCue: string; newCue: string}> = [];
  
  // Equipment mapping
  const equipMap: Record<string, string> = {
    'barbell': 'Barbell',
    'squat_rack': 'Rack',
    'dumbbell': 'Dumbbells',
    'kettlebell': 'Kettlebell',
    'resistance_band': 'Bands',
    'cable_machine': 'Cable machine',
    'flat_bench': 'Bench',
    'leg_press': 'Leg press',
    'machine_generic': 'Machine',
    'smith_machine': 'Smith machine',
    'medicine_ball': 'Medicine ball',
    'leg_curl': 'Leg curl',
    'smith_machine_generic': 'Smith machine'
  };
  
  // Muscle mapping
  const muscleMap: Record<string, string> = {
    'quads': 'quads',
    'hamstrings': 'hamstrings',
    'glutes': 'glutes',
    'calves': 'calves',
    'lower_back': 'lower back',
    'abs': 'abs'
  };
  
  for (const row of result.rows) {
    if (EXCLUDED_SLUGS.has(row.slug)) {
      console.log(`  Skipping ${row.slug} (excluded)`);
      continue;
    }
    
    // Generate new cue from actual data
    const mechWord = row.mechanic === 'compound' ? 'Compound' : 'Isolation';
    const patternWord = row.movement_pattern; // lowercase
    
    // Get primary muscle - PGlite returns arrays properly
    let muscleStr = 'muscles';
    let muscles: string[] = [];
    const primaryMusclesVal: unknown = row.primary_muscles;
    if (primaryMusclesVal) {
      if (Array.isArray(primaryMusclesVal)) {
        muscles = primaryMusclesVal.map(String);
      } else if (typeof primaryMusclesVal === 'string') {
        // Parse PostgreSQL array format like {quads,hamstrings}
        const match = primaryMusclesVal.match(/^\{(.+)\}$/);
        if (match) {
          muscles = match[1].split(',');
        }
      }
    }
    
    if (muscles.length > 0) {
      const primaryMuscle = muscles[0].trim();
      muscleStr = muscleMap[primaryMuscle] || primaryMuscle.replace(/_/g, ' ');
    }
    
    // Get equipment string
    let equipment = '';
    let equipIds: string[] = [];
    const equipmentIdsVal: unknown = row.equipment_ids;
    if (equipmentIdsVal) {
      if (Array.isArray(equipmentIdsVal)) {
        equipIds = equipmentIdsVal.map(String);
      } else if (typeof equipmentIdsVal === 'string') {
        const match = equipmentIdsVal.match(/^\{(.+)\}$/);
        if (match) {
          equipIds = match[1].split(',');
        }
      }
    }
    
    if (equipIds.length > 0) {
      const equipNames = equipIds.map(id => {
        const cleanId = id.trim().replace(/^"(.+)"$/, '$1');
        return equipMap[cleanId] || cleanId;
      }).filter(Boolean);
      equipment = ` ${equipNames.join(', ')}.`;
    } else {
      equipment = '.';
    }
    
    const newCue = `${mechWord} ${patternWord} movement targeting ${muscleStr}.${equipment}`;
    
    updates.push({
      slug: row.slug,
      name: row.name,
      oldCue: row.cue,
      newCue: newCue.replace(/\.\.$/, '.')  // Fix double periods
    });
  }
  
  console.log(`\nGenerated ${updates.length} updates\n`);
  
  // Also check for barbell-squat, cable-judo-flip explicitly
  const criticalSlugs = await db.query<{slug: string; name: string; cue: string; movement_pattern: string}>(
    `SELECT slug, name, cue, movement_pattern FROM exercises WHERE slug IN ('barbell-squat', 'cable-judo-flip')`
  );
  
  for (const row of criticalSlugs.rows) {
    console.log(`Critical slug ${row.slug}: pattern=${row.movement_pattern}, current cue="${row.cue}"`);
  }
  console.log();
  
  // Write migration file
  const migrationLines: string[] = [
    '-- Catalogue Descriptions Correctness Fixes',
    '-- This migration is idempotent (safe to re-run)',
    '',
    '-- ============================================================================',
    '-- Part 1: Impact Level Fix',
    '-- ============================================================================',
    '',
    "UPDATE exercises SET impact = 'low'",
    "WHERE slug = 'isometric-chest-squeezes' AND impact = 'high';",
    '',
    '-- ============================================================================',
    '-- Part 2: Warmup Type Fix',
    '-- ============================================================================',
    '',
    "UPDATE warmup_exercises SET type = 'mobility'",
    "WHERE slug = 'cat-cow-stretch' AND type = 'stretch';",
    '',
    '-- ============================================================================',
    '-- Part 3: Spanish Squat Cue Enhancement',
    '-- ============================================================================',
    '',
    "UPDATE exercises SET cue = 'Anchor band to sturdy post or rack at knee height. Band behind knees creates forward resistance - controlled squat motion'",
    "WHERE slug = 'spanish-squat' AND cue = 'Band behind knees creates forward resistance - controlled squat motion';",
    '',
    '-- ============================================================================',
    '-- Part 4: Lower-Body Exercise Description Fixes',
    '-- ============================================================================',
    ''
  ];
  
  for (const update of updates) {
    const oldCue = update.oldCue.replace(/'/g, "''");
    const newCue = update.newCue.replace(/'/g, "''");
    
    migrationLines.push(`-- ${update.name}`);
    migrationLines.push(`UPDATE exercises SET cue = '${newCue}'`);
    migrationLines.push(`WHERE slug = '${update.slug}' AND cue = '${oldCue}';`);
    migrationLines.push('');
  }
  
  const migrationPath = join(process.cwd(), 'supabase/migrations/20261025000011_catalogue_descriptions.sql');
  writeFileSync(migrationPath, migrationLines.join('\n'));
  
  console.log(`✅ Written migration to ${migrationPath}`);
  console.log(`   Total: ${updates.length + 3} updates (3 fixed + ${updates.length} cue fixes)\n`);
  
  await db.close();
}

main().catch(console.error);
