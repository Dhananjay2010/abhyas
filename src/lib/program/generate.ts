import type { Database } from "@/lib/database.types";
import { applyDeload, prescribe, type Prescription } from "./prescription";
import { activeDayIndices, placeYoga, splitFor, templatesFor } from "./splits";

type Enums = Database["public"]["Enums"];
type Pattern = Enums["movement_pattern"];
type Level = Enums["fitness_level"];
type Goal = Enums["fitness_goal"];
type Track = Enums["track_type"];
type DayType = Enums["day_type"];
type BodyRegion = Enums["body_region"];

export type CandidateExercise = {
  id: string;
  slug: string;
  name: string;
  movement_pattern: Pattern;
  mechanic: Enums["mechanic_type"] | null;
  /** `seconds` for a hold, which is prescribed as a time range, not reps. */
  metric: Enums["exercise_metric"];
  primary_muscles: Enums["muscle"][];
  equipment_ids: string[];
  level_min: Level;
  contraindicated_regions: BodyRegion[];
  impact: Enums["impact_level"];
  spinal_load: Enums["spinal_load_level"];
  tracks: Track[];
  default_rest_seconds: number;
};

export type GeneratorInput = {
  userId: string;
  blockNumber: number;
  goal: Goal;
  level: Level;
  primaryTrack: Track;
  daysPerWeek: number;
  yogaDaysPerWeek: number;
  age: number | null;
  bmi: number | null;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  /** Current injuries hard-filter. Past ones only drive warm-up prehab. */
  currentInjuryRegions: BodyRegion[];
  /** Preferred session length in minutes. Affects exercise count. */
  preferredSessionMinutes?: number;
  catalogue: CandidateExercise[];
  /**
   * Main lifts from the previous block, keyed `${dayIndex}:${pattern}`.
   *
   * Day INDEX, not label: a 4-day split is Upper/Lower/Upper/Lower, so labels
   * repeat and both Upper days would collide on one key, leaving the second
   * unable to carry its own main lift.
   *
   * SPEC section 6: at block end the main compound lifts carry over, because
   * that is where progress lives, while accessories rotate for variety. Only
   * the first two slots of a day consult this.
   */
  carryOver?: Record<string, string>;
};

/** How many slots per day are treated as the main lifts. */
export const CARRY_OVER_SLOTS = 2;

/**
 * How many exercises to prescribe based on session length. Longer sessions have
 * more exercises; shorter sessions cut accessories, not main lifts.
 */
function exerciseCountForDuration(
  sessionMinutes: number,
  templateSlots: number,
): number {
  // Estimated time budget: 15min warmup leaves the rest for work sets + rest.
  // Each exercise takes roughly 6-8 minutes (3-4 sets × 45s work + 60-90s rest).
  const workMinutes = Math.max(15, sessionMinutes - 15);
  const capacity = Math.floor(workMinutes / 7);

  // Always keep at least 2 main lifts; cap at template slot count.
  return Math.max(2, Math.min(templateSlots, capacity));
}

export type GeneratedExercise = {
  exerciseId: string;
  name: string;
  orderIndex: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
};

export type GeneratedDay = {
  dayIndex: number;
  dayType: DayType;
  focus: string | null;
  label: string;
  exercises: GeneratedExercise[];
};

export type GeneratedProgram = {
  splitType: Enums["split_type"];
  daysPerWeek: number;
  blockNumber: number;
  deloadWeek: number;
  days: GeneratedDay[];
};

const LEVEL_RANK: Record<Level, number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

/** If a pattern has nothing available, fall back to the nearest useful thing. */
const PATTERN_FALLBACK: Partial<Record<Pattern, Pattern>> = {
  vertical_pull: "horizontal_pull",
  horizontal_pull: "vertical_pull",
  vertical_press: "horizontal_press",
  horizontal_press: "vertical_press",
  lunge: "squat",
  squat: "lunge",
  hinge: "squat",
  rear_delt: "horizontal_pull",
  lateral_delt: "vertical_press",
  triceps: "horizontal_press",
  biceps: "horizontal_pull",
  calf: "core",
};

/**
 * Staple movements: exercises that beginners should reliably get instead of
 * random tie picks. When scores are equal, these win. Keyed by pattern for
 * targeted preference.
 */
const STAPLE_MOVEMENTS: Partial<Record<Pattern, string[]>> = {
  horizontal_press: ["pushups", "push-up-wide", "bench-press"],
  squat: ["bodyweight-squat", "goblet-squat", "barbell-squat"],
  hinge: ["romanian-deadlift", "glute-bridge", "deadlift"],
  horizontal_pull: ["barbell-row", "bent-over-row", "dumbbell-row"],
  vertical_pull: ["pullups", "chin-ups", "lat-pulldown"],
  vertical_press: ["pike-push-up", "overhead-press", "dumbbell-shoulder-press"],
};

