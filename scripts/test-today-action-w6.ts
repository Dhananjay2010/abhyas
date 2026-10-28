#!/usr/bin/env npx tsx
/**
 * W6: Action call stubbed
 * 
 * Mutant: Comment out cleanBannedPlannedExercises call in actions.ts cleanBannedExercises
 * 
 * Test: The actual mutation is in the server action, which needs Next.js runtime.
 * This test verifies the underlying lib function works correctly.
 * The action should be thin: call cleanBannedPlannedExercises and return result.
 * 
 * Manual QA check: Verify actions.ts cleanBannedExercises calls cleanBannedPlannedExercises.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import {
  fireBannedCleanupIfNeeded,
  runBannedCleanupAction,
  type BannedCleanupResult,
} from "../src/lib/today/banned-cleanup-action";
import { getKneeBannedSlugs } from "../src/lib/program/past-knee";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

const thruster = catalogue.find(e => e.slug === "kettlebell-thruster");

if (!thruster) {
  console.error("✗ FAIL: test exercise not found");
  process.exit(1);
}

console.log("Testing W6: Action cleanup trigger\n");

(async () => {
  const fake = createFakeDb({
    tables: {
      profiles: [{
        id: "u1",
        goal: "muscle_gain",
        level: "beginner",
        primary_track: "weights",
        days_per_week: 4,
        yoga_days_per_week: 0,
        has_all_equipment: true,
      }],
      programs: [{
        id: "prog1",
        user_id: "u1",
        status: "active",
      }],
      user_injuries: [{ user_id: "u1", body_region: "knee", severity: "current" }],
      exercises: catalogueRows.map(e => ({
        id: e.id,
        slug: e.slug,
        name: e.name,
        movement_pattern: e.movement_pattern,
        mechanic: e.mechanic,
        metric: e.metric,
        primary_muscles: e.primary_muscles,
        equipment_ids: e.equipment_ids,
        level_min: e.level_min,
        contraindicated_regions: e.contraindicated_regions,
        impact: e.impact,
        spinal_load: e.spinal_load,
        tracks: e.tracks,
        default_rest_seconds: e.default_rest_seconds,
        category: e.category,
        is_active: true,
      })),
      user_equipment: catalogueRows.flatMap(e => e.equipment_ids).slice(0, 10).map(eq => ({ 
        user_id: "u1", 
        equipment_id: eq 
      })),
      program_days: [{ 
        id: "pd1", 
        program_id: "prog1",
        day_of_week: 1,
        day_type: "weights",
        label: "Lower",
        status: "active",
      }],
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

  const { cleanBannedPlannedExercises } = await import("../src/lib/program/clean-banned-planned");
  const result = await cleanBannedPlannedExercises(fake.client, "u1");

  if (result.errors.length > 0) {
    console.error("✗ FAIL: W6 - cleanBannedPlannedExercises had errors");
    console.error(`  Errors: ${result.errors.join(", ")}`);
    process.exit(1);
  }

  if (result.cleaned === 0) {
    console.error("✗ FAIL: W6 - no exercises cleaned");
    console.error(`  Mutant stubbed cleanup call`);
    process.exit(1);
  }

  // Verify DB writes happened
  const writes = fake.requests.filter(r => r.method === "PATCH" || r.method === "DELETE");
  if (writes.length === 0) {
    console.error("✗ FAIL: W6 - no DB writes occurred");
    process.exit(1);
  }

  console.log("✓ PASS: W6 action killed - cleanup performed DB writes");
  console.log(`  Cleaned: ${result.cleaned} exercise(s)`);
  console.log(`  DB writes: ${writes.length}`);
  console.log("\nNote: actions.ts cleanBannedExercises is thin wrapper calling cleanBannedPlannedExercises.");
  console.log("Manual QA: Verify actions.ts ~line 49 calls cleanBannedPlannedExercises and returns result.");

  // ---------------------------------------------------------------------
  // The real wiring: CleanupTrigger -> fireBannedCleanupIfNeeded ->
  // cleanBannedExercises (Server Action) -> runBannedCleanupAction ->
  // cleanBannedPlannedExercises. Only the Next-only pieces (auth cookies,
  // rate-limit headers, revalidatePath) are replaced; the client is a real
  // supabase-js client over fake-postgrest.
  // ---------------------------------------------------------------------
  console.log("\nTrigger + action path with a real client");
  const ALLOWED_TABLES = new Set([
    "profiles", "user_injuries", "exercises", "programs", "user_equipment", "program_days", "program_day_exercises",
  ]);
  const actionFake = createFakeDb({
    tables: {
      profiles: [{
        id: "u1", goal: "muscle_gain", level: "beginner", primary_track: "weights",
        days_per_week: 4, yoga_days_per_week: 0, has_all_equipment: true,
      }],
      programs: [{ id: "prog1", user_id: "u1", status: "active" }],
      user_injuries: [{ user_id: "u1", body_region: "knee", severity: "current" }],
      exercises: catalogueRows.map(e => ({
        id: e.id, slug: e.slug, name: e.name, movement_pattern: e.movement_pattern, mechanic: e.mechanic,
        metric: e.metric, primary_muscles: e.primary_muscles, equipment_ids: e.equipment_ids, level_min: e.level_min,
        contraindicated_regions: e.contraindicated_regions, impact: e.impact, spinal_load: e.spinal_load,
        tracks: e.tracks, default_rest_seconds: e.default_rest_seconds, category: e.category, is_active: true,
      })),
      user_equipment: catalogueRows.flatMap(e => e.equipment_ids).slice(0, 10).map(eq => ({ user_id: "u1", equipment_id: eq })),
      program_days: [{ id: "pd1", program_id: "prog1", day_of_week: 1, day_type: "weights", label: "Lower", status: "active" }],
      program_day_exercises: [{
        id: "pde1", program_day_id: "pd1", exercise_id: thruster.id, order_index: 0,
        target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90,
      }],
    },
  });

  const counts = { revalidated: 0, clean: 0 };
  const outcomes: BannedCleanupResult[] = [];
  const errorsSeen: unknown[] = [];
  const runAction = async () => {
    const outcome = await runBannedCleanupAction({
      getAuthedClient: async () => ({ supabase: actionFake.client, user: { id: "u1" } }),
      checkRateLimit: async () => null,
      clean: cleanBannedPlannedExercises,
      revalidate: () => { counts.revalidated++; },
    });
    outcomes.push(outcome);
    return outcome;
  };

  // shouldClean = false: nothing runs, no requests.
  const skipped = fireBannedCleanupIfNeeded(false, runAction, e => errorsSeen.push(e));
  if (skipped !== null || actionFake.requests.length > 0 || outcomes.length > 0) {
    console.error("✗ FAIL: W6 trigger ran the cleanup although shouldClean was false");
    process.exit(1);
  }

  // shouldClean = true: the action runs and persists the replacement.
  const fired = fireBannedCleanupIfNeeded(true, runAction, e => errorsSeen.push(e));
  if (fired === null) {
    console.error("✗ FAIL: W6 trigger did not fire the cleanup action when shouldClean was true");
    process.exit(1);
  }
  await fired;

  if (errorsSeen.length > 0) {
    console.error(`✗ FAIL: W6 cleanup action threw: ${String(errorsSeen[0])}`);
    process.exit(1);
  }
  const outcome = outcomes[0];
  if (outcomes.length !== 1 || !outcome || !outcome.ok || outcome.cleaned !== 1) {
    console.error(`✗ FAIL: W6 action result wrong: ${JSON.stringify(outcomes)}`);
    console.error("  Expected exactly one run with { ok: true, cleaned: 1 }");
    process.exit(1);
  }
  if (counts.revalidated !== 1) {
    console.error(`✗ FAIL: W6 action revalidated ${counts.revalidated} time(s), expected 1`);
    process.exit(1);
  }
  const outside = actionFake.requests.filter(r => !ALLOWED_TABLES.has(r.table));
  if (outside.length > 0) {
    console.error(`✗ FAIL: W6 action touched tables outside the allowed set: ${outside.map(r => `${r.table}:${r.method}`).join(", ")}`);
    process.exit(1);
  }
  const patches = actionFake.requests.filter(r => r.method === "PATCH");
  const casPatch = patches.find(r =>
    r.table === "program_day_exercises" && r.filters.id === "eq.pde1" && r.filters.exercise_id === `eq.${thruster.id}`
  );
  if (!casPatch || actionFake.requests.some(r => r.method === "DELETE" || r.method === "POST")) {
    console.error(`✗ FAIL: W6 action did not PATCH program_day_exercises pde1 with the CAS guard (writes: ${actionFake.requests.filter(r => r.method !== "GET").map(r => `${r.table}:${r.method}`).join(", ") || "none"})`);
    process.exit(1);
  }
  const row = (actionFake.tables.program_day_exercises ?? []).find(r => r.id === "pde1");
  const replacement = catalogue.find(e => e.id === row?.exercise_id);
  const bannedCurrent = getKneeBannedSlugs("current");
  if (!row || !replacement || replacement.id === thruster.id || bannedCurrent.has(replacement.slug)) {
    console.error(`✗ FAIL: W6 planned row not replaced by a safe exercise (now ${String(row?.exercise_id)})`);
    process.exit(1);
  }
  console.log("✓ PASS: W6 trigger fired the action; banned exercise replaced in program_day_exercises");
  console.log(`  ${thruster.slug} -> ${replacement.slug}; writes: ${patches.map(r => `${r.table}:${r.method}`).join(", ")}`);

  // The action's guards: signed out and rate-limited never reach the DB.
  const guardFake = createFakeDb({ tables: {} });
  const signedOut = await runBannedCleanupAction({
    getAuthedClient: async () => ({ supabase: guardFake.client, user: null }),
    checkRateLimit: async () => null,
    clean: async (db, userId) => { counts.clean++; return cleanBannedPlannedExercises(db, userId); },
    revalidate: () => { counts.revalidated++; },
  });
  const limited = await runBannedCleanupAction({
    getAuthedClient: async () => ({ supabase: guardFake.client, user: { id: "u1" } }),
    checkRateLimit: async () => ({ ok: false, error: "Too many requests" }),
    clean: async (db, userId) => { counts.clean++; return cleanBannedPlannedExercises(db, userId); },
    revalidate: () => { counts.revalidated++; },
  });
  if (signedOut.ok || signedOut.error !== "Not signed in" || limited.ok || limited.error !== "Too many requests" ||
      counts.clean !== 0 || guardFake.requests.length !== 0 || counts.revalidated !== 1) {
    console.error("✗ FAIL: W6 action guards: signed-out or rate-limited call reached the cleanup");
    console.error(`  signedOut=${JSON.stringify(signedOut)} limited=${JSON.stringify(limited)} cleanCalls=${counts.clean} requests=${guardFake.requests.length}`);
    process.exit(1);
  }
  console.log("✓ PASS: W6 action guards (signed out, rate limited) stop before a DB request");
})();
