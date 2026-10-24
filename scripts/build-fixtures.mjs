#!/usr/bin/env node
/**
 * QA Pass 10 M7: Build test fixtures by applying ALL migrations up to 140000,
 * loading base data, then applying 140000-140300.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';

async function main() {
  console.log('Building fixtures with full migration history...');
  
  const db = new PGlite();
  
  // Minimal Supabase stubs
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users(id UUID PRIMARY KEY);
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS $$ SELECT NULL::UUID $$;
  `);
  
  // Get all migrations before 140000
  const allMigrations = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  const preMigrations = allMigrations.filter(f => f < '20261024140000');
  const prMigrations = allMigrations.filter(f => f >= '20261024140000' && f < '20261025000009');
  
  console.log(`Running ${preMigrations.length} migrations before 140000...`);
  
  for (const filename of preMigrations) {
    let sql = readFileSync(`supabase/migrations/${filename}`, 'utf-8');
    
    // Skip or neutralize PGlite-incompatible statements
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '-- skipped uuid-ossp extension');
    sql = sql.replace(/GRANT .*/g, '-- skipped GRANT');
    sql = sql.replace(/ALTER .* OWNER TO .*/g, '-- skipped OWNER');
    sql = sql.replace(/ALTER .* ENABLE ROW LEVEL SECURITY;/g, '-- skipped RLS');
    sql = sql.replace(/CREATE POLICY .*/g, '-- skipped POLICY');
    
    try {
      await db.exec(sql);
      console.log(`  ✓ ${filename}`);
    } catch (err) {
      console.log(`  ! ${filename}: ${err.message.split('\n')[0]}`);
      // Continue anyway - many migrations are safe to skip for fixture building
    }
  }
  
  console.log('\nLoading base data...');
  
  // Don't clear warmup_exercises - they come from migrations, not base data
  await db.exec('DELETE FROM exercises;');
  
  const toArray = (arr) => {
    if (!arr || arr.length === 0) return '{}';
    return `{${arr.map(v => `"${v.replace(/"/g, '\\"')}"`).join(',')}}`;
  };
  
  // Load base catalogue
  const baseCatalogue = JSON.parse(readFileSync('scripts/fixtures/base/catalogue.json', 'utf-8'));
  console.log(`  Inserting ${baseCatalogue.length} exercises...`);
  
  for (const ex of baseCatalogue) {
    const impact = ex.impact === 'medium' ? 'moderate' : ex.impact;
    try {
      await db.query(`
        INSERT INTO exercises (
          id, slug, name, movement_pattern, mechanic, metric,
          primary_muscles, secondary_muscles, equipment_ids, level_min,
          contraindicated_regions, impact, spinal_load, tracks,
          default_rest_seconds, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        ex.id, ex.slug, ex.name, ex.movement_pattern, ex.mechanic, ex.metric,
        toArray(ex.primary_muscles), toArray(ex.secondary_muscles || []),
        toArray(ex.equipment_ids || []), ex.level_min,
        toArray(ex.contraindicated_regions || []), impact,
        ex.spinal_load, toArray(ex.tracks), ex.default_rest_seconds, ex.category || 'strength'
      ]);
    } catch (err) {
      console.error(`    Error inserting ${ex.slug}: ${err.message.split('\n')[0]}`);
    }
  }
  
  // Note: Warmup exercises are created by migrations (20260908090200_seed_reference_data.sql)
  // No need to load base warmups separately
  
  console.log(`\nApplying ${prMigrations.length} PR migrations...`);
  
  for (const filename of prMigrations) {
    let sql = readFileSync(`supabase/migrations/${filename}`, 'utf-8');
    
    // Fix INSERT statements missing id column - parse more carefully
    // Find each INSERT INTO exercises/warmup_exercises block and fix it
    const insertRegex = /INSERT INTO (exercises|warmup_exercises) \(([^)]+)\) VALUES \(([^;]+)\);/gs;
    
    sql = sql.replace(insertRegex, (match, table, columns, values) => {
      // Check if id is already in columns
      if (columns.includes('id,') || columns.includes('id ')) {
        return match; // Already has id
      }
      
      // Add id to columns and UUID to values
      const newColumns = `id, ${columns}`;
      const newValues = `'${randomUUID()}', ${values}`;
      return `INSERT INTO ${table} (${newColumns}) VALUES (${newValues});`;
    });
    
    try {
      await db.exec(sql);
      console.log(`  ✓ ${filename}`);
    } catch (err) {
      console.error(`  ✗ ${filename}: ${err.message.split('\n')[0]}`);
      // Write problematic SQL for debugging
      writeFileSync(`/tmp/failed-${filename}`, sql);
      console.error(`    Wrote SQL to /tmp/failed-${filename}`);
      process.exit(1);
    }
  }
  
  // Export exercises
  const exResult = await db.query(`
    SELECT id, slug, name, movement_pattern, mechanic, metric,
           primary_muscles, secondary_muscles, equipment_ids, level_min,
           contraindicated_regions, impact, spinal_load, tracks,
           default_rest_seconds, category
    FROM exercises
    WHERE is_active = true
    ORDER BY slug
  `);
  
  const exercises = exResult.rows.map(row => {
    // Parse Postgres array literals to JS arrays
    const parseArray = (val) => {
      if (Array.isArray(val)) return val;
      if (!val) return [];
      if (typeof val === 'string') {
        // Parse Postgres array literal "{foo,bar}" to ['foo', 'bar']
        if (val === '{}') return [];
        return val.replace(/[{}]/g, '').split(',');
      }
      return [];
    };
    
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      movement_pattern: row.movement_pattern,
      mechanic: row.mechanic,
      metric: row.metric,
      primary_muscles: parseArray(row.primary_muscles),
      secondary_muscles: parseArray(row.secondary_muscles),
      equipment_ids: parseArray(row.equipment_ids),
      level_min: row.level_min,
      contraindicated_regions: parseArray(row.contraindicated_regions),
      impact: row.impact,
      spinal_load: row.spinal_load,
      tracks: parseArray(row.tracks),
      default_rest_seconds: row.default_rest_seconds,
      category: row.category,
    };
  });
  
  writeFileSync('scripts/fixtures/catalogue.json', JSON.stringify(exercises, null, 2) + '\n');
  console.log(`\n✓ Wrote ${exercises.length} exercises to scripts/fixtures/catalogue.json`);
  
  // Export warmups (they got the stretch inserts from 140100, equipment from 140500)
  const warmupResult = await db.query(`
    SELECT id, slug, name, type, target_regions, target_muscles, duration_seconds, instructions, equipment_ids
    FROM warmup_exercises
    ORDER BY slug
  `);
  
  const warmupsFinal = warmupResult.rows.map(row => {
    const parseArray = (val) => {
      if (Array.isArray(val)) return val;
      if (!val) return [];
      if (typeof val === 'string') {
        if (val === '{}') return [];
        return val.replace(/[{}]/g, '').split(',');
      }
      return [];
    };
    
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      type: row.type,
      target_regions: parseArray(row.target_regions),
      target_muscles: parseArray(row.target_muscles),
      duration_seconds: row.duration_seconds,
      instructions: parseArray(row.instructions),
      equipment_ids: parseArray(row.equipment_ids),
    };
  });
  
  writeFileSync('scripts/fixtures/warmups.json', JSON.stringify(warmupsFinal, null, 2) + '\n');
  console.log(`✓ Wrote ${warmupsFinal.length} warmup exercises to scripts/fixtures/warmups.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
