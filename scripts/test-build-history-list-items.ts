#!/usr/bin/env tsx
/**
 * Test buildHistoryListItems with real-shaped Supabase rows.
 * 
 * Tests the complete page.tsx wiring: all row mapping, endedEarly, plannedSets,
 * workingSetCount, completedExercises, status, and PR flags.
 * 
 * Catches page-level wiring bugs:
 * (w1) endedEarly hard-coded false
 * (w2) empty setCountsBySession map
 * (w3) every session status passed as "completed"
 * (w4) empty exercises list
 * (w5) plannedSets hard-coded null
 * 
 *   npx tsx scripts/test-build-history-list-items.ts
 */

import { buildHistoryListItems } from "../src/lib/history/build-history-list-items";
import type { RawSessionForList, VolumeRow, SessionSetForTopSet } from "../src/lib/history/build-history-list-items";
import type { RawSessionExercise } from "../src/lib/history/build-session-summaries";

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

// Simple pickTopSet stub: returns max weight
function pickTopSet(sets: Array<{ weight_kg: number | null; reps: number | null; duration_seconds: number | null; is_warmup_set: boolean | null }>): number | null {
  const weights = sets.map(s => s.weight_kg).filter((w): w is number => w !== null);
  return weights.length > 0 ? Math.max(...weights) : null;
}

console.log("Test buildHistoryListItems with real-shaped rows\n");

console.log("1. Complete session with endedEarly = false, PR flag, volume");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s1",
      actual_type: "weights",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 3600,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T11:00:00Z",
      is_deload: false,
      program_days: { label: "Day 1" },
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s1", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s1", exercise_id: "bench", status: "completed", metric: "reps", planned_sets: 5 },
  ];
  
  const sets: SessionSetForTopSet[] = [
    { session_exercise_id: "ex1", reps: 5, weight_kg: 100, duration_seconds: null, is_warmup_set: false },
    { session_exercise_id: "ex2", reps: 5, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
  ];
  
  const volumeData: VolumeRow[] = [{ session_id: "s1", volume_kg: 1500 }];
  const setCountsBySession = new Map([["s1", 10]]);
  const sessionsWithPRs = new Set(["s1"]);
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("endedEarly = false", item.endedEarly === false, `got ${item.endedEarly}`);
  check("plannedSets = 10", item.plannedSets === 10, `got ${item.plannedSets}`);
  check("setCount = 10", item.setCount === 10, `got ${item.setCount}`);
  check("status = completed", item.status === "completed", `got ${item.status}`);
  check("volumeKg = 1500", item.volumeKg === 1500, `got ${item.volumeKg}`);
  check("topSetWeight = 100", item.topSetWeight === 100, `got ${item.topSetWeight}`);
  check("hasPR = true", item.hasPR === true, `got ${item.hasPR}`);
}

console.log("\n2. Ended early session: 1 of 10, pending exercise (catches w1, w2, w5)");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s2",
      actual_type: "weights",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 1800,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:30:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s2", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex2", session_id: "s2", exercise_id: "bench", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const sets: SessionSetForTopSet[] = [
    { session_exercise_id: "ex1", reps: 5, weight_kg: 100, duration_seconds: null, is_warmup_set: false },
  ];
  
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s2", 1]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("endedEarly = true (w1 kills this)", item.endedEarly === true, `got ${item.endedEarly}`);
  check("plannedSets = 10 (w5 kills this)", item.plannedSets === 10, `got ${item.plannedSets}`);
  check("setCount = 1 (w2 kills this)", item.setCount === 1, `got ${item.setCount}`);
  check("hasPR = false", item.hasPR === false, `got ${item.hasPR}`);
}

console.log("\n3. In-progress session with 0 sets and pending exercise");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s3",
      actual_type: "weights",
      status: "in_progress",
      local_date: "2026-10-26",
      duration_seconds: null,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: null,
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s3", exercise_id: "squat", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s3", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("status = in_progress", item.status === "in_progress", `got ${item.status}`);
  check("endedEarly = true (pending exercise)", item.endedEarly === true, `got ${item.endedEarly}`);
  check("setCount = 0", item.setCount === 0, `got ${item.setCount}`);
}

