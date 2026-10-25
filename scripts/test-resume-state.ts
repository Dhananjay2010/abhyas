#!/usr/bin/env tsx
/*
 * Test: leaving the runner and resuming straight away (B1, QA daily-use du2).
 *
 * Repro on main 9d4709f: leave on Military Press set 1, resume at once through
 * a soft navigation. The runner remounted with the cached props of its first
 * load: Bench Press current with two sets, the pre-swap exercise back, and the
 * next sets saved under Bench while Military Press set 1 was overwritten.
 *
 * This drives the runner's pure core (resume-state + exercisesReducer) through
 * that path, then logs through logSetCore against the in-memory PostgREST.
 */

import {
  nextSetTarget,
  pickCurrentExerciseIndex,
  reconcileWithServer,
  type ResumeExercise,
} from "../src/lib/session/resume-state";
import { exercisesReducer } from "../src/lib/session/exercises-reducer";
import { logSetCore } from "../src/lib/session/log-set-core";
import { createFakeDb, type Row } from "./helpers/fake-postgrest";

export {}; // Make this a module

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

type Ex = ResumeExercise & { name: string };

const set = (setNumber: number, reps: number, weightKg: number) => ({ setNumber, reps, weightKg, durationSeconds: null });

/** The RSC payload of the runner's first load, served again from the router cache. */
function staleProps(): Ex[] {
  return [
    { id: "se-bench", name: "Bench Press", status: "pending", plannedSets: 3, sets: [set(1, 10, 40), set(2, 10, 40)], lastLoggedAt: "2026-10-24T17:40:00.000Z" },
    { id: "se-pull", name: "Wide-Grip Pulldown", status: "pending", plannedSets: 3, sets: [], lastLoggedAt: null },
    { id: "se-military", name: "Military Press", status: "pending", plannedSets: 3, sets: [], lastLoggedAt: null },
  ];
}

/** What the database says when the user comes back. */
function serverTruth(): Ex[] {
  return [
    { id: "se-bench", name: "Bench Press", status: "completed", plannedSets: 3, sets: [set(1, 10, 40), set(2, 10, 40), set(3, 9, 40)], lastLoggedAt: "2026-10-24T17:44:00.000Z" },
    // Swapped in place before leaving: same session_exercise, new exercise.
    { id: "se-pull", name: "Lat Pulldown", status: "completed", plannedSets: 3, sets: [set(1, 12, 30), set(2, 12, 30), set(3, 12, 30)], lastLoggedAt: "2026-10-24T17:52:00.000Z" },
    { id: "se-military", name: "Military Press", status: "pending", plannedSets: 3, sets: [set(1, 12, 40)], lastLoggedAt: "2026-10-24T17:55:00.000Z" },
  ];
}

