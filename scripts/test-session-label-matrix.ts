#!/usr/bin/env tsx
/**
 * QA matrix test: 25 cases for session label derivation.
 * 
 * Tests the label logic through the same path as History page:
 * - Derives endedEarly and plannedSets from session_exercises rows
 * - Calls getSessionLabel with the derived values
 * - Verifies against expected output
 */

import { getSessionLabel } from "../src/lib/history/session-label";
import { countWorkingSets } from "../src/lib/session/count-sets";

const TODAY = "2026-10-24";

type Ex = { 
  planned: number | null; 
  status: "pending" | "completed" | "skipped" | "swapped_out"; 
  sets: number; 
  warmups?: number; 
  nullReps?: boolean; 
  timed?: boolean; 
  swappedFrom?: boolean;
};

type Case = { 
  name: string; 
  status: string; 
  type: string | null; 
  date?: string; 
  ex: Ex[]; 
  expect: string | RegExp;
};

const plan22 = [4, 4, 4, 4, 3, 3];
const full = (o: Partial<Ex> = {}) => plan22.map((p) => ({ 
  planned: p, 
  status: "completed" as const, 
  sets: p, 
  ...o 
}));

const cases: Case[] = [
  { name: "01 real End early 1 of 22 (ex1 pending, 1 set)", status: "completed", type: "weights", ex: plan22.map((p, i) => ({ planned: p, status: "pending", sets: i === 0 ? 1 : 0 })), expect: "Ended early · 1 of 22 sets" },
  { name: "02 End early 1/22 + 2 warm-ups", status: "completed", type: "weights", ex: plan22.map((p, i) => ({ planned: p, status: "pending", sets: i === 0 ? 1 : 0, warmups: i === 0 ? 2 : 0 })), expect: "Ended early · 1 of 22 sets" },
  { name: "03 End early after 2 exercises done (8/22)", status: "completed", type: "weights", ex: plan22.map((p, i) => ({ planned: p, status: i < 2 ? "completed" : "pending", sets: i < 2 ? p : 0 })), expect: "Ended early · 8 of 22 sets" },
  { name: "04 fully finished 22/22", status: "completed", type: "weights", ex: full(), expect: "Completed" },
  { name: "05 fully finished + warm-ups on every exercise", status: "completed", type: "weights", ex: full({ warmups: 2 }), expect: "Completed" },
  { name: "06 fully finished + extra sets (ex1 6 of 4)", status: "completed", type: "weights", ex: full().map((e, i) => (i === 0 ? { ...e, sets: 6 } : e)), expect: "Completed" },
  { name: "07 fully finished, ex3 swapped mid-workout (row updated in place)", status: "completed", type: "weights", ex: full().map((e, i) => (i === 2 ? { ...e, swappedFrom: true } : e)), expect: "Completed" },
  { name: "08 finished, ex6 SKIPPED via 'Skip this exercise' (0 sets)", status: "completed", type: "weights", ex: full().map((e, i) => (i === 5 ? { ...e, status: "skipped", sets: 0 } : e)), expect: "Completed" },
  { name: "09 finished, ex2 skipped after 2 of 4 sets", status: "completed", type: "weights", ex: full().map((e, i) => (i === 1 ? { ...e, status: "skipped", sets: 2 } : e)), expect: "Completed" },
  { name: "10 finished, 2 exercises skipped", status: "completed", type: "bodyweight", ex: full().map((e, i) => (i >= 4 ? { ...e, status: "skipped", sets: 0 } : e)), expect: "Completed" },
  { name: "11 finished, legacy swapped_out row + its replacement", status: "completed", type: "weights", ex: [...full(), { planned: 3, status: "swapped_out", sets: 0 }], expect: "Completed" },
  { name: "12 finished, ex1 finished with 3 of 4 sets", status: "completed", type: "weights", ex: full().map((e, i) => (i === 0 ? { ...e, sets: 3 } : e)), expect: "Completed" },
  { name: "13 finished with per-set logging OFF (null reps)", status: "completed", type: "weights", ex: full({ nullReps: true }), expect: "Completed" },
  { name: "14 finished, timed holds (duration sets)", status: "completed", type: "bodyweight", ex: full({ timed: true }), expect: "Completed" },
  { name: "15 finished, planned_sets NULL rows", status: "completed", type: "weights", ex: full().map((e) => ({ ...e, planned: null })), expect: "Completed" },
  { name: "16 completed 0-set, no exercise rows (weights)", status: "completed", type: "weights", ex: [], expect: "Ended early" },
  { name: "17 completed 0-set, no rows, actual_type NULL", status: "completed", type: null, ex: [], expect: "Ended early" },
  { name: "18 completed 0-set, rows all pending, warm-ups only", status: "completed", type: "weights", ex: plan22.map((p, i) => ({ planned: p, status: "pending", sets: 0, warmups: i === 0 ? 2 : 0 })), expect: "Ended early · 0 of 22 sets" },
  { name: "19 yoga completed (no rows)", status: "completed", type: "yoga", ex: [], expect: "Completed" },
  { name: "20 breathing completed (no rows)", status: "completed", type: "meditation", ex: [], expect: "Completed" },
  { name: "21 in_progress today, 3 sets", status: "in_progress", type: "weights", ex: plan22.map((p, i) => ({ planned: p, status: i === 0 ? "pending" : "pending", sets: i === 0 ? 3 : 0 })), expect: "In progress" },
  { name: "22 in_progress today, 0 sets", status: "in_progress", type: "weights", ex: plan22.map((p) => ({ planned: p, status: "pending", sets: 0 })), expect: "In progress" },
  { name: "23 in_progress yesterday", status: "in_progress", type: "weights", date: "2026-10-23", ex: plan22.map((p, i) => ({ planned: p, status: "pending", sets: i === 0 ? 2 : 0 })), expect: "Unfinished from 23 Oct" },
  { name: "24 auto-closed stale (closeStale) 22/22, last ex left pending", status: "completed", type: "weights", ex: full().map((e, i) => (i === 5 ? { ...e, status: "pending" } : e)), expect: "Completed" },
  { name: "25 deload finished (planned already reduced 2/ex)", status: "completed", type: "weights", ex: plan22.map(() => ({ planned: 2, status: "completed" as const, sets: 2 })), expect: "Completed" },
];

