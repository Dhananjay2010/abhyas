#!/usr/bin/env tsx
/**
 * Test computeSessionEndedEarly with real-shaped rows.
 * 
 * Tests the page.tsx mapper logic: session lookups, count aggregates,
 * pending exercise detection, and endedEarly computation.
 * 
 * Catches page-level bugs:
 * (a) inline <= rule
 * (b) missing 0-set fallback
 * (c) swapped plannedSets/workingSetCount
 * (d) hasPendingExercise hard-coded false
 * (e) p1: && workingSetCount > 0
 * 
 *   npx tsx scripts/test-session-ended-early-mapper.ts
 */

import { computeSessionEndedEarly } from "../src/lib/history/compute-session-ended-early";
import type { SessionAggregates, SessionRow } from "../src/lib/history/compute-session-ended-early";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

console.log("Test computeSessionEndedEarly mapper with real-shaped rows\n");

console.log("1. Completed strength, 1 of 10 sets, pending → ended early");
{
  const session: SessionRow = {
    id: "session-1",
    actual_type: "weights",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-1", [{ id: "ex1" }, { id: "ex2" }]);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-1", 1);
  
  const plannedSetsBySession = new Map();
  plannedSetsBySession.set("session-1", 10);
  
  const hasPendingExerciseBySession = new Map();
  hasPendingExerciseBySession.set("session-1", true);
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("1 of 10 sets, pending → ended early", result === true, `got ${result}`);
}

console.log("\n2. Completed strength, 10 of 10 sets → NOT ended early (catches a: <= bug)");
{
  const session: SessionRow = {
    id: "session-2",
    actual_type: "weights",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-2", [{ id: "ex1" }]);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-2", 10);
  
  const plannedSetsBySession = new Map();
  plannedSetsBySession.set("session-2", 10);
  
  const hasPendingExerciseBySession = new Map();
  hasPendingExerciseBySession.set("session-2", true);
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("10 of 10 sets → not ended early", result === false, `got ${result}`);
}

console.log("\n3. Completed strength, 0 sets, no exercises → ended early (catches b, e: 0-set fallback)");
{
  const session: SessionRow = {
    id: "session-3",
    actual_type: "weights",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-3", []);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-3", 0);
  
  const plannedSetsBySession = new Map();
  // No entry = undefined
  
  const hasPendingExerciseBySession = new Map();
  // No entry = false
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("0 sets, no exercises → ended early", result === true, `got ${result}`);
}

console.log("\n4. Completed strength, 5 of 10, no pending → NOT ended early (catches d: pending=false)");
{
  const session: SessionRow = {
    id: "session-4",
    actual_type: "weights",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-4", [{ id: "ex1" }]);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-4", 5);
  
  const plannedSetsBySession = new Map();
  plannedSetsBySession.set("session-4", 10);
  
  const hasPendingExerciseBySession = new Map();
  // No entry = false
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("5 of 10, no pending → not ended early", result === false, `got ${result}`);
}

console.log("\n5. Completed strength, 0 of 5, pending → ended early (catches c: swapped args)");
{
  const session: SessionRow = {
    id: "session-5",
    actual_type: "bodyweight",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-5", [{ id: "ex1" }]);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-5", 0);
  
  const plannedSetsBySession = new Map();
  plannedSetsBySession.set("session-5", 5);
  
  const hasPendingExerciseBySession = new Map();
  hasPendingExerciseBySession.set("session-5", true);
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("0 of 5 sets, pending → ended early", result === true, `got ${result}`);
}

console.log("\n6. Completed yoga, 0 sets → NOT ended early");
{
  const session: SessionRow = {
    id: "session-6",
    actual_type: "yoga",
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-6", [{ id: "ex1" }]);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-6", 0);
  
  const plannedSetsBySession = new Map();
  plannedSetsBySession.set("session-6", 0);
  
  const hasPendingExerciseBySession = new Map();
  hasPendingExerciseBySession.set("session-6", true);
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("yoga, 0 sets → not ended early", result === false, `got ${result}`);
}

console.log("\n7. Session with null actual_type (default to weights) → ended early");
{
  const session: SessionRow = {
    id: "session-7",
    actual_type: null,
    status: "completed",
  };
  
  const exercisesBySession = new Map();
  exercisesBySession.set("session-7", []);
  
  const setCountsBySession = new Map();
  setCountsBySession.set("session-7", 0);
  
  const plannedSetsBySession = new Map();
  
  const hasPendingExerciseBySession = new Map();
  
  const aggregates: SessionAggregates = {
    exercisesBySession,
    setCountsBySession,
    plannedSetsBySession,
    hasPendingExerciseBySession,
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("null actual_type, 0 sets, no exercises → ended early", result === true, `got ${result}`);
}

console.log("\n8. Session missing from all maps (all defaults) → NOT ended early");
{
  const session: SessionRow = {
    id: "session-missing",
    actual_type: "weights",
    status: "in_progress",
  };
  
  const aggregates: SessionAggregates = {
    exercisesBySession: new Map(),
    setCountsBySession: new Map(),
    plannedSetsBySession: new Map(),
    hasPendingExerciseBySession: new Map(),
  };
  
  const result = computeSessionEndedEarly(session, aggregates);
  check("missing session, defaults → not ended early", result === false, `got ${result}`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All session-ended-early-mapper tests passed!");
