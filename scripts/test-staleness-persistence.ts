#!/usr/bin/env tsx
/**
 * M1: Test that stale banner persists across renders when generation_inputs differs.
 * 
 * Run: npm run test:staleness-persistence
 */

import { isPlanStale, type ProfileAnswers, type ActiveBlock } from "../src/app/settings/plan-staleness";

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

// Test M1: Fresh render with stale snapshot shows banner
test("fresh render with stale snapshot shows banner", () => {
  const profile: ProfileAnswers = {
    goal: "muscle_gain",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60,
    has_all_equipment: false,
    equipment_ids: ["barbell", "bench"],
    current_injury_regions: [],
  };

  const block: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const, // Changed from muscle_gain
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: ["barbell", "bench"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profile, block);
  assert(result.stale, "Should be stale (goal changed)");
  assert(result.reasons.includes("goal changed"), "Should detect goal change");
});

// Test M1: Snapshot matches on fresh render = not stale
test("snapshot matches on fresh render = not stale", () => {
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

  const block: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const,
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: ["barbell", "bench"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profile, block);
  assert(!result.stale, "Should not be stale (perfect match)");
  assert(result.reasons.length === 0, "Should have no reasons");
});

// Test L4: Session minutes change marks plan stale
test("session minutes change marks plan stale", () => {
  const profile: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 45, // Changed from 60
    has_all_equipment: false,
    equipment_ids: ["barbell"],
    current_injury_regions: [],
  };

  const block: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const,
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60, // OLD value
      has_all_equipment: false,
      equipment_ids: ["barbell"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profile, block);
  assert(result.stale, "Should be stale (session length changed from 60 to 45)");
  assert(result.reasons.includes("session length changed"), "Should detect session length change");
});

// Test: Staleness clears after rebuild (generation_inputs updated)
test("staleness clears after rebuild updates generation_inputs", () => {
  const profile: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 60, // User changed to 60
    has_all_equipment: false,
    equipment_ids: ["barbell"],
    current_injury_regions: [],
  };

  // After rebuild, generation_inputs matches current profile
  const blockAfterRebuild: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const,
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60, // NOW matches profile
      has_all_equipment: false,
      equipment_ids: ["barbell"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profile, blockAfterRebuild);
  assert(!result.stale, "Should not be stale after rebuild updates generation_inputs");
  assert(result.reasons.length === 0, "Should have no reasons after rebuild");
});

// Test: Staleness clears when value is reverted
test("staleness clears when value is reverted to match generation_inputs", () => {
  // User changed session length 45 → 60, saw stale banner, then changed back to 45
  const profileRevertedTo45: ProfileAnswers = {
    goal: "strength",
    level: "intermediate",
    primary_track: "weights",
    days_per_week: 4,
    yoga_days_per_week: 0,
    preferred_session_minutes: 45, // Reverted back to original
    has_all_equipment: false,
    equipment_ids: ["barbell"],
    current_injury_regions: [],
  };

  const block: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const,
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 45, // Original value
      has_all_equipment: false,
      equipment_ids: ["barbell"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profileRevertedTo45, block);
  assert(!result.stale, "Should not be stale when reverted to match generation_inputs");
  assert(result.reasons.length === 0, "Should have no reasons when reverted");
});

// Test: Multiple field changes all detected
test("multiple field changes all detected in reasons", () => {
  const profile: ProfileAnswers = {
    goal: "strength",
    level: "expert", // Changed
    primary_track: "weights",
    days_per_week: 5, // Changed
    yoga_days_per_week: 0,
    preferred_session_minutes: 75, // Changed
    has_all_equipment: false,
    equipment_ids: ["barbell", "dumbbells"], // Changed
    current_injury_regions: ["lower_back"], // Changed
  };

  const block: ActiveBlock = {
    generation_inputs: {
      goal: "strength" as const,
      level: "intermediate" as const,
      primary_track: "weights" as const,
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 45,
      has_all_equipment: false,
      equipment_ids: ["barbell"],
      current_injury_regions: [],
    },
    days_per_week: 4,
  };

  const result = isPlanStale(profile, block);
  assert(result.stale, "Should be stale with multiple changes");
  assert(result.reasons.includes("level changed"), "Should detect level change");
  assert(result.reasons.includes("days per week changed"), "Should detect days change");
  assert(result.reasons.includes("session length changed"), "Should detect session length change");
  assert(result.reasons.includes("equipment selection changed"), "Should detect equipment change");
  assert(result.reasons.includes("injuries changed"), "Should detect injury change");
  assert(result.reasons.length === 5, `Should have exactly 5 reasons, got ${result.reasons.length}: ${result.reasons.join(", ")}`);
});

// TODO: Re-enable Today page tests after Dev 3's PR #32 merges
// (test-staleness-persistence will validate Today page banner once todayStateInputFromRows is available)

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