console.log("\n4. In-progress session with 0 sets, no exercises (catches w3)");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s4a",
      actual_type: "weights",
      status: "in_progress",
      local_date: "2026-10-26",
      duration_seconds: null,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: null,
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [];
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s4a", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("status = in_progress", item.status === "in_progress", `got ${item.status}`);
  check("endedEarly = false (no pending, status !== completed)", item.endedEarly === false, `got ${item.endedEarly}`);
  check("setCount = 0", item.setCount === 0, `got ${item.setCount}`);
}

console.log("\n5. Session with no exercises (catches w4)");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s4",
      actual_type: "weights",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 60,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:01:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [];
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s4", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("endedEarly = true (w4 kills this)", item.endedEarly === true, `got ${item.endedEarly}`);
  check("plannedSets = null", item.plannedSets === null, `got ${item.plannedSets}`);
  check("setCount = 0", item.setCount === 0, `got ${item.setCount}`);
  check("topSetWeight = null", item.topSetWeight === null, `got ${item.topSetWeight}`);
}

console.log("\n6. Yoga session with 0 sets → NOT ended early");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s5",
      actual_type: "yoga",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 1800,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:30:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s5", exercise_id: "yoga1", status: "completed", metric: "duration", planned_sets: 0 },
  ];
  
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s5", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("endedEarly = false (yoga ignores set count)", item.endedEarly === false, `got ${item.endedEarly}`);
  check("actualType = yoga", item.actualType === "yoga", `got ${item.actualType}`);
}

console.log("\n7. Breathing session with logs");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s6",
      actual_type: "meditation",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 300,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:05:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [
        { breaths: 30, routine_name: "Wim Hof" },
        { breaths: 30, routine_name: null },
      ],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [];
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s6", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("breathing not null", item.breathing !== null, `got ${item.breathing}`);
  check("breathing.breaths = 60", item.breathing?.breaths === 60, `got ${item.breathing?.breaths}`);
  check("breathing.patternName = Wim Hof", item.breathing?.patternName === "Wim Hof", `got ${item.breathing?.patternName}`);
  check("breathing.pumps = false", item.breathing?.pumps === false, `got ${item.breathing?.pumps}`);
  check("topSetWeight = null (breathing session)", item.topSetWeight === null, `got ${item.topSetWeight}`);
}

