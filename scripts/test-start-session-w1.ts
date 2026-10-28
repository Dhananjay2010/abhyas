#!/usr/bin/env npx tsx
/**
 * W1: startSessionFullCore must use cleanBannedExercises result, not planned input.
 * 
 * W1 mutant: `const cleanedPlanned = planned` (no-op cleanBannedExercises).
 * This test builds a typed StartSessionFullDeps with trivial stubs except
 * cleanBannedExercises which returns a cleaned list different from planned.
 * Asserts insertExercises receives the CLEANED list.
 */

import { readFileSync } from "fs";
import { startSessionFullCore } from "../src/lib/session/start-session-full-core";
import type { StartSessionFullDeps } from "../src/lib/session/start-session-full-core";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");
const goblet = catalogue.find(e => e.slug === "goblet-squat");

if (!thruster || !goblet) {
  console.error("✗ FAIL: test exercises not found");
  process.exit(1);
}

console.log("Testing W1: startSessionFullCore uses cleanBannedExercises result\n");

let insertedExercises: unknown[] = [];

const deps: StartSessionFullDeps = {
  userId: "u1",
  nowMs: Date.now(),
  
  async fetchProfile() {
    return { timezone: null };
  },
  
  async fetchOpenSessions() {
    return [];
  },
  
  async fetchResumeEnabled() {
    return true;
  },
  
  async updateSession() {
    return { ok: false, error: "not used" };
  },
  
  async ensureSessionExercises() {},
  
  async ensureCurrentBlock() {
    return { status: "current", programId: "prog1" };
  },
  
  async loadProgram() {
    return {
      ok: true,
      program: { id: "prog1", started_on: "2024-01-01", deload_week: 4, week_offset: 0 },
      dayId: "pd1",
      dayType: "weights" as const,
    };
  },
  
  async findInProgressToday() {
    return [];
  },
  
  buildStaleDeps(openSessions, today) {
    return {
      today,
      async readOpenSessions() {
        return openSessions;
      },
      async closeStaleSessions() {
        return 0;
      },
      async findInProgressAnyDay() {
        return [];
      },
      filterClosedToday: () => [],
      filterStaleToday: () => [],
    } as never;
  },
  
  async insertSession() {
    return { ok: true, sessionId: "s1" };
  },
  
  async fetchPlannedExercises() {
    return [
      {
        id: "pde1",
        exercise_id: thruster.id,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
        exercises: { metric: "reps" },
      },
    ];
  },
  
  async cleanBannedExercises(exercises) {
    // Return CLEANED list (banned replaced)
    return exercises.map(e => 
      e.exercise_id === thruster.id
        ? { ...e, exercise_id: goblet.id }
        : e
    );
  },
  
  async insertExercises(exercises) {
    insertedExercises = exercises;
    return { ok: true };
  },
};

(async () => {
  const result = await startSessionFullCore(deps);
  
  if (!result.ok) {
    console.error("✗ FAIL: startSessionFullCore failed");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  
  if (insertedExercises.length === 0) {
    console.error("✗ FAIL: No exercises inserted");
    process.exit(1);
  }
  
  const first = insertedExercises[0] as { exercise_id: string };
  
  if (first.exercise_id === thruster.id) {
    console.error("✗ FAIL: W1 - insertExercises received PLANNED (banned), not CLEANED");
    console.error(`  Expected cleaned: ${goblet.slug} (${goblet.id})`);
    console.error(`  Got planned:      kettlebell-thruster (${thruster.id})`);
    console.error(`  W1 mutant: const cleanedPlanned = planned`);
    process.exit(1);
  }
  
  if (first.exercise_id !== goblet.id) {
    console.error(`✗ FAIL: Unexpected exercise_id: ${first.exercise_id}`);
    process.exit(1);
  }
  
  console.log("✓ PASS: W1 killed - insertExercises received CLEANED list");
  console.log(`  Planned (banned): kettlebell-thruster (${thruster.id})`);
  console.log(`  Cleaned:          goblet-squat (${goblet.id})`);
})();
