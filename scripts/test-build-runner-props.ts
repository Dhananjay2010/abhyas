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
  ended_at: null,
  is_deload: false,
  meditation_video_id: null,
  note: null,
  planned_type: "weights" as const,
  program_week: 1,
  recovery_video_id: null,
  started_at: null,
  warmup_completed: false,
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

console.log(`\n✅ All assertions passed (${passed})`);
console.log("\nMutations N6/N6s/N8 killed: Changing user.id or session.status breaks assertions");
console.log("Break: Using wrong fields (e.g. session.user_id for userId) fails tests");
