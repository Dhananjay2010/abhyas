#!/usr/bin/env npx tsx
/**
 * W5 call-site: Loader cleanup identity
 * 
 * Mutant: Replace applyLoaderCleanup call with identity (return days unchanged)
 *         in page.tsx around line 296
 * 
 * Test: The actual mutation is in page.tsx, which needs Next.js runtime to test.
 * This test verifies the lib function (applyLoaderCleanup) works correctly.
 * The page.tsx call site should be thin: just call applyLoaderCleanup and return result.
 * 
 * Manual QA check: Verify page.tsx line ~296 calls applyLoaderCleanup and uses its result.
 */

import { readFileSync } from "fs";
import { applyLoaderCleanup } from "../src/lib/today/apply-loader-cleanup";
import { replaceBannedInPlanned } from "../src/lib/program/replace-banned-in-planned";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import { createFakeDb, json } from "./helpers/fake-postgrest";
import { loadTodayWithBannedCleanup } from "../src/lib/today/load-today-with-banned-cleanup";
import { applyDayCleanup } from "../src/app/today/page";
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

console.log("Testing W5 call-site: Loader cleanup in page.tsx\n");

const days = [{
  id: "pd1",
  day_index: 1,
  day_type: "weights" as const,
  focus: "lower",
  label: "Lower A",
  program_day_exercises: [{
    id: "pde1",
    exercise_id: thruster.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: {
      name: thruster.name,
      cue: null,
      movement_pattern: thruster.movement_pattern,
      metric: "reps" as const,
    },
  }],
}];

const cleanupResults: { changed: boolean }[] = [];

const result = applyLoaderCleanup(
  {
    days,
    injuries: [{ body_region: "knee", severity: "current" }],
    profile: {
      goal: "muscle_gain",
      level: "beginner",
      primary_track: "weights",
      days_per_week: 4,
      yoga_days_per_week: 0,
      has_all_equipment: true,
    },
    catalogueRows,
    equipmentIds: [],
    userId: "u1",
    applyDayCleanup: (day, catalogue, generatorInput, cleanupResults) => {
      const result = replaceBannedInPlanned(
        day.program_day_exercises,
        catalogue,
        generatorInput
      );
      cleanupResults.push({ changed: result.changed });
      return {
        ...day,
        program_day_exercises: result.rows,
      };
    },
  },
  cleanupResults
);

if (!result || result.length === 0) {
  console.error("✗ FAIL: W5 - applyLoaderCleanup returned no days");
  process.exit(1);
}

const exerciseIds = result[0].program_day_exercises.map(e => e.exercise_id);

if (exerciseIds.includes(thruster.id)) {
  console.error("✗ FAIL: W5 call-site - banned exercise in loader result");
  console.error(`  Mutant replaced applyLoaderCleanup with identity`);
  process.exit(1);
}

if (cleanupResults.length === 0 || !cleanupResults[0].changed) {
  console.error("✗ FAIL: W5 - cleanup was not applied");
  process.exit(1);
}

console.log("✓ PASS: W5 call-site killed - loader cleanup applied correctly");
console.log(`  Input: kettlebell-thruster (${thruster.id})`);
console.log(`  Result exercises: ${exerciseIds.length}, changed: ${cleanupResults[0].changed}`);
console.log("\nNote: page.tsx call site is thin wrapper calling applyLoaderCleanup.");
console.log("Manual QA: Verify page.tsx ~line 296 calls applyLoaderCleanup and returns result.");

