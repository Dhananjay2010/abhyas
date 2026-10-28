#!/usr/bin/env npx tsx
/**
 * H2: ensureSessionExercises must be called on resume path.
 * 
 * H2 mutant: deps.ensureSessionExercises(existing.id) removed from start-session-full-core.ts
 * 
 * When resuming a session, ensureSessionExercises must fix banned exercises.
 * This test verifies the resume path (Case B) in startSessionFullCore.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
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

console.log("Testing H2: ensureSessionExercises on resume\n");

(async () => {
  const fake = createFakeDb({
    tables: {
      sessions: [{
        id: "s1",
        user_id: "u1",
        program_id: "prog1",
        program_day_id: "pd1",
        local_date: "2024-01-15",
        status: "in_progress",
        started_at: null,
        actual_type: "weights",
      }],
      session_exercises: [],
      program_day_exercises: [{
        id: "pde1",
        program_day_id: "pd1",
        exercise_id: thruster.id,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      }],
    },
  });

  let ensureCalled = false;

  const deps: StartSessionFullDeps = {
    userId: "u1",
    nowMs: Date.now(),

    async fetchProfile() {
      return { timezone: null };
    },

    async fetchOpenSessions() {
      return [{
        id: "s1",
        status: "in_progress" as const,
        local_date: "2024-01-15",
        actual_type: "weights" as const,
        started_at: null,
      }];
    },

    async fetchResumeEnabled() {
      return true;
    },

    async updateSession(sessionId) {
      return { ok: true, sessionId };
    },

    async ensureSessionExercises(sessionId) {
      ensureCalled = true;
      // Simulate cleanup: insert cleaned exercises
      const inserts = fake.requests.filter(r => r.method === "POST" && r.table === "session_exercises");
      if (inserts.length === 0) {
        await fake.client.from("session_exercises").insert([{
          session_id: sessionId,
          user_id: "u1",
          exercise_id: goblet.id, // Cleaned exercise
          order_index: 0,
          planned_sets: 3,
          planned_reps_min: 8,
          planned_reps_max: 12,
          rest_seconds: 90,
          metric: "reps",
        }]);
      }
    },

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

    buildStaleDeps: () => ({
      today: "2024-01-15",
      async readOpenSessions() { return []; },
      async closeStaleSessions() { return 0; },
      async findInProgressAnyDay() { return []; },
      filterClosedToday: () => [],
      filterStaleToday: () => [],
    }) as never,

    async insertSession() {
      return { ok: true, sessionId: "s1" };
    },

    async fetchPlannedExercises() {
      return [{
        id: "pde1",
        exercise_id: thruster.id,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
        exercises: { metric: "reps" },
      }];
    },

    async cleanBannedExercises(exercises) {
      return exercises;
    },

    async insertExercises() {
      return { ok: true };
    },
  };

  const result = await startSessionFullCore(deps);

  if (!result.ok) {
    console.error("✗ FAIL: startSessionFullCore failed");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (!ensureCalled) {
    console.error("✗ FAIL: H2 - ensureSessionExercises not called on resume");
    console.error(`  H2 mutant: deps.ensureSessionExercises(existing.id) removed`);
    process.exit(1);
  }

  console.log("✓ PASS: H2 killed - ensureSessionExercises called on resume");
  console.log(`  Session: ${result.sessionId}`);
  console.log(`  ensureSessionExercises: called ✓`);
})();
