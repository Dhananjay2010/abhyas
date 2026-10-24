import type { Database } from "@/lib/database.types";
import { effectiveRepsMax } from "./effective-target";

type Enums = Database["public"]["Enums"];
type Pattern = Enums["movement_pattern"];
type Feel = Enums["set_feel"];

/**
 * One logged set.
 *
 * `durationSeconds` is what was held, for an exercise whose metric is
 * `seconds`. It is kept separate from `reps` rather than folded into it so the
 * caller cannot accidentally pass a hold length where a rep count is meant --
 * `valueOf` below is the only place the two are treated alike.
 */
export type LoggedSet = {
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
};

export type ProgressState = {
  currentWorkingWeightKg: number | null;
  currentTargetReps: number | null;
  consecutiveFailures: number;
  bestWeightKg: number | null;
  bestReps: number | null;
  bestE1rm: number | null;
  totalSessions: number;
};

export type ExerciseMeta = {
  mechanic: Enums["mechanic_type"] | null;
  movementPattern: Pattern;
  /** `seconds` for a hold: the target range and every logged set are times. */
  metric: Enums["exercise_metric"];
  /** No external load: progression moves through reps and harder variations. */
  isBodyweight: boolean;
  progressionChain: string | null;
  progressionRank: number | null;
  equipmentIds: string[];
};

export type Outcome =
  | "progressed"
  | "hold"
  | "backed_off"
  | "variation_up"
  | "deload_week"
  | "no_data";

/**
 * A best that was BEATEN in this session, per SPEC section 7.
 *
 * Setting a baseline is not a record: the first time an exercise is performed
 * there is nothing to beat, so `evaluateProgression` reports one of these only
 * when the user had a previous best to improve on.
 */
export type PersonalBest =
  | { kind: "weight"; value: number }
  | { kind: "hold"; value: number }
  | { kind: "reps"; value: number }
  | { kind: "e1rm"; value: number };

/** One line, for the session summary. */
export function describePersonalBest(pb: PersonalBest): string {
  switch (pb.kind) {
    case "weight":
      return `Heaviest set yet — ${pb.value} kg`;
    case "hold":
      return `Longest hold yet — ${pb.value}s`;
    case "reps":
      return `Most reps yet — ${pb.value}`;
    case "e1rm":
      return `Best estimated one-rep max yet — ${Math.round(pb.value)} kg`;
  }
}

export type Decision = {
  outcome: Outcome;
  nextWorkingWeightKg: number | null;
  nextTargetReps: number | null;
  consecutiveFailures: number;
  /** Ask the caller to look up the next exercise in the progression chain. */
  wantsHarderVariation: boolean;
  bestWeightKg: number | null;
  bestReps: number | null;
  bestE1rm: number | null;
  /** Null unless a previous best was beaten. At most one, per SPEC section 7. */
  personalBest: PersonalBest | null;
  message: string;
};

/** How much longer to hold once the top of the range is reached every set. */
export const HOLD_STEP_SECONDS = 5;

/**
 * Past this, a longer hold stops buying anything.
 *
 * Two minutes of plank is an endurance stunt rather than training, so the
 * chain moves to a harder variation instead -- the same shape as bodyweight
 * rep progression, which stops adding reps and changes the movement.
 */
export const HOLD_CEILING_SECONDS = 120;

/** Patterns driven by the legs and hips, where jumps can be larger. */
const LOWER_BODY: ReadonlySet<Pattern> = new Set<Pattern>([
  "squat",
  "hinge",
  "lunge",
  "calf",
]);

/**
 * Smallest sensible jump for this exercise, per SPEC section 6:
 * isolation +1.25 kg, upper compound +2.5 kg, lower compound +5 kg.
 */
export function incrementFor(meta: ExerciseMeta): number {
  if (meta.mechanic === "isolation") return 1.25;
  return LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;
}

/**
 * Step size for added weight on bodyweight exercises.
 * Upper-body and isolation: 1.25 kg. Lower-body: 2.5 kg.
 * Never 5 kg, and never doubled for 'easy' feel.
 */
