/**
 * test-layout-replay.tsx
 * Basic test that PendingSetReplayProvider exists and can be imported.
 * Manual verification required for full auth state change behavior.
 */

import assert from "node:assert/strict";

async function testProviderExists() {
  const { PendingSetReplayProvider } = await import("../src/components/pending-set-replay-provider");
  assert.ok(PendingSetReplayProvider, "PendingSetReplayProvider should be importable");
  assert.strictEqual(typeof PendingSetReplayProvider, "function", "PendingSetReplayProvider should be a function");
  console.log("✅ PendingSetReplayProvider exists and is a function");
}

async function main() {
  console.log("Testing PendingSetReplayProvider...\n");
  await testProviderExists();
  console.log("\n✅ All PendingSetReplayProvider tests passed");
}

main();
