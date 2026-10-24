#!/usr/bin/env tsx
/**
 * Unit tests for plan staleness detection.
 *
 * Run: npm run test:plan-staleness
 */

import { isPlanStale, type ProfileAnswers, type ActiveBlock } from "../src/app/settings/plan-staleness";

type TestCase = {
  name: string;
  profile: ProfileAnswers;
  block: ActiveBlock | null;
  expectedStale: boolean;
  expectedReasons?: string[];
};

const tests: TestCase[] = [
  {
    name: "no block → not stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: null,
    expectedStale: false,
  },
  {
    name: "exact match with snapshot → not stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: ["barbell", "flat_bench"],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: ["barbell", "flat_bench"],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: false,
  },
  {
    name: "goal changed → stale",
    profile: {
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["goal changed"],
  },
  {
    name: "level changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "expert",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["level changed"],
  },
  {
    name: "session length changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 75,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["session length changed"],
  },
  {
    name: "training type changed → stale",
    profile: {
      goal: "general_fitness",
      level: "beginner",
      primary_track: "meditation",
      days_per_week: 3,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "general_fitness",
        level: "beginner",
        primary_track: "bodyweight",
        days_per_week: 3,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: false,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 3,
    },
    expectedStale: true,
    expectedReasons: ["training type changed"],
  },
  {
    name: "days per week changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 5,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["days per week changed"],
  },
  {
    name: "equipment access changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: ["barbell"],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["equipment access changed", "equipment selection changed"],
  },
  {
    name: "equipment selection changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: ["barbell", "dumbbells"],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: false,
        equipment_ids: ["barbell"],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["equipment selection changed"],
  },
  {
    name: "equipment order doesn't matter",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: false,
      equipment_ids: ["dumbbells", "barbell"],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: false,
        equipment_ids: ["barbell", "dumbbells"],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: false,
  },
  {
    name: "injuries changed → stale",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: ["lower_back"],
    },
    block: {
      generation_inputs: {
        goal: "muscle_gain",
        level: "intermediate",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        preferred_session_minutes: 60,
        has_all_equipment: true,
        equipment_ids: [],
        current_injury_regions: [],
      },
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["injuries changed"],
  },
  {
    name: "fallback: days changed, no snapshot",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 5,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: null,
      days_per_week: 4,
    },
    expectedStale: true,
    expectedReasons: ["days per week changed"],
  },
  {
    name: "fallback: days match, no snapshot",
    profile: {
      goal: "muscle_gain",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      preferred_session_minutes: 60,
      has_all_equipment: true,
      equipment_ids: [],
      current_injury_regions: [],
    },
    block: {
      generation_inputs: null,
      days_per_week: 4,
    },
    expectedStale: false,
  },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = isPlanStale(test.profile, test.block);
  const staleMatch = result.stale === test.expectedStale;
  const reasonsMatch = test.expectedReasons
    ? JSON.stringify(result.reasons.sort()) === JSON.stringify(test.expectedReasons.sort())
    : true;

  if (staleMatch && reasonsMatch) {
    console.log(`✓ ${test.name}`);
    passed++;
  } else {
    console.log(`✗ ${test.name}`);
    console.log(`  Expected stale: ${test.expectedStale}, got: ${result.stale}`);
    if (test.expectedReasons) {
      console.log(`  Expected reasons: ${JSON.stringify(test.expectedReasons)}`);
      console.log(`  Got reasons: ${JSON.stringify(result.reasons)}`);
    }
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
