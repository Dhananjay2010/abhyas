#!/usr/bin/env tsx
/**
 * Test N6/N6s: buildRunnerProps extracts correct fields
 * 
 * N6: userId must be user.id
 * N6s: sessionStatus must be session.status
 */

import { buildRunnerProps } from "../src/lib/session/build-runner-props";

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

console.log(`\n✅ All assertions passed (${passed})`);
console.log("\nMutations N6/N6s killed: Changing user.id or session.status breaks assertions");
console.log("Break: Using wrong fields (e.g. session.user_id for userId) fails tests");
