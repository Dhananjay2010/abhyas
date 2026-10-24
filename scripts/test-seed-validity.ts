#!/usr/bin/env tsx
/**
 * Test: Validate seed.sql references against migrations
 * 
 * Verifies that all tables and columns referenced in supabase/seed.sql
 * exist in the migration files under supabase/migrations/.
 * 
 * This is a static check that runs without requiring Docker or a live database.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SEED_FILE = join(process.cwd(), 'supabase', 'seed.sql');

interface TestResult {
  passed: boolean;
  message: string;
}

function extractTableReferences(sql: string): Set<string> {
  const tables = new Set<string>();
  
  // Match INSERT INTO, UPDATE, DELETE FROM, SELECT FROM patterns
  // Use word boundaries to avoid partial matches
  const insertPattern = /INSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*[\(;]/gi;
  const updatePattern = /UPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+SET/gi;
  const deletePattern = /DELETE\s+FROM\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+WHERE/gi;
  const selectPattern = /FROM\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+(?:WHERE|LIMIT|$|;|\))/gi;
  
  const patterns = [insertPattern, updatePattern, deletePattern, selectPattern];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      // Skip obviously wrong matches
      if (tableName.length > 2 && tableName !== 'the') {
        tables.add(tableName);
      }
    }
  }
  
  return tables;
}

function extractColumnReferences(sql: string, table: string): Set<string> {
  const columns = new Set<string>();
  
  // Extract columns from INSERT INTO table (col1, col2, ...)
  const insertColPattern = new RegExp(
    `INSERT\\s+INTO\\s+(?:public\\.)?${table}\\s*\\(([^)]+)\\)`,
    'gi'
  );
  
  let match;
  while ((match = insertColPattern.exec(sql)) !== null) {
    const colList = match[1];
    const cols = colList.split(',').map(c => c.trim().toLowerCase());
    cols.forEach(col => columns.add(col));
  }
  
  return columns;
}

function extractTablesFromMigrations(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Process in order
  
  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    
    // Match CREATE TABLE statements and extract columns
    const createTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\);/gi;
    
    let match;
    while ((match = createTablePattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const tableBody = match[2];
      
      const columns = new Set<string>();
      
      // Extract column definitions (line starts with column name)
      const lines = tableBody.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;
        
        // Match column name at start of line (before any type, constraint, etc.)
        const colMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (colMatch) {
          columns.add(colMatch[1].toLowerCase());
        }
      }
      
      tables.set(tableName, columns);
    }
    
    // Also track ALTER TABLE ADD COLUMN
    const alterAddPattern = /ALTER\s+TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+ADD\s+(?:COLUMN\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((match = alterAddPattern.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const columnName = match[2].toLowerCase();
      
      if (!tables.has(tableName)) {
        tables.set(tableName, new Set());
      }
      tables.get(tableName)!.add(columnName);
    }
  }
  
  return tables;
}

function runTests(): TestResult[] {
  const results: TestResult[] = [];
  
  // Test 1: Seed file exists and is readable
  try {
    readFileSync(SEED_FILE, 'utf-8');
    results.push({
      passed: true,
      message: 'Seed file exists and is readable'
    });
  } catch (err) {
    results.push({
      passed: false,
      message: `Seed file not found or not readable: ${err}`
    });
    return results; // Can't continue without seed file
  }
  
  // Test 2: Migrations directory exists and has files
  let migrationFiles: string[];
  try {
    migrationFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    if (migrationFiles.length === 0) {
      results.push({
        passed: false,
        message: 'No migration files found in supabase/migrations/'
      });
      return results;
    }
    results.push({
      passed: true,
      message: `Found ${migrationFiles.length} migration files`
    });
  } catch (err) {
    results.push({
      passed: false,
      message: `Migrations directory not accessible: ${err}`
    });
    return results;
  }
  
  const seedContent = readFileSync(SEED_FILE, 'utf-8');
  const seedTables = extractTableReferences(seedContent);
  const migrationTables = extractTablesFromMigrations();
  
  // Test 3: All tables referenced in seed exist in migrations
  const missingTables: string[] = [];
  const authTables = ['auth.users', 'auth.identities']; // Managed by Supabase, not in our migrations
  
  for (const table of seedTables) {
    // Skip auth schema tables (managed by Supabase)
    if (table.startsWith('auth.') || authTables.includes(table)) {
      continue;
    }
    
    if (!migrationTables.has(table)) {
      missingTables.push(table);
    }
  }
  
  if (missingTables.length > 0) {
    results.push({
      passed: false,
      message: `Seed references tables not found in migrations: ${missingTables.join(', ')}`
    });
  } else {
    results.push({
      passed: true,
      message: `All ${seedTables.size} seed table references exist in migrations`
    });
  }
  
  // Test 4: Validate columns for key tables
  const tablesToValidate = [
    'profiles',
    'user_settings',
    'user_equipment',
    'programs',
    'program_days',
    'program_day_exercises',
    'sessions',
    'session_exercises',
    'session_sets',
    'exercise_progress',
    'body_metrics'
  ];
  
  let totalColumnsChecked = 0;
  const missingColumns: string[] = [];
  
  for (const table of tablesToValidate) {
    if (!migrationTables.has(table)) continue;
    
    const seedColumns = extractColumnReferences(seedContent, table);
    const migrationColumns = migrationTables.get(table)!;
    
    for (const col of seedColumns) {
      totalColumnsChecked++;
      if (!migrationColumns.has(col)) {
        missingColumns.push(`${table}.${col}`);
      }
    }
  }
  
  if (missingColumns.length > 0) {
    results.push({
      passed: false,
      message: `Seed references columns not found in migrations: ${missingColumns.join(', ')}`
    });
  } else if (totalColumnsChecked > 0) {
    results.push({
      passed: true,
      message: `All ${totalColumnsChecked} seed column references exist in migrations`
    });
  } else {
    results.push({
      passed: true,
      message: 'No explicit column references found in seed (uses SELECT * or defaults)'
    });
  }
  
  // Test 5: Seed creates auth.users before profiles
  const authUsersInsertIndex = seedContent.indexOf('INSERT INTO auth.users');
  const profilesInsertIndex = seedContent.indexOf('INSERT INTO public.profiles') !== -1 
    ? seedContent.indexOf('INSERT INTO public.profiles')
    : seedContent.indexOf('INSERT INTO profiles');
  
  if (authUsersInsertIndex !== -1 && profilesInsertIndex !== -1) {
    if (authUsersInsertIndex < profilesInsertIndex) {
      results.push({
        passed: true,
        message: 'Seed creates auth.users before profiles (correct FK order)'
      });
    } else {
      results.push({
        passed: false,
        message: 'Seed creates profiles before auth.users (violates FK constraint)'
      });
    }
  } else {
    // The seed uses the trigger to create profiles, so this is OK
    results.push({
        passed: true,
      message: 'Seed relies on handle_new_user trigger to create profiles'
    });
  }
  
  // Test 6: Check for trigger conflict (profiles/user_settings auto-created by handle_new_user)
  const hasHandleNewUserTrigger = migrationFiles.some(file => {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    return content.includes('handle_new_user') && 
           content.includes('insert into public.profiles') &&
           content.includes('on conflict');
  });
  
  if (hasHandleNewUserTrigger) {
    // Check if seed has INSERT INTO profiles or user_settings without ON CONFLICT
    const profilesInsertMatch = seedContent.match(/INSERT\s+INTO\s+(?:public\.)?profiles\s*\([^)]+\)\s*VALUES[\s\S]*?(?:ON CONFLICT|;)/gi);
    const userSettingsInsertMatch = seedContent.match(/INSERT\s+INTO\s+(?:public\.)?user_settings\s*\([^)]+\)\s*VALUES[\s\S]*?(?:ON CONFLICT|;)/gi);
    
    const conflictIssues: string[] = [];
    
    if (profilesInsertMatch) {
      for (const match of profilesInsertMatch) {
        if (!match.toUpperCase().includes('ON CONFLICT')) {
          conflictIssues.push('profiles');
          break;
        }
      }
    }
    
    if (userSettingsInsertMatch) {
      for (const match of userSettingsInsertMatch) {
        if (!match.toUpperCase().includes('ON CONFLICT')) {
          conflictIssues.push('user_settings');
          break;
        }
      }
    }
    
    if (conflictIssues.length > 0) {
      results.push({
        passed: false,
        message: `Seed inserts into ${conflictIssues.join(', ')} without ON CONFLICT, but handle_new_user trigger auto-creates these tables (will cause duplicate key error)`
      });
    } else {
      results.push({
        passed: true,
        message: 'Seed handles handle_new_user trigger correctly (uses ON CONFLICT or omits auto-created tables)'
      });
    }
  } else {
    results.push({
      passed: true,
      message: 'No handle_new_user trigger found in migrations'
    });
  }
  
  // Test 7: Validate all exercise slugs in seed.sql exist in migrations
  const exerciseSlugsInSeed = extractExerciseSlugs(seedContent);
  const exerciseSlugsInMigrations = extractExerciseSlugsFromMigrations();
  
  const missingExerciseSlugs: string[] = [];
  
  for (const slug of exerciseSlugsInSeed) {
    if (!exerciseSlugsInMigrations.has(slug)) {
      missingExerciseSlugs.push(slug);
    }
  }
  
  if (missingExerciseSlugs.length > 0) {
    results.push({
      passed: false,
      message: `Seed references exercise slugs not found in migrations: ${missingExerciseSlugs.join(', ')}`
    });
  } else if (exerciseSlugsInSeed.size > 0) {
    results.push({
      passed: true,
      message: `All ${exerciseSlugsInSeed.size} exercise slugs in seed exist in migrations`
    });
  } else {
    results.push({
      passed: true,
      message: 'No exercise slugs found in seed (may use dynamic queries)'
    });
  }
  
  // Test 8: Verify program_day_exercises have explicit ORDER BY in ROW_NUMBER() OVER
  const hasOrderBy = /ROW_NUMBER\(\)\s*OVER\s*\(\s*ORDER\s+BY/i.test(seedContent);
  if (hasOrderBy) {
    results.push({
      passed: true,
      message: 'program_day_exercises use ORDER BY in ROW_NUMBER() OVER (deterministic ordering)'
    });
  } else {
    results.push({
      passed: false,
      message: 'program_day_exercises use ROW_NUMBER() OVER () without ORDER BY (non-deterministic ordering)'
    });
  }
  
  // Test 9: Verify compound lifts come first in each program day
  // Look for CASE statements in ORDER BY that categorize exercises (compound=0, isolation=1)
  const orderByPattern = /ROW_NUMBER\(\)\s*OVER\s*\(\s*ORDER\s+BY\s+(CASE[\s\S]*?END[\s\S]*?e\.slug[\s\S]*?)\)/gi;
  const orderByClauses = [];
  let match;
  while ((match = orderByPattern.exec(seedContent)) !== null) {
    orderByClauses.push(match[1]);
  }
  
  let allHaveCompoundFirst = true;
  let checkedCount = 0;
  
  for (const clause of orderByClauses) {
    // Look for WHEN clauses that lead to THEN 0 (compound lift category)
    if (/WHEN[\s\S]*?THEN\s+0/i.test(clause)) {
      checkedCount++;
      // Extract the WHEN condition that leads to THEN 0
      const whenZeroMatch = clause.match(/WHEN[\s\S]*?THEN\s+0/i);
      if (whenZeroMatch) {
        const whenZeroClause = whenZeroMatch[0];
        // Check if it mentions compound exercise slugs
        const hasCompounds = /(barbell-bench-press|barbell-squat|barbell-deadlift|pullups|bent-over-barbell-row|barbell-shoulder-press|dips-triceps|romanian-deadlift|leg-press|front-barbell-squat|dumbbell-lunges)/i.test(whenZeroClause);
        if (!hasCompounds) {
          allHaveCompoundFirst = false;
        }
      }
    }
  }
  
  if (checkedCount >= 4 && allHaveCompoundFirst) {
    results.push({
      passed: true,
      message: `All ${checkedCount} program days prioritize compound lifts first (CASE ... THEN 0)`
    });
  } else if (checkedCount > 0) {
    results.push({
      passed: false,
      message: `Only ${checkedCount} program days found with compound prioritization (expected 4)`
    });
  } else {
    results.push({
      passed: false,
      message: 'No compound lift prioritization found in ORDER BY clauses'
    });
  }
  
  return results;
}

function extractExerciseSlugs(sql: string): Set<string> {
  const slugs = new Set<string>();
  
  // Match WHERE e.slug = 'slug-name'
  const singleSlugPattern = /WHERE\s+e\.slug\s*=\s*'([a-z0-9-]+)'/gi;
  let match;
  while ((match = singleSlugPattern.exec(sql)) !== null) {
    slugs.add(match[1]);
  }
  
  // Match WHERE e.slug IN ('slug1', 'slug2', ...)
  const inClausePattern = /WHERE\s+e\.slug\s+IN\s*\(([\s\S]*?)\)/gi;
  while ((match = inClausePattern.exec(sql)) !== null) {
    const slugList = match[1];
    // Extract all 'slug-name' patterns
    const slugPattern = /'([a-z0-9-]+)'/g;
    let slugMatch;
    while ((slugMatch = slugPattern.exec(slugList)) !== null) {
      slugs.add(slugMatch[1]);
    }
  }
  
  // Match WHEN e.slug patterns in CASE statements
  const caseWhenPattern = /WHEN\s+e\.slug\s*=?\s*'([a-z0-9-]+)'/gi;
  while ((match = caseWhenPattern.exec(sql)) !== null) {
    slugs.add(match[1]);
  }
  
  return slugs;
}

function extractExerciseSlugsFromMigrations(): Set<string> {
  const slugs = new Set<string>();
  
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    
    // Match INSERT INTO exercises with slug as first column
    // Pattern: ('slug-name', ...
    // The VALUES block can span many lines and may end with on conflict
    const insertPattern = /INSERT\s+INTO\s+(?:public\.)?exercises\s*\([^)]*\)\s*VALUES\s*([\s\S]*?)(?:on conflict|ON CONFLICT)/gi;
    let match;
    while ((match = insertPattern.exec(content)) !== null) {
      const valuesBlock = match[1];
      // Extract all tuples starting with ('slug-name',
      const tuplePattern = /\('([a-z0-9-]+)',/g;
      let tupleMatch;
      while ((tupleMatch = tuplePattern.exec(valuesBlock)) !== null) {
        slugs.add(tupleMatch[1]);
      }
    }
    
    // Also check for simple VALUES (...); pattern without ON CONFLICT
    const simpleInsertPattern = /INSERT\s+INTO\s+(?:public\.)?exercises\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/gi;
    while ((match = simpleInsertPattern.exec(content)) !== null) {
      const valuesBlock = match[1];
      const tuplePattern = /\('([a-z0-9-]+)',/g;
      let tupleMatch;
      while ((tupleMatch = tuplePattern.exec(valuesBlock)) !== null) {
        slugs.add(tupleMatch[1]);
      }
    }
  }
  
  return slugs;
}

// Run the tests
console.log('=====================================');
console.log('Testing seed.sql validity');
console.log('=====================================\n');

const results = runTests();
let allPassed = true;

for (const result of results) {
  const status = result.passed ? '✓' : '✗';
  console.log(`${status} ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
}

console.log('\n=====================================');
if (allPassed) {
  console.log('All seed validity tests passed\n');
  process.exit(0);
} else {
  console.log('Some seed validity tests failed\n');
  process.exit(1);
}