/** Deterministic PRNG so the same inputs always produce the same block. */
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, seedless string hash. Exported so the swap list can vary its ties. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isEligible(ex: CandidateExercise, input: GeneratorInput): boolean {
  // Track: a bodyweight-at-home user must never be shown gym-only work.
  if (input.primaryTrack === "bodyweight" && !ex.tracks.includes("bodyweight")) {
    return false;
  }

  // Level: never prescribe something above the user's stated experience.
  if (LEVEL_RANK[ex.level_min] > LEVEL_RANK[input.level]) return false;

  // Equipment is a hard filter -- SPEC section 4.
  if (!input.hasAllEquipment) {
    const available = new Set(input.equipmentIds);
    if (!ex.equipment_ids.every((e) => available.has(e))) return false;
  }

  // Current injuries exclude anything that loads the affected joint.
  if (
    input.currentInjuryRegions.length > 0 &&
    ex.contraindicated_regions.some((r) => input.currentInjuryRegions.includes(r))
  ) {
    return false;
  }

  // BMI >= 30 excludes high-impact work; age >= 50 caps spinal loading.
  if (input.bmi !== null && input.bmi >= 30 && ex.impact === "high") return false;
  if (input.age !== null && input.age >= 50 && ex.spinal_load === "high") return false;

  return true;
}

/**
 * How well an exercise suits a slot. Exported so the swap list can rank by the
 * same rule the plan was built with, rather than offering an arbitrary handful.
 */
export function score(
  ex: CandidateExercise,
  wantCompound: boolean,
  level: Level,
  primaryTrack: Track = "weights",
  pattern?: Pattern,
): number {
  let s = 0;
  if (wantCompound && ex.mechanic === "compound") s += 4;
  if (!wantCompound && ex.mechanic === "isolation") s += 3;
  if (ex.level_min === level) s += 1;

  // Prefer the simplest setup that does the job — but only for bodyweight/home
  // users. For gym users, equipment is not a penalty; having a barbell is what
  // bench press needs, not a reason to avoid it.
  if (primaryTrack === "bodyweight") {
    s -= Math.max(0, ex.equipment_ids.length - 1);
  }

  // Staple bonus: when scores would otherwise tie, beginners should get
  // push-ups/squats/rows instead of random picks.
  if (pattern && wantCompound && level === "beginner") {
    const staples = STAPLE_MOVEMENTS[pattern] ?? [];
    if (staples.includes(ex.slug)) {
      s += 0.5;
    }
  }

  return s;
}

function pickForSlot(
  pattern: Pattern,
  slotIndex: number,
  pool: CandidateExercise[],
  used: Set<string>,
  input: GeneratorInput,
  rng: () => number,
  dayIndex?: number,
): CandidateExercise | null {
  const wantCompound = slotIndex < CARRY_OVER_SLOTS;

  // Keep the main lifts from the previous block so progression is not reset.
  if (wantCompound && dayIndex !== undefined && input.carryOver) {
    const kept = input.carryOver[`${dayIndex}:${pattern}`];
    if (kept && !used.has(kept)) {
      const match = pool.find((e) => e.id === kept);
      if (match) return match;
    }
  }

  for (const p of [pattern, PATTERN_FALLBACK[pattern]]) {
    if (!p) continue;
    const candidates = pool.filter((e) => e.movement_pattern === p && !used.has(e.id));
    if (candidates.length === 0) continue;

    const ranked = candidates
      .map((e) => ({ e, k: score(e, wantCompound, input.level, input.primaryTrack, p) + rng() }))
      .sort((a, b) => b.k - a.k || a.e.slug.localeCompare(b.e.slug));

    return ranked[0].e;
  }
  return null;
}

