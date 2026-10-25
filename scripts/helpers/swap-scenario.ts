/**
 * Builds one in-memory account + session for swap-path tests and drives the
 * REAL server actions (findAlternatives, swapExercise) and the REAL
 * swapExerciseForUser against it.
 */
import catalogue from "../fixtures/catalogue.json";
import { Constants, type Database } from "../../src/lib/database.types";
import type { CandidateExercise } from "../../src/lib/program/generate";
import { createSwapDb, type Row, type SwapDb } from "./fake-swap-db";
import { stubState } from "./server-action-stubs";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type Level = Database["public"]["Enums"]["fitness_level"];

export type CatalogueRow = (typeof catalogue)[number];
export const CATALOGUE: CatalogueRow[] = catalogue;
export const bySlug = new Map(CATALOGUE.map((e) => [e.slug, e]));
export const byId = new Map(CATALOGUE.map((e) => [e.id, e]));

export function exercise(slug: string): CatalogueRow {
  const e = bySlug.get(slug);
  if (!e) throw new Error(`catalogue has no exercise "${slug}"`);
  return e;
}

export type Account = {
  level: Level;
  equipment: string[];
  injuries: Array<{ body_region: BodyRegion; severity: "current" | "past" }>;
};

export const USER_ID = "user-1";
export const SESSION_ID = "session-1";
export const SLOT_ID = "slot-1";

export function exerciseRow(e: CatalogueRow): Row {
  return { ...e, is_active: true, cue: null };
}

export function buildDb(opts: {
  account: Account;
  current: CatalogueRow;
  exercises: CatalogueRow[];
  siblings?: CatalogueRow[];
  loggedSets?: number;
}): SwapDb {
  const { account, current, exercises } = opts;
  const all = new Map<string, CatalogueRow>();
  for (const e of [current, ...exercises, ...(opts.siblings ?? [])]) all.set(e.id, e);
  return createSwapDb({
    exercises: [...all.values()].map(exerciseRow),
    session_exercises: [
      { id: SLOT_ID, session_id: SESSION_ID, exercise_id: current.id, metric: current.metric, planned_reps_min: 8, planned_reps_max: 12 },
      ...(opts.siblings ?? []).map((s, i) => ({
        id: `sibling-${i}`, session_id: SESSION_ID, exercise_id: s.id, metric: s.metric, planned_reps_min: 8, planned_reps_max: 12,
      })),
    ],
    profiles: [{
      id: USER_ID, goal: "muscle_gain", level: account.level, primary_track: "weights", days_per_week: 3,
      yoga_days_per_week: 0, date_of_birth: "1990-01-01", height_cm: 175, has_all_equipment: false,
    }],
    user_settings: [{ user_id: USER_ID, planning_mode: "auto" }],
    body_metrics: [{ user_id: USER_ID, weight_kg: 75, recorded_on: "2026-10-01" }],
    user_equipment: account.equipment.map((equipment_id) => ({ user_id: USER_ID, equipment_id })),
    user_injuries: account.injuries.map((i) => ({ user_id: USER_ID, ...i })),
    sessions: [{ id: SESSION_ID, is_deload: false }],
    exercise_progress: [],
    session_sets: Array.from({ length: opts.loggedSets ?? 0 }, (_, i) => ({ id: `set-${i}`, session_exercise_id: SLOT_ID })),
  });
}

/** PATCHes the server sent to session_exercises (i.e. swaps actually written). */
export function writes(db: SwapDb): Row[] {
  return db.requests.filter((r) => r.method === "PATCH" && r.table === "session_exercises").map((r) => r.body ?? {});
}

export function activateDb(db: SwapDb): void {
  stubState.client = db.client;
  stubState.userId = USER_ID;
}

/**
 * A catalogue row typed as the generator's CandidateExercise, without a cast:
 * every enum column is narrowed against the generated Constants and an unknown
 * value throws (a fixture/schema drift would fail the test loudly).
 */
type Enums = Database["public"]["Enums"];
const E = Constants.public.Enums;

function oneOf<T extends string>(allowed: readonly T[], value: string | null, field: string, slug: string): T {
  const hit = allowed.find((v) => v === value);
  if (hit === undefined) throw new Error(`catalogue ${slug}: ${field} "${value}" is not a known enum value`);
  return hit;
}

export function toCandidate(row: CatalogueRow): CandidateExercise {
  const s = row.slug;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    movement_pattern: oneOf<Enums["movement_pattern"]>(E.movement_pattern, row.movement_pattern, "movement_pattern", s),
    mechanic: row.mechanic === null ? null : oneOf<Enums["mechanic_type"]>(E.mechanic_type, row.mechanic, "mechanic", s),
    metric: oneOf<Enums["exercise_metric"]>(E.exercise_metric, row.metric, "metric", s),
    primary_muscles: row.primary_muscles.map((m) => oneOf<Enums["muscle"]>(E.muscle, m, "primary_muscles", s)),
    equipment_ids: row.equipment_ids,
    level_min: oneOf<Enums["fitness_level"]>(E.fitness_level, row.level_min, "level_min", s),
    contraindicated_regions: row.contraindicated_regions.map((r) => oneOf<Enums["body_region"]>(E.body_region, r, "contraindicated_regions", s)),
    impact: oneOf<Enums["impact_level"]>(E.impact_level, row.impact, "impact", s),
    spinal_load: oneOf<Enums["spinal_load_level"]>(E.spinal_load_level, row.spinal_load, "spinal_load", s),
    tracks: row.tracks.map((t) => oneOf<Enums["track_type"]>(E.track_type, t, "tracks", s)),
    default_rest_seconds: row.default_rest_seconds,
    category: oneOf<Enums["exercise_category"]>(E.exercise_category, row.category, "category", s),
  };
}