console.log("\n8. Multiple sessions with different states");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s7a",
      actual_type: "weights",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 3600,
      started_at: "2026-10-26T08:00:00Z",
      completed_at: "2026-10-26T09:00:00Z",
      is_deload: true,
      program_days: { label: "Day 1" },
      breathing_logs: [],
      breathing_patterns: null,
    },
    {
      id: "s7b",
      actual_type: "weights",
      status: "completed",
      local_date: "2026-10-25",
      duration_seconds: 1200,
      started_at: "2026-10-25T10:00:00Z",
      completed_at: "2026-10-25T10:20:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [],
      breathing_patterns: null,
    },
  ];
  
  const exercises: RawSessionExercise[] = [
    { id: "ex1", session_id: "s7a", exercise_id: "squat", status: "completed", metric: "reps", planned_sets: 3 },
    { id: "ex2", session_id: "s7b", exercise_id: "bench", status: "completed", metric: "reps", planned_sets: 5 },
    { id: "ex3", session_id: "s7b", exercise_id: "row", status: "pending", metric: "reps", planned_sets: 5 },
  ];
  
  const sets: SessionSetForTopSet[] = [
    { session_exercise_id: "ex1", reps: 5, weight_kg: 60, duration_seconds: null, is_warmup_set: false },
    { session_exercise_id: "ex1", reps: 5, weight_kg: 60, duration_seconds: null, is_warmup_set: false },
    { session_exercise_id: "ex1", reps: 5, weight_kg: 60, duration_seconds: null, is_warmup_set: false },
    { session_exercise_id: "ex2", reps: 5, weight_kg: 80, duration_seconds: null, is_warmup_set: false },
  ];
  
  const volumeData: VolumeRow[] = [
    { session_id: "s7a", volume_kg: 900 },
    { session_id: "s7b", volume_kg: 400 },
  ];
  const setCountsBySession = new Map([["s7a", 3], ["s7b", 1]]);
  const sessionsWithPRs = new Set(["s7a"]);
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  
  check("2 items returned", items.length === 2, `got ${items.length}`);
  
  const itemA = items.find(i => i.id === "s7a");
  const itemB = items.find(i => i.id === "s7b");
  
  check("s7a: endedEarly = false (3 of 3)", itemA?.endedEarly === false, `got ${itemA?.endedEarly}`);
  check("s7a: isDeload = true", itemA?.isDeload === true, `got ${itemA?.isDeload}`);
  check("s7a: hasPR = true", itemA?.hasPR === true, `got ${itemA?.hasPR}`);
  check("s7a: topSetWeight = 60", itemA?.topSetWeight === 60, `got ${itemA?.topSetWeight}`);
  check("s7a: programDayLabel = Day 1", itemA?.programDayLabel === "Day 1", `got ${itemA?.programDayLabel}`);
  check("s7a: localDate = 2026-10-26", itemA?.localDate === "2026-10-26", `got ${itemA?.localDate}`);
  check("s7a: durationSeconds = 3600", itemA?.durationSeconds === 3600, `got ${itemA?.durationSeconds}`);
  check("s7a: startedAt correct", itemA?.startedAt === "2026-10-26T08:00:00Z", `got ${itemA?.startedAt}`);
  check("s7a: completedAt correct", itemA?.completedAt === "2026-10-26T09:00:00Z", `got ${itemA?.completedAt}`);
  check("s7a: breathing = null (not meditation)", itemA?.breathing === null, `got ${itemA?.breathing}`);
  
  check("s7b: endedEarly = true (1 of 10 with pending)", itemB?.endedEarly === true, `got ${itemB?.endedEarly}`);
  check("s7b: plannedSets = 10", itemB?.plannedSets === 10, `got ${itemB?.plannedSets}`);
  check("s7b: setCount = 1", itemB?.setCount === 1, `got ${itemB?.setCount}`);
  check("s7b: hasPR = false", itemB?.hasPR === false, `got ${itemB?.hasPR}`);
  check("s7b: programDayLabel = null", itemB?.programDayLabel === null, `got ${itemB?.programDayLabel}`);
  check("s7b: localDate = 2026-10-25", itemB?.localDate === "2026-10-25", `got ${itemB?.localDate}`);
}

console.log("\n9. Breathing session with pumps (no routine name)");
{
  const sessions: RawSessionForList[] = [
    {
      id: "s8",
      actual_type: "meditation",
      status: "completed",
      local_date: "2026-10-26",
      duration_seconds: 180,
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:03:00Z",
      is_deload: null,
      program_days: null,
      breathing_logs: [{ breaths: 20, routine_name: null }],
      breathing_patterns: {
        name: "Custom Pattern",
        phases: [
          { kind: "pump", duration: 5 },
          { kind: "hold", duration: 10 },
        ],
      },
    },
  ];
  
  const exercises: RawSessionExercise[] = [];
  const sets: SessionSetForTopSet[] = [];
  const volumeData: VolumeRow[] = [];
  const setCountsBySession = new Map([["s8", 0]]);
  const sessionsWithPRs = new Set<string>();
  
  const items = buildHistoryListItems(sessions, exercises, sets, volumeData, setCountsBySession, sessionsWithPRs, pickTopSet);
  const item = items[0];
  
  check("breathing not null", item.breathing !== null, `got ${item.breathing}`);
  check("breathing.pumps = true", item.breathing?.pumps === true, `got ${item.breathing?.pumps}`);
  check("breathing.patternName = Custom Pattern", item.breathing?.patternName === "Custom Pattern", `got ${item.breathing?.patternName}`);
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All buildHistoryListItems tests passed!");