export function generateProgram(input: GeneratorInput): GeneratedProgram {
  // A yoga- or breathing-led plan is a week of that practice plus rest. It is
  // NOT a strength split: previously these tracks fell through to push/pull/
  // legs, so someone who chose yoga was handed six days of weights and no yoga
  // at all, with the equipment filter then emptying half the days.
  if (input.primaryTrack === "yoga" || input.primaryTrack === "meditation") {
    const active = new Set(activeDayIndices(input.daysPerWeek));
    const isYoga = input.primaryTrack === "yoga";
    return {
      splitType: "custom",
      daysPerWeek: input.daysPerWeek,
      blockNumber: input.blockNumber,
      deloadWeek: 4,
      days: Array.from({ length: 7 }, (_, i) => {
        const dayIndex = i + 1;
        const on = active.has(dayIndex);
        return {
          dayIndex,
          dayType: on ? input.primaryTrack : ("rest" as DayType),
          focus: on ? input.primaryTrack : null,
          label: on ? (isYoga ? "Yoga" : "Breathing") : "Rest",
          exercises: [],
        };
      }),
    };
  }

  const trainingDays = Math.max(
    1,
    input.daysPerWeek - Math.min(input.yogaDaysPerWeek, input.daysPerWeek - 1),
  );
  const yogaDays = Math.min(input.yogaDaysPerWeek, input.daysPerWeek - 1);

  const pool = input.catalogue.filter((e) => isEligible(e, input));
  const rng = mulberry32(hashString(`${input.userId}:${input.blockNumber}`));

  const templates = templatesFor(trainingDays);
  const laidOut = placeYoga(templates, yogaDays);
  const activeIdx = activeDayIndices(input.daysPerWeek);

  const used = new Set<string>();
  const days: GeneratedDay[] = [];

  for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
    const slotPos = activeIdx.indexOf(dayIndex);

    if (slotPos === -1 || slotPos >= laidOut.length) {
      days.push({
        dayIndex,
        dayType: "rest",
        focus: null,
        label: "Rest",
        exercises: [],
      });
      continue;
    }

    const entry = laidOut[slotPos];

    if (entry === "yoga") {
      days.push({
        dayIndex,
        dayType: "yoga",
        focus: "yoga",
        label: "Yoga",
        exercises: [],
      });
      continue;
    }

    const exercises: GeneratedExercise[] = [];
    const sessionMinutes = input.preferredSessionMinutes ?? 60;
    const maxExercises = exerciseCountForDuration(sessionMinutes, entry.slots.length);

    // Pick exercises for each slot
    const pickedExercises: Array<{ ex: CandidateExercise; slotIndex: number }> = [];
    entry.slots.slice(0, maxExercises).forEach((pattern, i) => {
      const picked = pickForSlot(pattern, i, pool, used, input, rng, dayIndex);
      if (!picked) return;
      used.add(picked.id);
      pickedExercises.push({ ex: picked, slotIndex: i });
    });

    // Sort exercises within the day: main compounds first, then secondary compounds,
    // then accessories/isolation, with core exercises last. This keeps sessions
    // trainer-quality (squat before bicep curls, abs at the end).
    // Must stay deterministic (slug as tiebreaker).
    const ordered = pickedExercises.sort((a, b) => {
      const aCore = a.ex.movement_pattern === "core";
      const bCore = b.ex.movement_pattern === "core";
      if (aCore && !bCore) return 1;  // Core goes last
      if (!aCore && bCore) return -1;
      
      const aCompound = a.ex.mechanic === "compound";
      const bCompound = b.ex.mechanic === "compound";
      if (aCompound && !bCompound) return -1;  // Compounds before isolation
      if (!aCompound && bCompound) return 1;
      
      // Within same mechanic, preserve slot order (main lifts stay in first slots)
      if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
      
      // Deterministic tiebreaker
      return a.ex.slug.localeCompare(b.ex.slug);
    });

    // Convert sorted picks to GeneratedExercise with correct orderIndex
    ordered.forEach((item, orderIndex) => {
      const isolation = item.ex.mechanic === "isolation";
      const p: Prescription = prescribe(
        input.goal,
        input.level,
        isolation,
        item.ex.metric ?? "reps",
      );

      exercises.push({
        exerciseId: item.ex.id,
        name: item.ex.name,
        orderIndex,
        targetSets: p.sets,
        targetRepsMin: p.repsMin,
        targetRepsMax: p.repsMax,
        restSeconds: p.restSeconds,
      });
    });

    // A day with no exercises is a dead end for the user, and it happens when
    // the eligible pool has nothing for any of the day's patterns -- a
    // bodyweight user with no pull-up bar has no pulling movement at all. Fall
    // back to whatever is eligible rather than shipping an empty day.
    //
    // The day is relabelled when that happens. It used to keep its template
    // name, so a bodyweight-at-home beginner was shown a day headed "Pull"
    // whose five exercises were sit-ups and crunches: not one pulling
    // movement, because the catalogue has no equipment-free horizontal pull.
    // Calling it what it is beats naming a muscle group it does not train.
    const backfilled = exercises.length === 0;
    if (exercises.length === 0) {
      const backfill = pool
        .filter((e) => !used.has(e.id))
        .sort(
          (a, b) =>
            score(b, true, input.level, input.primaryTrack) -
              score(a, true, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug),
        )
        .slice(0, 4);

      backfill.forEach((picked) => {
        used.add(picked.id);
        const p = prescribe(
          input.goal,
          input.level,
          picked.mechanic === "isolation",
          picked.metric ?? "reps",
        );
        exercises.push({
          exerciseId: picked.id,
          name: picked.name,
          orderIndex: exercises.length,
          targetSets: p.sets,
          targetRepsMin: p.repsMin,
          targetRepsMax: p.repsMax,
          restSeconds: p.restSeconds,
        });
      });
    }

    days.push({
      dayIndex,
      dayType: input.primaryTrack === "bodyweight" ? "bodyweight" : "weights",
      focus: entry.focus,
      label: backfilled ? "Full body" : entry.label,
      exercises,
    });
  }

  return {
    splitType: splitFor(trainingDays),
    daysPerWeek: input.daysPerWeek,
    blockNumber: input.blockNumber,
    deloadWeek: 4,
    days,
  };
}

export { applyDeload };
