#!/usr/bin/env tsx
/**
 * Test buildHistorySessionSummaries with real-shaped Supabase rows.
 * 
 * Tests the complete page.tsx logic: exercise lists (completed only),
 * planned sets (pending+completed, exclude skipped), pending detection,
 * working set counts, and endedEarly computation.
 * 
 * Catches bugs in:
 * (a) inline <= rule
 * (b) missing 0-set fallback
 * (c) swapped plannedSets/workingSetCount
 * (d) hasPendingExercise hard-coded false
 * (e) && workingSetCount > 0
 * (g1) skipped exercises counted in planned sets
 * (g2) pending detection dropped
 * (g3) null actual_type passed as 'yoga'
 * (g4) pending exercises added to completed exercise list
 * 
 *   npx tsx scripts/test-build-session-summaries.ts
 */

import { buildHistorySessionSummaries } from "../src/lib/history/build-session-summaries";
import type { RawSession, RawSessionExercise } from "../src/lib/history/build-session-summaries";

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

console.log("Test buildHistorySessionSummaries with real-shaped rows\n");

console.log("1. Complete session: 10 of 10 sets, all completed exercises");
{
  const sessions: RawSession[] = [
    { id: "s1", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s1", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s1", exercise_id: "bench", status: "completed", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s1", 10]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("10 of 10 sets → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
  check("plannedSets = 10", s.plannedSets === 10, `got ${s.plannedSets}`);
  check("workingSetCount = 10", s.workingSetCount === 10, `got ${s.workingSetCount}`);
  check("2 completed exercises", s.completedExercises.length === 2, `got ${s.completedExercises.length}`);
}

console.log("\n2. Ended early: 1 of 10 sets, pending exercise (catches a, d)");
{
  const sessions: RawSession[] = [
    { id: "s2", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s2", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s2", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s2", 1]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("1 of 10 sets, pending → ended early", s.endedEarly === true, `got ${s.endedEarly}`);
  check("plannedSets = 10 (pending+completed)", s.plannedSets === 10, `got ${s.plannedSets}`);
  check("workingSetCount = 1", s.workingSetCount === 1, `got ${s.workingSetCount}`);
  check("1 completed exercise (not pending)", s.completedExercises.length === 1, `got ${s.completedExercises.length}`);
}

console.log("\n3. Skipped exercise excluded from planned sets (catches g1)");
{
  const sessions: RawSession[] = [
    { id: "s3", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s3", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s3", exercise_id: "bench", status: "skipped", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s3", 5]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("plannedSets = 5 (skipped excluded)", s.plannedSets === 5, `got ${s.plannedSets}`);
  check("5 of 5 → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
  check("1 completed exercise (skipped not in list)", s.completedExercises.length === 1, `got ${s.completedExercises.length}`);
}

console.log("\n4. Zero-set session, no exercises → ended early (catches b, e)");
{
  const sessions: RawSession[] = [
    { id: "s4", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [];
  
  const setCountsBySession = new Map([["s4", 0]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("0 sets, no exercises → ended early", s.endedEarly === true, `got ${s.endedEarly}`);
  check("plannedSets = undefined", s.plannedSets === undefined, `got ${s.plannedSets}`);
  check("workingSetCount = 0", s.workingSetCount === 0, `got ${s.workingSetCount}`);
}

console.log("\n5. Null actual_type (defaults to weights) → ended early (catches g3)");
{
  const sessions: RawSession[] = [
    { id: "s5", actual_type: null, status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [];
  
  const setCountsBySession = new Map([["s5", 0]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("null actual_type, 0 sets, no exercises → ended early", s.endedEarly === true, `got ${s.endedEarly}`);
}

console.log("\n6. Yoga session, 0 sets → NOT ended early");
{
  const sessions: RawSession[] = [
    { id: "s6", actual_type: "yoga", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s6", exercise_id: "yoga1", status: "completed", metric: "duration", planned_sets: 0 },
  ];
  
  const setCountsBySession = new Map([["s6", 0]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("yoga, 0 sets → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
}

console.log("\n7. Pending exercise detection (catches g2, g4)");
{
  const sessions: RawSession[] = [
    { id: "s7", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s7", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s7", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
    { id: "ex3", session_id: "s7", exercise_id: "row", status: "pending", metric: "reps", planned_sets: 3 },
  ];
  
  const setCountsBySession = new Map([["s7", 5]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("5 of 13 sets, pending → ended early", s.endedEarly === true, `got ${s.endedEarly}`);
  check("plannedSets = 13 (all non-skipped)", s.plannedSets === 13, `got ${s.plannedSets}`);
  check("1 completed exercise (pending not in list)", s.completedExercises.length === 1, `got ${s.completedExercises.length}`);
}

console.log("\n8. No pending, 5 of 10 → NOT ended early (catches c)");
{
  const sessions: RawSession[] = [
    { id: "s8", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s8", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 10 },
  ];
  
  const setCountsBySession = new Map([["s8", 5]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("5 of 10, no pending → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
}

console.log("\n9. Session missing from setCountsBySession → 0 working sets");
{
  const sessions: RawSession[] = [
    { id: "s9", actual_type: "weights", status: "in_progress" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s9", exercise_id: "squat", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map();
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("missing from map → workingSetCount = 0", s.workingSetCount === 0, `got ${s.workingSetCount}`);
  check("0 of 5, in_progress → ended early (first rule)", s.endedEarly === true, `got ${s.endedEarly}`);
}

console.log("\n10. Mutant (a) boundary: workingSetCount === plannedSets with pending → NOT ended early");
{
  const sessions: RawSession[] = [
    { id: "s10", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s10", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s10", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s10", 10]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("10 of 10 with pending → not ended early (rule is <, not <=)", s.endedEarly === false, `got ${s.endedEarly}`);
  check("plannedSets = 10", s.plannedSets === 10, `got ${s.plannedSets}`);
}

console.log("\n11. Boundary: workingSetCount === plannedSets - 1 with pending → ended early");
{
  const sessions: RawSession[] = [
    { id: "s11", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s11", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s11", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s11", 9]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("9 of 10 with pending → ended early", s.endedEarly === true, `got ${s.endedEarly}`);
}

console.log("\n12. Boundary: workingSetCount === plannedSets + 1 with pending → NOT ended early");
{
  const sessions: RawSession[] = [
    { id: "s12", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s12", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s12", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s12", 11]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("11 of 10 with pending → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
}

console.log("\n13. swapped_out exercise excluded from planned sets and exercises");
{
  const sessions: RawSession[] = [
    { id: "s13", actual_type: "weights", status: "completed" },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s13", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s13", exercise_id: "bench", status: "swapped_out", metric: "reps", planned_sets: 5 },
  ];
  
  const setCountsBySession = new Map([["s13", 5]]);
  
  const summaries = buildHistorySessionSummaries(sessions, exercises, setCountsBySession);
  const s = summaries[0];
  
  check("plannedSets = 5 (swapped_out excluded)", s.plannedSets === 5, `got ${s.plannedSets}`);
  check("1 completed exercise (swapped_out not in list)", s.completedExercises.length === 1, `got ${s.completedExercises.length}`);
  check("5 of 5 → not ended early", s.endedEarly === false, `got ${s.endedEarly}`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All buildHistorySessionSummaries tests passed!");
