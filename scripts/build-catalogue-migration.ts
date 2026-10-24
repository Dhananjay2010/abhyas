import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const MUSCLE_LABEL: Record<string, string> = {
  'abs': 'abs', 'obliques': 'obliques', 'chest': 'chest', 'lats': 'lats',
  'upper_back': 'upper back', 'lower_back': 'lower back', 'traps': 'traps',
  'front_delts': 'front delts', 'side_delts': 'side delts',
  'rear_delts': 'rear delts', 'biceps': 'biceps', 'triceps': 'triceps',
  'forearms': 'forearms', 'glutes': 'glutes', 'quads': 'quads',
  'hamstrings': 'hamstrings', 'calves': 'calves', 'hip_flexors': 'hip flexors',
  'adductors': 'adductors', 'abductors': 'abductors', 'neck': 'neck',
};

const EQUIPMENT_LABEL: Record<string, string> = {
  'barbell': 'Barbell', 'dumbbell': 'Dumbbells', 'cable_machine': 'Cable machine',
  'kettlebell': 'Kettlebell', 'resistance_band': 'Bands', 'ez_bar': 'EZ bar',
  'machine_generic': 'Machine', 'leg_press': 'Leg press', 'hack_squat': 'Hack squat',
  'leg_curl': 'Leg curl', 'leg_extension': 'Leg extension',
  'lat_pulldown': 'Lat pulldown', 'pec_deck': 'Pec deck',
  'chest_press_machine': 'Chest press', 'seated_row_machine': 'Seated row',
  'smith_machine': 'Smith machine', 'pull_up_bar': 'Pull-up bar',
  'dip_bars': 'Dip bars', 'flat_bench': 'Bench', 'adjustable_bench': 'Bench',
  'squat_rack': 'Rack', 'medicine_ball': 'Medicine ball',
  'stability_ball': 'Stability ball', 'foam_roller': 'Foam roller',
  'jump_rope': 'Jump rope', 'ab_wheel': 'Ab wheel',
};

function buildCue(mechanic: string | null, pattern: string, primaryMuscles: string[], equipment: string[]): string {
  const bits: string[] = [];
  
  if (mechanic) {
    bits.push(mechanic.charAt(0).toUpperCase() + mechanic.slice(1));
  }
  
  // Never output meaningless patterns
  const patternWord = pattern.replace(/_/g, ' ');
  const isMeaninglessPattern = 
    pattern === 'other' ||
    pattern === 'static' ||
    (primaryMuscles.length > 0 && primaryMuscles[0] === pattern);  // e.g. "biceps movement targeting biceps"
  
  if (!isMeaninglessPattern) {
    bits.push(`${patternWord} movement`);
  }
  
  const head = bits.length > 0 ? bits.join(' ') : 'Exercise';
  
  // Up to 3 muscles
  const muscleLabels = primaryMuscles.slice(0, 3).map(m => MUSCLE_LABEL[m] || m.replace(/_/g, ' '));
  const muscleStr = muscleLabels.join(', ');
  
  // Equipment with human labels, de-duplicated
  const equipLabels = [...new Set(equipment.map(e => EQUIPMENT_LABEL[e] || e))];
  const kitStr = equipLabels.join(', ');
  
  let out = muscleStr ? `${head} targeting ${muscleStr}.` : `${head}.`;
  if (kitStr) {
    out = `${out} ${kitStr}.`;
  }
  
  // Ensure first letter is capitalized
  if (out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  
  return out;
}

function sqlEscape(str: string): string {
  return str.replace(/'/g, "''");
}

function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(String);
  }
  if (typeof val === 'string') {
    const match = val.match(/^\{(.+)\}$/);
    if (match) {
      return match[1].split(',').map(s => s.trim().replace(/^"(.+)"$/, '$1'));
    }
  }
  return [];
}

