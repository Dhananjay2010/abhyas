#!/usr/bin/env tsx
/**
 * test-layout-replay.tsx
 * Test PendingSetReplayProvider imports and basic structure.
 * Full integration testing of auth state changes requires complex Supabase mocking.
 * This test verifies the provider component exists and has the expected structure.
 */

import assert from "node:assert/strict";

async function testProviderExists() {
  const { PendingSetReplayProvider } = await import("../src/components/pending-set-replay-provider");
  assert.ok(PendingSetReplayProvider, "PendingSetReplayProvider should be importable");
  assert.strictEqual(typeof PendingSetReplayProvider, "function", "PendingSetReplayProvider should be a function");
  console.log("✅ PendingSetReplayProvider exists and is a function");
}

async function testProviderStructure() {
  // Read the source to verify key features are present
  const fs = await import("fs");
  const source = fs.readFileSync("src/components/pending-set-replay-provider.tsx", "utf8");
  
  // Verify onAuthStateChange is used
  assert.ok(source.includes("onAuthStateChange"), "Provider uses onAuthStateChange (mutant: missing listener must fail)");
  console.log("✅ Provider includes onAuthStateChange listener");
  
  // Verify getSessionStatus is defined and passed
  assert.ok(source.includes("getSessionStatus"), "Provider defines getSessionStatus (mutant: missing getSessionStatus must fail)");
  console.log("✅ Provider includes getSessionStatus wiring");
  
  // Verify it passes getSessionStatus to PendingSetReplay
  assert.ok(source.includes("getSessionStatus={getSessionStatus}"), "Provider passes getSessionStatus to PendingSetReplay");
  console.log("✅ Provider passes getSessionStatus prop");
  
  // Verify sessions table query
  assert.ok(source.includes('from("sessions")') || source.includes("from('sessions')"), "Provider queries sessions table");
  console.log("✅ Provider queries sessions table for status");
}

async function main() {
  console.log("Testing PendingSetReplayProvider structure...\n");
  
  try {
    await testProviderExists();
    await testProviderStructure();
    
    console.log("\n✅ All PendingSetReplayProvider structure tests passed");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Tests failed");
    console.error(error);
    process.exit(1);
  }
}

main();