export function addedWeightStep(meta: ExerciseMeta): number {
  if (meta.mechanic === "isolation") return 1.25;
  return LOWER_BODY.has(meta.movementPattern) ? 2.5 : 1.25;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Snap weight to equipment increments.
 * 
 * Kettlebells: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32 kg.
 * Uses nearest-down rule: ties and between-increments go to the lower bell.
 * Dumbbells and other equipment: use the standard grid (step).
 */
function roundToEquipment(value: number, step: number, equipmentIds: string[]): number {
  const hasKettlebell = equipmentIds.includes("kettlebell");
  if (!hasKettlebell) return roundTo(value, step);

  const KETTLEBELL_SIZES = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
  
  // Find the nearest kettlebell size, ties go down
  let nearest = KETTLEBELL_SIZES[0];
  let minDiff = Math.abs(value - nearest);
  
  for (const size of KETTLEBELL_SIZES) {
    const diff = Math.abs(value - size);
    if (diff < minDiff) {
      nearest = size;
      minDiff = diff;
    } else if (diff === minDiff && size < nearest) {
      // Tie: choose lower
      nearest = size;
    }
  }
  
  return nearest;
}

/** Epley. Only meaningful for a working set, so callers cap the rep count. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Double progression.
 *
 * Stay at a weight until every set reaches the TOP of the rep range, then add
 * the smallest sensible increment. Miss the target twice in a row and the
 * weight comes down about 10% to build back.
 *
 * Pure: no I/O, so it can be exercised directly against real scenarios.
 */
export function evaluateProgression(input: {
  sets: LoggedSet[];
  plannedSets: number;
  repsMin: number;
  repsMax: number;
  feel: Feel | null;
  meta: ExerciseMeta;
  state: ProgressState;
  isDeload: boolean;
}): Decision {
  const { sets, plannedSets, repsMax, feel, meta, state, isDeload } = input;

  const base = {
    nextWorkingWeightKg: state.currentWorkingWeightKg,
    nextTargetReps: state.currentTargetReps ?? repsMax,
    consecutiveFailures: state.consecutiveFailures,
    wantsHarderVariation: false,
    bestWeightKg: state.bestWeightKg,
    bestReps: state.bestReps,
    bestE1rm: state.bestE1rm,
    personalBest: null as PersonalBest | null,
  };

  const isTimed = meta.metric === "seconds";
  /** What this set is measured in: seconds held for a hold, reps otherwise. */
  const valueOf = (set: LoggedSet) => (isTimed ? (set.durationSeconds ?? null) : set.reps);
  const working = sets.filter((set) => {
    const v = valueOf(set);
    return v !== null && v > 0;
  });

  // A deload week is deliberately not a test of progress.
  if (isDeload) {
    return {
      ...base,
      outcome: "deload_week",
      // "Weights held where they were" is meaningless to someone doing planks
      // or press-ups, which is most of the bodyweight track.
      message:
        isTimed || state.currentWorkingWeightKg === null
          ? "Deload week — nothing moves this week."
          : "Deload week — weights held where they were.",
    };
  }

  if (working.length === 0) {
    return {
      ...base,
      outcome: "no_data",
      message: isTimed
        ? "No hold recorded, so nothing changed."
        : "No reps recorded, so nothing changed.",
    };
  }

  // Track bests regardless of whether the session counted as a success.
  const heaviest = Math.max(...working.map((s) => s.weightKg ?? 0));
  let bestWeightKg = state.bestWeightKg;
  let bestReps = state.bestReps;
  let bestE1rm = state.bestE1rm;

  for (const set of working) {
    const w = set.weightKg ?? 0;
    const v = valueOf(set) ?? 0;
    if (bestWeightKg === null || w > bestWeightKg) bestWeightKg = w;
    // For a hold this is the longest hold, not a rep count. Same column, same
    // "best so far" meaning, read through `metric`.
    if (bestReps === null || v > bestReps) bestReps = v;
    // An estimated one-rep max from a hold length is nonsense -- Epley over
    // seconds would make a 60 s weighted plank look like a triple bodyweight
    // lift -- so timed work never contributes one.
    if (w > 0 && !isTimed) {
      const e1rm = estimateOneRepMax(w, v);
      if (bestE1rm === null || e1rm > bestE1rm) bestE1rm = e1rm;
    }
  }

  /*
    What improved, if anything. Only one line is reported, because "heaviest set
    yet" and "best estimated 1RM yet" are usually the same event described twice
    and the summary should read like a person wrote it. Weight wins when both
    moved; the e1rm is what catches the real case the weight misses -- more reps
    at a weight already lifted.
  */
  let personalBest: PersonalBest | null = null;
  const beat = (now: number | null, before: number | null) =>
    now !== null && before !== null && now > before;

  if (isTimed) {
    if (beat(bestReps, state.bestReps)) {
      personalBest = { kind: "hold", value: bestReps! };
    }
  } else if (heaviest === 0) {
    if (beat(bestReps, state.bestReps)) {
      personalBest = { kind: "reps", value: bestReps! };
    }
  } else if (beat(bestWeightKg, state.bestWeightKg)) {
    personalBest = { kind: "weight", value: bestWeightKg! };
  } else if (beat(bestE1rm, state.bestE1rm)) {
    personalBest = { kind: "e1rm", value: bestE1rm! };
  }

  const carried = { ...base, bestWeightKg, bestReps, bestE1rm, personalBest };

  // Success requires the full set count AND the top of the rep range on each.
  // For unloaded bodyweight moves, use the progressed target if available.
  const completedAllSets = working.length >= plannedSets;
  const target = effectiveRepsMax({
    plannedMax: repsMax,
    progressedTarget: state.currentTargetReps,
    isBodyweight: meta.isBodyweight,
    usedWeight: heaviest,
  });
  const hitTopOfRange = working.every((set) => (valueOf(set) ?? 0) >= target);
  const succeeded = completedAllSets && hitTopOfRange;

  if (succeeded) {
    // Decide on what was ACTUALLY lifted, not on how the exercise is classified.
    // Keying off meta.isBodyweight meant a weighted sit-up or dip progressed
    // reps and never stored the load the user had used.
    if (heaviest === 0) {
      const canProgressVariation = meta.isBodyweight && meta.progressionChain !== null;
      const step = isTimed ? HOLD_STEP_SECONDS : 2;
      const nextTarget = (state.currentTargetReps ?? repsMax) + step;
      // Reps run out of usefulness relative to the range they started in; a
      // hold runs out at an absolute length, whatever it was prescribed at.
      const ceiling = isTimed ? HOLD_CEILING_SECONDS : repsMax + 4;

      if (canProgressVariation && nextTarget > ceiling) {
        return {
          ...carried,
          outcome: "variation_up",
          nextTargetReps: repsMax,
          consecutiveFailures: 0,
          wantsHarderVariation: true,
          message: "You have outgrown this variation — moving to a harder one.",
        };
      }

      // A hold with nowhere harder to go stops growing rather than marching on
      // to five-minute planks. Loading it is the honest next step.
      if (isTimed && nextTarget > ceiling) {
        return {
          ...carried,
          outcome: "hold",
          nextTargetReps: HOLD_CEILING_SECONDS,
          consecutiveFailures: 0,
          message: `Holding at ${HOLD_CEILING_SECONDS}s — longer stops adding much, so add weight instead.`,
        };
      }

      return {
        ...carried,
        outcome: "progressed",
        nextTargetReps: nextTarget,
        consecutiveFailures: 0,
        message: isTimed
          ? `Every set held to the top of the range — target goes up to ${nextTarget}s.`
          : `Every set at the top of the range — target goes up to ${nextTarget} reps.`,
      };
    }

    // Bodyweight with added weight: smaller steps, never doubled.
    // Loaded exercises: standard increment, doubled when easy.
    const isBodyweightWithAddedWeight = meta.isBodyweight && heaviest > 0;
    const step = isBodyweightWithAddedWeight ? addedWeightStep(meta) : incrementFor(meta);
    // For bodyweight moves, use max(stored, heaviest) so a 0 back-off doesn't
    // ignore the weight actually lifted. Loaded lifts keep their stored weight.
    const from = isBodyweightWithAddedWeight
      ? Math.max(state.currentWorkingWeightKg ?? 0, heaviest)
      : state.currentWorkingWeightKg ?? heaviest;
    // Snap off-grid weights to grid: smallest multiple of step strictly above from.
    const next = isBodyweightWithAddedWeight
      ? Math.floor(from / step) * step + step
      : roundToEquipment(from + (feel === "easy" ? step * 2 : step), step, meta.equipmentIds);

    return {
      ...carried,
      outcome: "progressed",
      nextWorkingWeightKg: next,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message:
        feel === "easy" && !isBodyweightWithAddedWeight
          ? `All sets at the top and it felt easy — up to ${next} kg.`
          : `All sets at the top of the range — up to ${next} kg.`,
    };
  }

  // Missed the target.
  const failures = state.consecutiveFailures + 1;
  const isBodyweightWithAddedWeight = meta.isBodyweight && heaviest > 0;
  const currentWeight = isBodyweightWithAddedWeight
    ? Math.max(state.currentWorkingWeightKg ?? 0, heaviest)
    : state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);

  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {
    // Bodyweight with added weight: drop two steps, floor at 0.
    // Loaded exercises: reduce by ~10%.
    if (meta.isBodyweight) {
      const step = addedWeightStep(meta);
      const reduced = Math.max(0, roundToEquipment(currentWeight - step * 2, step, meta.equipmentIds));
      return {
        ...carried,
        outcome: "backed_off",
        nextWorkingWeightKg: reduced,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message:
          reduced === 0
            ? "Missed twice in a row — back to bodyweight to build up again."
            : `Missed twice in a row — down to ${reduced} kg to build back.`,
      };
    }
    const step = incrementFor(meta);
    const reduced = Math.max(step, roundToEquipment(currentWeight * 0.9, step, meta.equipmentIds));
    return {
      ...carried,
      outcome: "backed_off",
      nextWorkingWeightKg: reduced,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message: `Missed twice in a row — dropping to ${reduced} kg to build back.`,
    };
  }

  return {
    ...carried,
    outcome: "hold",
    nextWorkingWeightKg: currentWeight,
    nextTargetReps: state.currentTargetReps ?? repsMax,
    consecutiveFailures: failures,
    // "this weight" is meaningless for a hold, and for any unloaded bodyweight
    // movement -- both were being told to stay at a weight they never had.
    message: isTimed
      ? "Staying at this hold length until every set reaches the top of the range."
      : currentWeight === null
        ? "Staying here until every set reaches the top of the range."
        : "Staying at this weight until every set reaches the top of the range.",
  };
}