async function main() {
  console.log('\n=== Building Catalogue Migration from DB State ===\n');
  
  const db = await PGlite.create();
  
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid; $$ LANGUAGE SQL;
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END$$;
  `);
  
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && f !== '20261025000011_catalogue_descriptions.sql')
    .sort();
  
  console.log(`Applying ${migrationFiles.length} main migrations...`);
  
  for (const file of migrationFiles) {
    let sql = readFileSync(join(migrationsDir, file), 'utf-8');
    sql = sql.replace(/grant .* on schema auth to .*;/gi, '');
    sql = sql.replace(/grant .* on all tables in schema auth to .*;/gi, '');
    sql = sql.replace(/alter table if exists auth\.\w+ .*/gi, '');
    
    try {
      await db.exec(sql);
    } catch (err) {
      console.warn(`Warning: ${file} failed (continuing):`, (err instanceof Error) ? err.message : String(err));
    }
  }
  console.log('All migrations applied.\n');
  
  const EXCLUDED_SLUGS = new Set([
    'catch-and-overhead-throw', 'straight-arm-dumbbell-pullover',
    'double-kettlebell-snatch', 'one-arm-kettlebell-snatch', 'one-arm-kettlebell-split-snatch',
    'two-arm-kettlebell-clean', 'external-rotation', 'band-assisted-external-rotation',
    'cable-external-rotation', 'cable-internal-rotation', 'butterfly', 'dumbbell-raise',
    'front-raise-and-pullover', 'wide-grip-decline-barbell-pullover', 'standing-two-arm-overhead-throw',
    'box-squat', 'leg-extensions', 'single-leg-leg-extension'
  ]);
  
  // Only rewrite cues where push/pull is actually WRONG: lower-body, core, cardio, other
  const PATTERNS_TO_FIX = new Set(['squat', 'lunge', 'hinge', 'calf', 'core', 'cardio', 'other']);
  
  const result = await db.query<{
    slug: string;
    name: string;
    movement_pattern: string;
    mechanic: string | null;
    cue: string;
    primary_muscles: unknown;
    equipment_ids: unknown;
  }>(
    `SELECT slug, name, movement_pattern, mechanic, cue, primary_muscles, equipment_ids
     FROM exercises
     WHERE (cue LIKE '%push movement%' OR cue LIKE '%pull movement%')
     ORDER BY slug`
  );
  
  console.log(`Found ${result.rows.length} exercises with push/pull terminology\n`);
  
  type CategoryUpdate = { slug: string; name: string; oldCue: string; newCue: string };
  const updatesByCategory: Record<string, CategoryUpdate[]> = {
    'squat': [],
    'lunge': [],
    'hinge': [],
    'calf': [],
    'core': [],
    'cardio': [],
    'other': [],
    'upper_body_untouched': []
  };
  
  for (const row of result.rows) {
    if (EXCLUDED_SLUGS.has(row.slug)) {
      console.log(`  Skipping ${row.slug} (excluded)`);
      continue;
    }
    
    if (!PATTERNS_TO_FIX.has(row.movement_pattern)) {
      updatesByCategory['upper_body_untouched'].push({
        slug: row.slug,
        name: row.name,
        oldCue: row.cue,
        newCue: row.cue  // unchanged
      });
      continue;
    }
    
    const primaryMuscles = parseArray(row.primary_muscles);
    const equipmentIds = parseArray(row.equipment_ids);
    
    const newCue = buildCue(row.mechanic, row.movement_pattern, primaryMuscles, equipmentIds);
    
    const category = row.movement_pattern;
    if (!updatesByCategory[category]) {
      updatesByCategory[category] = [];
    }
    
    updatesByCategory[category].push({
      slug: row.slug,
      name: row.name,
      oldCue: row.cue,
      newCue
    });
  }
  
  const totalUpdates = Object.values(updatesByCategory)
    .filter(updates => updates.length > 0 && updates !== updatesByCategory['upper_body_untouched'])
    .reduce((sum, updates) => sum + updates.length, 0);
  
  console.log(`\nGenerated ${totalUpdates} updates by category:`);
  for (const [category, updates] of Object.entries(updatesByCategory)) {
    if (category === 'upper_body_untouched') {
      console.log(`  - ${category}: ${updates.length} (left unchanged)`);
    } else if (updates.length > 0) {
      console.log(`  - ${category}: ${updates.length}`);
    }
  }
  console.log();
  
  const criticalSlugs = await db.query<{slug: string; name: string; cue: string; movement_pattern: string}>(
    `SELECT slug, name, cue, movement_pattern FROM exercises WHERE slug IN ('barbell-squat', 'cable-judo-flip')`
  );
  
  for (const row of criticalSlugs.rows) {
    console.log(`Critical slug ${row.slug} (${row.movement_pattern}): current cue="${row.cue}"`);
  }
  console.log();
  
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
    '-- Part 4: Lower-Body, Core, Cardio, and Other Exercise Description Fixes',
    '-- ============================================================================',
    ''
  ];
  
  for (const category of ['squat', 'lunge', 'hinge', 'calf', 'core', 'cardio', 'other']) {
    const updates = updatesByCategory[category];
    if (updates && updates.length > 0) {
      for (const update of updates) {
        migrationLines.push(`-- ${update.name}`);
        migrationLines.push(`UPDATE exercises SET cue = '${sqlEscape(update.newCue)}'`);
        migrationLines.push(`WHERE slug = '${update.slug}' AND cue = '${sqlEscape(update.oldCue)}';`);
        migrationLines.push('');
      }
    }
  }
  
  const migrationPath = join(process.cwd(), 'supabase/migrations/20261025000011_catalogue_descriptions.sql');
  writeFileSync(migrationPath, migrationLines.join('\n'));
  
  console.log(`✅ Written migration to ${migrationPath}`);
  console.log(`   Total: ${totalUpdates + 3} updates (3 fixed + ${totalUpdates} cue fixes)\n`);
  
  await db.close();
}

main().catch(console.error);
