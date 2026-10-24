import type { Database } from "@/lib/database.types";
import { daysBetween } from "@/lib/dates";

type Goal = Database["public"]["Enums"]["fitness_goal"];
type Level = Database["public"]["Enums"]["fitness_level"];
type Metric = Database["public"]["Enums"]["exercise_metric"];

export type Prescription = {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

/**
 * Goal decides rep range and rest. This is the strongest input we collect, and
 * SPEC section 4 fixes these numbers -- do not tune them here without updating it.
 */
const BY_GOAL: Record<Goal, Prescription> = {
  strength: { sets: 4, repsMin: 3, repsMax: 6, restSeconds: 180 },
  muscle_gain: { sets: 4, repsMin: 8, repsMax: 12, restSeconds: 90 },
  fat_loss: { sets: 3, repsMin: 12, repsMax: 15, restSeconds: 50 },
  general_fitness: { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 75 },
  flexibility_stress: { sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 },
};

/** Beginners get less volume; advanced lifters can hold more. */
const SET_ADJUSTMENT: Record<Level, number> = {
  beginner: -1,
  intermediate: 0,
  expert: 0,
};

/**
 * Hold lengths in seconds, by goal, for exercises whose metric is `seconds`.
 *
 * A plank prescribed as "8-12 reps" is meaningless, which is what the app did
 * before `exercises.metric` existed. These mirror the rep table above: the
 * strength end is short and heavy, the fat-loss end is long and dense.
 *
 * They are a range in the exercise's own metric, so they travel through
 * `target_reps_min` / `target_reps_max` like any other range -- see SPEC.md
 * section 7, "Timed exercises".
 */
const HOLD_SECONDS_BY_GOAL: Record<Goal, { min: number; max: number }> = {
  strength: { min: 15, max: 30 },
  muscle_gain: { min: 20, max: 40 },
  fat_loss: { min: 30, max: 60 },
  general_fitness: { min: 20, max: 45 },
  flexibility_stress: { min: 30, max: 60 },
};

/** A hold never needs a heavy-single rest, however the goal is set. */
const MAX_HOLD_REST_SECONDS = 75;

export function prescribe(
  goal: Goal,
  level: Level,
  isolation: boolean,
  metric: Metric = "reps",
  sessionMinutes?: number,
): Prescription {
  const base = BY_GOAL[goal];
  let sets = Math.max(2, base.sets + SET_ADJUSTMENT[level]);

  // QA feedback: 45 min sessions were cutting exercises but keeping 4 sets each,
  // still overrunning time. Reduce sets for shorter sessions to keep coverage.
  if (sessionMinutes !== undefined && sessionMinutes <= 45) {
    sets = Math.max(2, sets - 1);
  }

  if (metric === "seconds") {
    const hold = HOLD_SECONDS_BY_GOAL[goal];
    return {
      sets,
      repsMin: hold.min,
      repsMax: hold.max,
      restSeconds: Math.min(base.restSeconds, MAX_HOLD_REST_SECONDS),
    };
  }

  // Isolation work does not need heavy-single rest periods, and strength rep
  // ranges make no sense on a lateral raise.
  if (isolation) {
    return {
      sets: Math.max(2, sets - 1),
      repsMin: Math.max(base.repsMin, 8),
      repsMax: Math.max(base.repsMax, 12),
      restSeconds: Math.min(base.restSeconds, 75),
    };
  }

  return { ...base, sets };
}

/** Week 4 of every block is a deload: less volume, nothing near failure. */
export function applyDeload(p: Prescription): Prescription {
  return {
    sets: Math.max(2, Math.round(p.sets * 0.6)),
    repsMin: p.repsMin,
    repsMax: p.repsMax,
    restSeconds: p.restSeconds,
  };
}

/** A training block runs four weeks, the last of which is the deload. */
export const BLOCK_WEEKS = 4;

/**
 * Which week of the block a date falls in, 1..BLOCK_WEEKS.
 *
 * Both callers used to compute this inline, and both did it by subtracting a
 * locally-parsed date from a UTC-parsed one — the trap `lib/dates.ts` opens by
 * warning about. It happened to be correct because Vercel runs functions in
 * UTC, where the two parse identically, and would have shifted by a day the
 * moment that stopped being true. `daysBetween` reads both sides as UTC, so the
 * answer is a difference of calendar days with no clock in it.
 *
 * Clamped at both ends: a block that has run past its four weeks reports week 4
 * until the rollover replaces it, and a start date in the future reports week 1
 * rather than zero or negative.
 */
export function weekInBlock(startedOn: string, today: string): number {
  const days = daysBetween(startedOn, today);
  return Math.min(BLOCK_WEEKS, Math.max(1, Math.floor(days / 7) + 1));
}
