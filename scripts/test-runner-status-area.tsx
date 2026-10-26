#!/usr/bin/env tsx
/**
 * Test: Runner status area integration
 * 
 * Verifies that RunnerStatusArea renders both PendingSetsBanner and
 * ReplayConflictNotice, and that the selector correctly maps controller
 * state to component props.
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { RunnerStatusArea } from "../src/components/runner-status-area";
import { selectRunnerStatusProps } from "../src/lib/session/runner-status-selector";
import type { PendingSetState } from "../src/lib/session/pending-set-controller";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testRunnerStatusAreaWithPending() {
  console.log("\n▶ Testing RunnerStatusArea shows pending banner...");
  
  const state: PendingSetState = {
    pending: [
      { sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null, clientId: "c1" },
      { sessionExerciseId: "ex2", setNumber: 1, reps: 8, weightKg: 80, durationSeconds: null, clientId: "c2" }
    ],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 0,
  };
  
  const html = renderToString(React.createElement(RunnerStatusArea, {
    pendingCount: 2,
    replayState: state,
  }));
  
  assert(html.includes("2 sets saved on this phone"), "Should render pending banner");
  console.log("  ✓ RunnerStatusArea renders PendingSetsBanner");
}

function testRunnerStatusAreaWithConflicts() {
  console.log("\n▶ Testing RunnerStatusArea shows conflict notice...");
  
  const state: PendingSetState = {
    pending: [],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 3,
  };
  
  const html = renderToString(React.createElement(RunnerStatusArea, {
    pendingCount: 0,
    replayState: state,
  }));
  
  assert(html.includes("3 sets"), "Should render conflict notice");
  assert(html.includes("already recorded"), "Should show conflict message");
  console.log("  ✓ RunnerStatusArea renders ReplayConflictNotice");
}

function testSelectorMapsStatesToProps() {
  console.log("\n▶ Testing selector maps controller state to props...");
  
  const state: PendingSetState = {
    pending: [
      { sessionExerciseId: "ex1", setNumber: 1, reps: 10, weightKg: 100, durationSeconds: null, clientId: "c1" },
    ],
    replayed: [],
    expired: false,
    retrying: false,
    error: null,
    conflicts: 2,
  };
  
  const props = selectRunnerStatusProps(state);
  
  assert(props.pendingCount === 1, "Should map pending.length to pendingCount");
  assert(props.replayState === state, "Should pass full replayState");
  assert(props.replayState.conflicts === 2, "Should preserve conflicts count");
  console.log("  ✓ Selector correctly maps state to props");
}

console.log("Testing Runner Status Area Integration");
console.log("=====================================");

testRunnerStatusAreaWithPending();
testRunnerStatusAreaWithConflicts();
testSelectorMapsStatesToProps();

console.log("\n✅ All runner status area tests passed\n");