/** What to put in the weight field when the exercise comes round again. */
export function suggestedWeight(
  state: Pick<ProgressState, "currentWorkingWeightKg">,
  isDeload: boolean,
  meta: ExerciseMeta,
): number | null {
  const w = state.currentWorkingWeightKg;
  if (w === null || w <= 0) return null;
  if (!isDeload) return w;
  // Deload: about 70% of working weight, on a loadable increment.
  // Bodyweight exercises with added weight use their own smaller steps. Tiny
  // added weights (70% rounds up to or above the original) drop one step. If
  // that reaches 0, return null (no added weight). Loaded exercises floor at
  // one step.
  const step = meta.isBodyweight ? addedWeightStep(meta) : incrementFor(meta);
  const deloaded = roundToEquipment(w * 0.7, step, meta.equipmentIds);
  if (meta.isBodyweight) {
    const result = deloaded >= w ? roundToEquipment(w - step, step, meta.equipmentIds) : deloaded;
    return result <= 0 ? null : result;
  }
  return Math.max(step, deloaded);
}

/**
 * Reset progression targets for all of a user's exercises.
 * 
 * Called when the goal changes or the block is rebuilt, so stale progressed
 * targets (e.g. currentTargetReps from an old plan with a different rep range)
 * are cleared and the next evaluation uses the new plan's range.
 */
export async function resetProgressionTargets(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<void> {
  await supabase
    .from("exercise_progress")
    .update({ current_target_reps: null })
    .eq("user_id", userId);
}
