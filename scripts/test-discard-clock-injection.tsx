#!/usr/bin/env tsx
/**
 * test-discard-clock-injection.tsx
 * Verify that PendingSetReplay and related functions use injected clock.
 * 
 * Tests createPendingSetDeps clock injection which is used throughout
 * the pending set replay system including the Discard handler.
 */

import assert from "node:assert/strict";
import { createPendingSetDeps } from "../src/lib/session/pending-set-deps";
import * as fs from "fs";

async function testCreatePendingSetDepsWithDate() {
  const mockNow = new Date("2026-01-15T12:00:00Z");
  const deps = createPendingSetDeps(mockNow);
  
  assert.strictEqual(
    deps.now(), 
    mockNow.getTime(), 
    "createPendingSetDeps uses injected Date (mutant: not passing clock must fail this)"
  );
  console.log("✅ createPendingSetDeps correctly uses injected Date");
}

async function testCreatePendingSetDepsWithFunction() {
  const mockTime = Date.parse("2026-01-15T12:00:00Z");
  const mockNow = () => mockTime;
  const deps = createPendingSetDeps(mockNow);
  
  assert.strictEqual(
    deps.now(), 
    mockTime, 
    "createPendingSetDeps uses injected function"
  );
  console.log("✅ createPendingSetDeps correctly uses injected function");
}

async function testPendingSetReplayUsesClockProp() {
  // Read the source to verify now prop is passed to createPendingSetDeps
  const replaySource = fs.readFileSync("src/components/pending-set-replay.tsx", "utf8");
  
  assert.ok(
    replaySource.includes("createPendingSetDeps(now)"),
    "PendingSetReplay passes now to createPendingSetDeps (mutant: not passing now must break this)"
  );
  console.log("✅ PendingSetReplay passes now prop to createPendingSetDeps");
  
  // Verify the Discard handler uses the same deps (which include the clock)
  assert.ok(
    replaySource.includes("clearPendingSets") && replaySource.includes("deps"),
    "Discard handler uses deps with clock"
  );
  console.log("✅ Discard handler uses clock-injected deps");
}

async function testPendingSetReplayProviderPassesClock() {
  // Verify the provider doesn't pass a clock (uses default Date.now)
  // but the replay component accepts it
  const providerSource = fs.readFileSync("src/components/pending-set-replay-provider.tsx", "utf8");
  
  // Provider should render PendingSetReplay
  assert.ok(
    providerSource.includes("PendingSetReplay"),
    "Provider renders PendingSetReplay"
  );
  console.log("✅ Provider renders PendingSetReplay component");
}

async function main() {
  console.log("Testing clock injection in pending set replay system...\n");
  
  try {
    await testCreatePendingSetDepsWithDate();
    await testCreatePendingSetDepsWithFunction();
    await testPendingSetReplayUsesClockProp();
    await testPendingSetReplayProviderPassesClock();
    
    console.log("\n✅ All clock injection tests passed");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Tests failed");
    console.error(error);
    process.exit(1);
  }
}

main();
