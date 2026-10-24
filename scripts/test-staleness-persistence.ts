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

// TODO: Re-enable Today page tests after Dev 3's PR #32 merges
// (test-staleness-persistence will validate Today page banner once todayStateInputFromRows is available)

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