let exitCode = 0;

function check(ok: boolean, label: string, detail = "") {
  if (!ok) exitCode = 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nQA Matrix Test: 25 session label cases\n");

for (const c of cases) {
  const date = c.date ?? (c.status === "in_progress" ? TODAY : "2026-09-01");
  const isBreathing = c.type === "meditation";
  
  // Simulate the session_exercises rows
  const sessionExercises = c.ex.map((e) => ({
    planned_sets: e.planned,
    status: e.status,
  }));
  
  // Simulate the sets
  const allSets = c.ex.flatMap((e) => {
    const sets = [];
    // Warm-ups
    for (let i = 0; i < (e.warmups ?? 0); i++) {
      sets.push({ is_warmup_set: true, reps: 5, duration_seconds: null });
    }
    // Working sets
    for (let i = 0; i < e.sets; i++) {
      sets.push({ 
        is_warmup_set: false, 
        reps: e.nullReps || e.timed ? null : 8, 
        duration_seconds: e.timed ? 30 : null 
      });
    }
    return sets;
  });
  
  const workingSetCount = countWorkingSets(allSets);
  
  // Derive planned sets and endedEarly using History page logic (after fix)
  const live = sessionExercises.filter((x) => x.status === "pending" || x.status === "completed");
  let plannedSets: number | undefined;
  for (const ex of live) {
    if (ex.planned_sets && ex.planned_sets > 0) {
      plannedSets = (plannedSets ?? 0) + ex.planned_sets;
    }
  }
  
  const anyPending = sessionExercises.some((x) => x.status === "pending");
  const hasNoExercises = sessionExercises.length === 0;
  const isStrength = !isBreathing && c.type !== "yoga";
  
  const endedEarly = 
    (anyPending && 
     plannedSets !== undefined && 
     plannedSets > 0 && 
     workingSetCount < plannedSets) ||
    (isStrength && c.status === "completed" && workingSetCount === 0 && (anyPending || hasNoExercises));
  
  // Get the label
  const label = getSessionLabel({
    status: c.status as any,
    actualType: c.type as any,
    setCount: workingSetCount,
    localDate: date,
    today: TODAY,
    endedEarly,
    plannedSets: plannedSets ?? null,
  });
  
  // Check if it matches
  const ok = typeof c.expect === "string" ? label === c.expect : c.expect.test(label);
  check(ok, c.name.padEnd(66), `got="${label}" expected=${c.expect}`);
}

console.log(`\n${exitCode === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${exitCode}`}\n`);
process.exit(exitCode);
