import React from "react";
import { PendingSetsBanner } from "@/components/pending-sets-banner";
import { renderToString } from "react-dom/server";
import type { PendingSetState } from "@/lib/session/pending-set-controller";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testBannerWithPendingSets() {
  console.log("\n▶ Testing banner shows with pending sets...");
  
  const state: PendingSetState = {
    pending: [
      { exerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null, createdAt: Date.now() },
      { exerciseId: "ex2", setNumber: 1, reps: 8, weightKg: 80, durationSeconds: null, createdAt: Date.now() }
    ],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 0
  };
  
  const html = renderToString(
    React.createElement(PendingSetsBanner, {
      pendingCount: 2,
      replayState: state
    })
  );
  
  assert(html.includes("2 sets saved on this phone"), "Should show pending count");
  assert(html.includes("syncing when online"), "Should show calm message");
  console.log("  ✓ Banner shows with N>0");
}

function testBannerHiddenWithZero() {
  console.log("\n▶ Testing banner hidden with 0 pending...");
  
  const state: PendingSetState = {
    pending: [],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 0
  };
  
  const html = renderToString(
    React.createElement(PendingSetsBanner, {
      pendingCount: 0,
      replayState: state
    })
  );
  
  assert(html === "", "Should render nothing");
  console.log("  ✓ Banner hidden at 0");
}

function testBannerHiddenAfterReplay() {
  console.log("\n▶ Testing banner hidden after successful replay...");
  
  const state: PendingSetState = {
    pending: [],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 0
  };
  
  const html = renderToString(
    React.createElement(PendingSetsBanner, {
      pendingCount: 0,
      replayState: state
    })
  );
  
  assert(html === "", "Should render nothing after replay");
  console.log("  ✓ Banner hidden after replay");
}

function testReplayErrorMode() {
  console.log("\n▶ Testing replay error mode...");
  
  const state: PendingSetState = {
    pending: [
      { exerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null, createdAt: Date.now() }
    ],
    replayed: [],
    expired: false,
    retrying: false,
    error: "Network error",
    conflicts: 0
  };
  
  const html = renderToString(
    React.createElement(PendingSetsBanner, {
      pendingCount: 1,
      replayState: state
    })
  );
  
  assert(html.includes("Failed to save sets"), "Should show error heading");
  console.log("  ✓ Replay error mode shows error banner");
}

console.log("Testing Pending Sets Banner");
console.log("===========================");

try {
  testBannerWithPendingSets();
  testBannerHiddenWithZero();
  testBannerHiddenAfterReplay();
  testReplayErrorMode();
  console.log("\n✅ All pending sets banner tests passed\n");
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Test error: ${message}\n`);
  process.exit(1);
}
