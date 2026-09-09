import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];
type Pattern = Enums["movement_pattern"];
type Feel = Enums["set_feel"];

export type LoggedSet = { reps: number | null; weightKg: number | null };

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
  /** No external load: progression moves through reps and harder variations. */
  isBodyweight: boolean;
  progressionChain: string | null;
  progressionRank: number | null;
};

export type Outcome =
  | "progressed"
  | "hold"
  | "backed_off"
  | "variation_up"
  | "deload_week"
  | "no_data";

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
  message: string;
};

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

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
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
  };

  const working = sets.filter((s) => s.reps !== null && s.reps > 0);

  // A deload week is deliberately not a test of progress.
  if (isDeload) {
    return {
      ...base,
      outcome: "deload_week",
      message: "Deload week — weights held where they were.",
    };
  }

  if (working.length === 0) {
    return {
      ...base,
      outcome: "no_data",
      message: "No reps recorded, so nothing changed.",
    };
  }

  // Track bests regardless of whether the session counted as a success.
  const heaviest = Math.max(...working.map((s) => s.weightKg ?? 0));
  let bestWeightKg = state.bestWeightKg;
  let bestReps = state.bestReps;
  let bestE1rm = state.bestE1rm;

  for (const s of working) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (bestWeightKg === null || w > bestWeightKg) bestWeightKg = w;
    if (bestReps === null || r > bestReps) bestReps = r;
    if (w > 0) {
      const e1rm = estimateOneRepMax(w, r);
      if (bestE1rm === null || e1rm > bestE1rm) bestE1rm = e1rm;
    }
  }

  const carried = { ...base, bestWeightKg, bestReps, bestE1rm };

  // Success requires the full set count AND the top of the rep range on each.
  const completedAllSets = working.length >= plannedSets;
  const hitTopOfRange = working.every((s) => (s.reps ?? 0) >= repsMax);
  const succeeded = completedAllSets && hitTopOfRange;

  if (succeeded) {
    // Decide on what was ACTUALLY lifted, not on how the exercise is classified.
    // Keying off meta.isBodyweight meant a weighted sit-up or dip progressed
    // reps and never stored the load the user had used.
    if (heaviest === 0) {
      const canProgressVariation = meta.isBodyweight && meta.progressionChain !== null;
      const nextReps = (state.currentTargetReps ?? repsMax) + 2;

      if (canProgressVariation && nextReps > repsMax + 4) {
        return {
          ...carried,
          outcome: "variation_up",
          nextTargetReps: repsMax,
          consecutiveFailures: 0,
          wantsHarderVariation: true,
          message: "You have outgrown this variation — moving to a harder one.",
        };
      }
      return {
        ...carried,
        outcome: "progressed",
        nextTargetReps: nextReps,
        consecutiveFailures: 0,
        message: `Every set at the top of the range — target goes up to ${nextReps} reps.`,
      };
    }

    // "Easy" earns a double jump; anything else takes the standard one.
    const step = incrementFor(meta);
    const jump = feel === "easy" ? step * 2 : step;
    const from = state.currentWorkingWeightKg ?? heaviest;
    const next = roundTo(from + jump, step);

    return {
      ...carried,
      outcome: "progressed",
      nextWorkingWeightKg: next,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message:
        feel === "easy"
          ? `All sets at the top and it felt easy — up to ${next} kg.`
          : `All sets at the top of the range — up to ${next} kg.`,
    };
  }

  // Missed the target.
  const failures = state.consecutiveFailures + 1;
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);

  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {
    const step = incrementFor(meta);
    const reduced = Math.max(step, roundTo(currentWeight * 0.9, step));
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
    message: "Staying at this weight until every set reaches the top of the range.",
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
  const step = incrementFor(meta);
  return Math.max(step, roundTo(w * 0.7, step));
}
