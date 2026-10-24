#!/usr/bin/env tsx
/**
 * Test ensureGenerationSnapshot backfill for existing users.
 *
 * Run: npm run test:generation-snapshot
 */

import { isPlanStale, type ProfileAnswers, type ActiveBlock, type GenerationInputsSnapshot } from "../src/app/settings/plan-staleness";

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

// Test 1: Null snapshot + equipment change = stale after snapshot is backfilled
test("null snapshot + equipment change gives stale after backfill", () => {
  const profile: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell", "bench"],
    current_injury_regions: [],
  };

  // Block with null generation_inputs (existing user before feature)
  const blockBeforeBackfill: ActiveBlock = {
    generation_inputs: null,
    days_per_week: 4,
  };

  // Before backfill, fallback only detects days change
  const resultBefore = isPlanStale(profile, blockBeforeBackfill);
  assert(!resultBefore.stale, "Should not be stale (fallback matches days)");

  // After backfill, snapshot is written with old equipment
  const snapshot: GenerationInputsSnapshot = {
    goal: "strength" as const,
    level: "intermediate" as const,
    primary_track: "weights" as const,
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell"], // OLD equipment (before change)
    current_injury_regions: [],
  };
  
  const blockAfterBackfill: ActiveBlock = {
    generation_inputs: snapshot,
    days_per_week: 4,
  };

  // Now profile has new equipment ["barbell", "bench"]
  const resultAfter = isPlanStale(profile, blockAfterBackfill);
  assert(resultAfter.stale, "Should be stale (equipment changed)");
  assert(
    resultAfter.reasons.includes("equipment selection changed"),
    "Should detect equipment change",
  );
});

// Test 2: Null snapshot + no change = not stale after backfill
test("null snapshot + no change gives not stale after backfill", () => {
  const profile: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell", "bench"],
    current_injury_regions: [],
  };

  // Block with null generation_inputs
  const blockBefore: ActiveBlock = {
    generation_inputs: null,
    days_per_week: 4,
  };

  // Before backfill
  const resultBefore = isPlanStale(profile, blockBefore);
  assert(!resultBefore.stale, "Should not be stale before backfill");

  // After backfill, snapshot matches current state exactly
  const snapshot2: GenerationInputsSnapshot = {
    goal: "strength" as const,
    level: "intermediate" as const,
    primary_track: "weights" as const,
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell", "bench"],
    current_injury_regions: [],
  };
  
  const blockAfter: ActiveBlock = {
    generation_inputs: snapshot2,
    days_per_week: 4,
  };

  const resultAfter = isPlanStale(profile, blockAfter);
  assert(!resultAfter.stale, "Should not be stale after backfill (no changes)");
  assert(resultAfter.reasons.length === 0, "Should have no reasons");
});

// Test 3: Snapshot written before change captures old state
test("snapshot written before goal change captures old goal", () => {
  const profileBeforeChange: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell"],
    current_injury_regions: [],
  };

  // Snapshot captured before change
  const snapshot3: GenerationInputsSnapshot = {
    goal: "strength" as const, // OLD goal
    level: "intermediate" as const,
    primary_track: "weights" as const,
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell"],
    current_injury_regions: [],
  };
  
  const block: ActiveBlock = {
    generation_inputs: snapshot3,
    days_per_week: 4,
  };

  // User changed goal to fat loss
  const profileAfterChange: ProfileAnswers = {
    ...profileBeforeChange,
    goal: "fat_loss",
  };

  const result = isPlanStale(profileAfterChange, block);
  assert(result.stale, "Should be stale (goal changed)");
  assert(result.reasons.includes("goal changed"), "Should detect goal change");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