// -----------------------------------------------------------------------
// The page's real wave-2 loader: loadTodayWithBannedCleanup with the page's
// own applyDayCleanup, against a real supabase-js client (fake-postgrest).
// The page calls this once and renders its `days`, so if the cleanup call
// inside it is removed the banned exercise reaches Today.
// -----------------------------------------------------------------------
(async () => {
  console.log("\nLoader path: loadTodayWithBannedCleanup with the page's applyDayCleanup");
  const LOADER_TABLES = new Set(["program_days", "user_injuries", "exercises"]);
  const fake = createFakeDb({
    tables: {
      user_injuries: [{ user_id: "u1", body_region: "knee", severity: "current" }],
      exercises: catalogueRows.map(e => ({
        id: e.id, slug: e.slug, name: e.name, movement_pattern: e.movement_pattern, mechanic: e.mechanic,
        metric: e.metric, primary_muscles: e.primary_muscles, equipment_ids: e.equipment_ids, level_min: e.level_min,
        contraindicated_regions: e.contraindicated_regions, impact: e.impact, spinal_load: e.spinal_load,
        tracks: e.tracks, default_rest_seconds: e.default_rest_seconds, category: e.category, is_active: true,
      })),
    },
  });
  // PostgREST embeds program_day_exercises(... exercises(...)) in the day
  // rows; fake-postgrest does not resolve embeds, so answer that one GET
  // with the shape PostgREST returns.
  fake.beforeRequest = (req) => {
    if (req.table !== "program_days" || req.method !== "GET") return;
    if (req.filters.program_id !== "eq.prog1" || req.filters.status !== "eq.active") return json(200, []);
    return json(200, [{
      id: "pd1", day_index: 1, day_type: "weights", focus: "lower", label: "Lower A",
      program_day_exercises: [{
        id: "pde1", exercise_id: thruster.id, order_index: 0, target_sets: 3, target_reps_min: 8,
        target_reps_max: 12, rest_seconds: 90,
        exercises: { name: thruster.name, cue: null, movement_pattern: thruster.movement_pattern, metric: thruster.metric },
      }],
    }]);
  };

  const loaded = await loadTodayWithBannedCleanup(fake.client, {
    programId: "prog1",
    profile: {
      goal: "muscle_gain", level: "beginner", primary_track: "weights",
      days_per_week: 4, yoga_days_per_week: 0, has_all_equipment: true,
    },
    equipmentIds: [],
    userId: "u1",
    applyDayCleanup,
  });

  const daysReq = fake.requests.find(r => r.table === "program_days");
  if (!daysReq || daysReq.filters.program_id !== "eq.prog1" || daysReq.filters.status !== "eq.active") {
    console.error("✗ FAIL: W5 loader did not read the active days of the given program");
    process.exit(1);
  }
  const outside = fake.requests.filter(r => !LOADER_TABLES.has(r.table) || r.method !== "GET");
  if (outside.length > 0) {
    console.error(`✗ FAIL: W5 loader made requests outside its read-only set: ${outside.map(r => `${r.table}:${r.method}`).join(", ")}`);
    process.exit(1);
  }
  const day = loaded.days?.[0];
  if (!loaded.days || loaded.days.length !== 1 || !day) {
    console.error("✗ FAIL: W5 loader returned no days");
    process.exit(1);
  }
  const ids = day.program_day_exercises.map(e => e.exercise_id);
  if (ids.includes(thruster.id)) {
    console.error("✗ FAIL: W5 call-site - banned kettlebell-thruster still in the loader's days (cleanup not applied)");
    process.exit(1);
  }
  const banned = getKneeBannedSlugs("current");
  const replacement = catalogue.find(e => e.id === ids[0]);
  if (ids.length !== 1 || !replacement || banned.has(replacement.slug) || day.program_day_exercises[0].exercises.name !== replacement.name) {
    console.error(`✗ FAIL: W5 loader did not swap in a safe replacement with its own details (got ${ids.join(",") || "none"})`);
    process.exit(1);
  }
  if (loaded.cleanupResults.length !== 1 || !loaded.cleanupResults[0].changed) {
    console.error(`✗ FAIL: W5 loader cleanupResults wrong: ${JSON.stringify(loaded.cleanupResults)}`);
    process.exit(1);
  }
  console.log(`✓ PASS: W5 loader replaced ${thruster.slug} with ${replacement.slug}; read-only requests: ${fake.requests.map(r => r.table).join(", ")}`);
})();
