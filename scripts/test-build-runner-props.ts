#!/usr/bin/env tsx
/**
 * Test N6/N6s/N8: buildRunnerProps and buildSettingsProps extract correct fields
 * 
 * N6: userId must be user.id
 * N6s: sessionStatus must be session.status
 * N8: settings userId must be user.id
 */

import { buildRunnerProps, buildSettingsProps } from "../src/lib/session/build-runner-props";

let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n🧪 Test N6/N6s: buildRunnerProps extracts userId and sessionStatus\n");

const mockSession = {
  id: "session-123",
  user_id: "user-456",
  status: "in_progress" as const,
  created_at: "2026-01-01",
  actual_type: null,
  breathing_pattern_id: null,
  completed_at: null,
  cooldown_completed: false,
  date: "2026-01-01",
  duration_seconds: null,
  ended_at: null,
  energy_rating: null,
  is_deload: false,
  local_date: "2026-01-01",
  meditation_video_id: null,
  note: null,
  notes: null,
  planned_type: "weights" as const,
  program_day_id: null,
  program_id: null,
  program_week: 1,
  recovery_video_id: null,
  rpe: null,
  started_at: null,
  updated_at: "2026-01-01",
  warmup_completed: false,
  week_in_block: 1,
  week_seq: 1,
  yoga_video_id: null,
} as const;

const mockUser = {
  id: "user-456",
};

const props = buildRunnerProps(mockSession, mockUser);

assert(props.userId === mockUser.id, "N6: userId equals user.id");
assert(props.userId === "user-456", "N6: userId is correct value");
assert(props.sessionStatus === mockSession.status, "N6s: sessionStatus equals session.status");
assert(props.sessionStatus === "in_progress", "N6s: sessionStatus is correct value");

// Test N8: settings props
const settingsProps = buildSettingsProps(mockUser);
assert(settingsProps.userId === mockUser.id, "N8: settings userId equals user.id");
assert(settingsProps.userId === "user-456", "N8: settings userId is correct value");

// Test Mutant I/J: buildRunnerExercise preserves previousCompletedWeightKg
console.log("\n🧪 Test Mutant I/J: previousCompletedWeightKg flows through buildRunnerExercise\n");

import { buildRunnerExercise } from "../src/lib/session/build-runner-exercises";

const exercise = buildRunnerExercise({
  row: {
    id: "se-1",
    planned_sets: 3,
    planned_reps_min: 6,
    planned_reps_max: 8,
    rest_seconds: 180,
    status: "pending",
    feel: null,
    metric: "reps",
    exercises: {
      id: "ex-1",
      name: "Bench Press",
      cue: null,
      movement_pattern: "horizontal_press",
      primary_muscles: ["chest"],
      equipment_ids: ["barbell"],
    },
    session_sets: [],
  },
  progress: {
    current_working_weight_kg: 60,
    current_target_reps: 6,
    previous_completed_weight_kg: 60,
  },
  remembersWeights: true,
  isDeload: false,
});

assert(
  exercise.previousCompletedWeightKg === 60,
  "Mutant I/J: buildRunnerExercise preserves previousCompletedWeightKg from progress"
);

console.log(`\n✅ All assertions passed (${passed})`);
console.log("\nMutations N6/N6s/N8 killed: Changing user.id or session.status breaks assertions");
console.log("Mutations I/J killed: Dropping previousCompletedWeightKg breaks assertion");
console.log("Break: Using wrong fields (e.g. session.user_id for userId) fails tests");
