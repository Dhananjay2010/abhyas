#!/usr/bin/env npx tsx
/**
 * Metric fix: Start session must use replacement's metric.
 * 
 * Mutant: Don't update metric when replacing banned exercise.
 * Example: one-leg-barbell-squat (reps) → wall-sit (seconds), must use seconds.
 */

import { readFileSync } from "fs";
import { createFakeDb } from "./helpers/fake-postgrest";
import { buildStartSessionFullDeps } from "../src/lib/session/start-session-full-deps";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";
import type { ProgramDayExercise } from "../src/lib/session/start-session-full-core";

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];

const catalogueRows: ExerciseRow[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);
const catalogue = toCandidateExercises(catalogueRows);

// Find an exercise that gets replaced with different metric
const barbell = catalogue.find(e => e.slug === "one-leg-barbell-squat");
const wallSit = catalogue.find(e => e.slug === "wall-sit");

if (!barbell || !wallSit) {
  console.error("✗ FAIL: Test exercises not found");
  process.exit(1);
}

console.log("Testing metric fix: start session\n");
console.log(`  Original: ${barbell.slug} (${barbell.metric})`);
console.log(`  Replacement: ${wallSit.slug} (${wallSit.metric})`);

if (barbell.metric === wallSit.metric) {
  console.log("⊘ SKIP: Metrics are the same, test not applicable");
  process.exit(0);
}

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
        started_on: "2024-01-01",
        deload_week: 4,
        week_offset: 0,
      }],
      user_injuries: [{ body_region: "knee", severity: "current", user_id: "u1" }],
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
      user_equipment: catalogue.flatMap(e => e.equipment_ids.map(id => ({ equipment_id: id, user_id: "u1" }))),
      program_days: [{ id: "pd1", program_id: "prog1", day_index: 1, day_type: "strength", status: "active" }],
      program_day_exercises: [{
        id: "pde1",
        program_day_id: "pd1",
        exercise_id: barbell.id,
        order_index: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
      }],
    },
  });

  const deps = buildStartSessionFullDeps(fake.client, "u1", Date.now());

  if (!deps.cleanBannedExercises) {
    console.error("✗ FAIL: cleanBannedExercises not available");
    process.exit(1);
  }

  const planned = [{
    id: "pde1",
    exercise_id: barbell.id,
    order_index: 0,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
    exercises: { metric: barbell.metric },
  }];

  const cleaned = await deps.cleanBannedExercises!(planned as ProgramDayExercise[]);

  if (cleaned.length === 0) {
    console.error("✗ FAIL: No exercises after cleanup");
    process.exit(1);
  }

  const first = cleaned[0];
  const catalogueEntry = catalogue.find(e => e.id === first.exercise_id);

  if (!catalogueEntry) {
    console.error("✗ FAIL: Replacement not found in catalogue");
    process.exit(1);
  }

  const embeddedMetric = (first.exercises as { metric: string }).metric;

  if (embeddedMetric !== catalogueEntry.metric) {
    console.error("✗ FAIL: Metric fix - Start session uses wrong metric");
    console.error(`  Mutant: Don't update metric when replacing`);
    console.error(`  Exercise: ${catalogueEntry.slug} (${catalogueEntry.id})`);
    console.error(`  Catalogue metric: ${catalogueEntry.metric}`);
    console.error(`  Embedded metric:  ${embeddedMetric}`);
    process.exit(1);
  }

  console.log("✓ PASS: Metric fix - Start uses replacement's metric");
  console.log(`  Replacement:      ${catalogueEntry.slug}`);
  console.log(`  Catalogue metric: ${catalogueEntry.metric}`);
  console.log(`  Embedded metric:  ${embeddedMetric} ✓`);
})();