async function main() {
  console.log("Testing leave-and-resume (resume-state)\n");

  await test("(1) resume lands on the exercise of the latest logged set, from DB truth", () => {
    const state = exercisesReducer(staleProps(), { type: "merge", serverData: serverTruth() });
    const index = pickCurrentExerciseIndex(serverTruth());
    eq(state[index].id, "se-military", "current exercise after the fresh data lands");
  });

  await test("(1) the latest logged pending exercise wins over an earlier pending one", () => {
    const exercises: Ex[] = [
      { id: "a", name: "A", status: "pending", plannedSets: 3, sets: [], lastLoggedAt: null },
      { id: "b", name: "B", status: "pending", plannedSets: 3, sets: [set(1, 8, 20)], lastLoggedAt: "2026-10-24T18:00:00.000Z" },
      { id: "c", name: "C", status: "pending", plannedSets: 3, sets: [set(1, 8, 20)], lastLoggedAt: "2026-10-24T17:00:00.000Z" },
    ];
    eq(pickCurrentExerciseIndex(exercises), 1, "index");
    eq(pickCurrentExerciseIndex(exercises.map((e) => ({ ...e, lastLoggedAt: null, sets: [] }))), 0, "no sets: first pending");
  });

  await test("(2) a set goes under the exercise on screen, numbered from its own sets", () => {
    const state = exercisesReducer(staleProps(), { type: "merge", serverData: serverTruth() });
    const target = nextSetTarget(state, "se-military");
    eq(target?.sessionExerciseId, "se-military", "session_exercise_id");
    eq(target?.setNumber, 2, "set number");
  });

  await test("(2) a tap left over from the stale Bench screen saves nothing", () => {
    const state = exercisesReducer(staleProps(), { type: "merge", serverData: serverTruth() });
    eq(nextSetTarget(state, "se-bench"), null, "Bench is finished in the database");
    eq(nextSetTarget(state, "se-gone"), null, "an id not in the session");
  });

  await test("(3) the swap survives the resume and the swapped-out exercise does not come back", () => {
    const state = exercisesReducer(staleProps(), { type: "merge", serverData: serverTruth() });
    eq(state.find((e) => e.id === "se-pull")?.name, "Lat Pulldown", "name from the database");
    eq(state.some((e) => e.name === "Wide-Grip Pulldown"), false, "pre-swap exercise shown");
    eq(state.find((e) => e.id === "se-pull")?.status, "completed", "status from the database");
  });

  await test("(3) the server's list wins: an exercise only in stale state is dropped", () => {
    const stale: Ex[] = [...staleProps(), { id: "se-ghost", name: "Old row", status: "pending", plannedSets: 3, sets: [] }];
    const state = reconcileWithServer(stale, serverTruth());
    eq(state.map((e) => e.id).join(","), "se-bench,se-pull,se-military", "exercise ids");
  });

  await test("a set the client confirmed but the payload predates is kept", () => {
    const local = serverTruth().map((e) => (e.id === "se-military" ? { ...e, sets: [set(1, 12, 40), set(2, 10, 40)] } : e));
    const state = reconcileWithServer(local, serverTruth());
    eq(state[2].sets.map((s) => s.setNumber).join(","), "1,2", "Military sets");
    eq(nextSetTarget(state, "se-military")?.setNumber, 3, "next set number");
  });

  await test("(4)+(5) end to end: the resumed log saves Military set 2 and set 1 is never overwritten", async () => {
    const seeded: Row[] = [
      { id: "s1", session_exercise_id: "se-military", user_id: "user-1", set_number: 1, reps: 12, weight_kg: 40, duration_seconds: null, is_warmup_set: false, completed_at: "2026-10-24T17:55:00.000Z" },
    ];
    const db = createFakeDb({
      tables: { session_sets: seeded },
      unique: [{ table: "session_sets", columns: ["session_exercise_id", "set_number", "is_warmup_set"] }],
    });

    // What the stale screen would have sent for Military: set 1, other values.
    const stale = await logSetCore(db.client, "user-1", { sessionExerciseId: "se-military", setNumber: 1, reps: 8, weightKg: 45, durationSeconds: null });
    eq(stale.ok, false, "stale set 1 is refused");
    eq("reason" in stale && stale.reason, "set_exists", "refused as a conflict");

    // What the reconciled runner sends.
    const state = exercisesReducer(staleProps(), { type: "merge", serverData: serverTruth() });
    const target = nextSetTarget(state, state[pickCurrentExerciseIndex(serverTruth())].id);
    if (!target) throw new Error("no target");
    const ok = await logSetCore(db.client, "user-1", { ...target, reps: 10, weightKg: 40, durationSeconds: null });
    eq(ok.ok, true, "set 2 saved");

    const military = db.tables.session_sets.filter((r) => r.session_exercise_id === "se-military");
    eq(military.length, 2, "Military rows");
    eq(military.find((r) => r.set_number === 1)?.reps, 12, "set 1 reps unchanged");
    eq(db.tables.session_sets.filter((r) => r.session_exercise_id === "se-bench").length, 0, "nothing saved under Bench");
  });

  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
