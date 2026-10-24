#!/usr/bin/env tsx
/**
 * Test that buildCurrentGenerationInputs produces identical snapshots to persist.ts
 * 
 * Run: npm run test:generation-inputs-builder
 */

import { buildCurrentGenerationInputs } from "../src/lib/program/generation-inputs";

export {};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Test: buildCurrentGenerationInputs produces correct snapshot
test("buildCurrentGenerationInputs produces correct snapshot structure", () => {
  const profile = {
    goal: "strength" as const,
    level: "intermediate" as const,
    primary_track: "weights" as const,
    days_per_week: 4,
    yoga_days_per_week: 1,
    preferred_session_minutes: 60,
    has_all_equipment: false,
  };
  
  const equipmentIds = ["barbell", "bench"];
  const injuries = ["lower_back" as const];
  
  const result = buildCurrentGenerationInputs(profile, equipmentIds, injuries);
  
  assert(result.goal === "strength", "goal should match");
  assert(result.level === "intermediate", "level should match");
  assert(result.primary_track === "weights", "track should match");
  assert(result.days_per_week === 4, "days should match");
  assert(result.yoga_days_per_week === 1, "yoga days should match");
  assert(result.preferred_session_minutes === 60, "session minutes should match");
  assert(result.has_all_equipment === false, "equipment access should match");
  assert(deepEqual(result.equipment_ids, ["barbell", "bench"]), "equipment IDs should be sorted");
  assert(deepEqual(result.current_injury_regions, ["lower_back"]), "injuries should be sorted");
});

// Test: Default session length
test("uses DEFAULT_SESSION_LENGTH when session minutes is null", () => {
  const profile = {
    goal: "strength" as const,
    level: "beginner" as const,
    primary_track: "bodyweight" as const,
    days_per_week: 3,
    yoga_days_per_week: 0,
    preferred_session_minutes: null,
    has_all_equipment: true,
  };
  
  const result = buildCurrentGenerationInputs(profile, [], []);
  
  assert(result.preferred_session_minutes === 45, "should use DEFAULT_SESSION_LENGTH (45) when null");
});

// Test: Equipment sorting
test("sorts equipment IDs", () => {
  const profile = {
    goal: "muscle_gain" as const,
    level: "intermediate" as const,
    primary_track: "weights" as const,
    days_per_week: 5,
    yoga_days_per_week: 0,
    preferred_session_minutes: 75,
    has_all_equipment: false,
  };
  
  const equipmentIds = ["dumbbells", "barbell", "bench", "cables"];
  const result = buildCurrentGenerationInputs(profile, equipmentIds, []);
  
  const expected = ["barbell", "bench", "cables", "dumbbells"];
  assert(deepEqual(result.equipment_ids, expected), "equipment should be sorted alphabetically");
});

// Test: Injury sorting
test("sorts injury regions", () => {
  const profile = {
    goal: "general_fitness" as const,
    level: "intermediate" as const,
    primary_track: "bodyweight" as const,
    days_per_week: 4,
    yoga_days_per_week: 2,
    preferred_session_minutes: 45,
    has_all_equipment: true,
  };
  
  const injuries = ["shoulder" as const, "knee" as const, "lower_back" as const];
  const result = buildCurrentGenerationInputs(profile, [], injuries);
  
  const expected = ["knee", "lower_back", "shoulder"];
  assert(deepEqual(result.current_injury_regions, expected), "injuries should be sorted alphabetically");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
