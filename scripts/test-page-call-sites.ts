#!/usr/bin/env node
/**
 * Test Issue 2: Page call sites for userId and sessionStatus
 * 
 * Tests that pages extract props via real tested helpers and spread them.
 * 
 * Mutants:
 * - N6_PAGE: buildRunnerProps returns userId="" → breaks pending set isolation
 * - N6S_PAGE: buildRunnerProps returns sessionStatus="in_progress" → breaks completed session handling
 * - N8_PAGE: buildSettingsProps returns userId="" → leaves orphaned pending sets after sign-out
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

function testSessionPageCallSite() {
  console.log("\n📋 Test: Session page buildRunnerProps wiring\n");
  
  // Test with a completed session and specific user
  const mockSession = {
    status: "completed" as const,
  };
  
  const mockUser = {
    id: "user-session-123",
  };
  
  const runnerProps = buildRunnerProps(mockSession, mockUser);
  
  // The page spreads this into SessionRunner: <SessionRunner {...runnerProps} ... />
  assert(runnerProps.userId === "user-session-123", "N6_PAGE: userId extracted correctly");
  assert(runnerProps.sessionStatus === "completed", "N6S_PAGE: sessionStatus extracted correctly");
  
  // Test with a different user to ensure it's not hardcoded
  const mockUser2 = { id: "user-456" };
  const runnerProps2 = buildRunnerProps(mockSession, mockUser2);
  assert(runnerProps2.userId === "user-456", "N6_PAGE: userId varies with user");
  
  console.log("\nMUTANT N6_PAGE: buildRunnerProps returns userId=\"\" → breaks pending set storage keys");
  console.log("MUTANT N6S_PAGE: buildRunnerProps returns sessionStatus=\"in_progress\" → replays on completed session\n");
}

function testSettingsPageCallSite() {
  console.log("📋 Test: Settings page buildSettingsProps wiring\n");
  
  const mockUser = {
    id: "user-settings-789",
  };
  
  // The page spreads this into SignOutButton: <SignOutButton {...signOutProps} />
  const signOutProps = buildSettingsProps(mockUser);
  
  assert(signOutProps.userId === "user-settings-789", "N8_PAGE: userId passed to SignOutButton");
  
  // Test with different user
  const mockUser2 = { id: "user-abc" };
  const signOutProps2 = buildSettingsProps(mockUser2);
  assert(signOutProps2.userId === "user-abc", "N8_PAGE: userId varies with user");
  
  console.log("\nMUTANT N8_PAGE: buildSettingsProps returns userId=\"\" → leaves orphaned pending sets after sign-out\n");
}

try {
  testSessionPageCallSite();
  testSettingsPageCallSite();
  console.log(`✅ All page call-site tests passed (${passed} assertions)\n`);
  process.exit(0);
} catch (error) {
  console.error(`\n❌ Page call-site tests failed:`, error);
  process.exit(1);
}
