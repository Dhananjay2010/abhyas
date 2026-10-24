import type { Database } from "@/lib/database.types";
import { KETTLEBELL_WEIGHTS_KG, KETTLEBELL_WEIGHTS_LB, LOADABLE_EQUIPMENT_IDS, gridStepFor as equipmentGridStep, type WeightUnit } from "@/lib/session/equipment-grid";

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
 * Round weight to equipment grid when equipment info is available.
 * Falls back to simple step rounding when equipment info is missing.
 * 
 * For progression: rounds UP to ensure at least one grid step increase.
 * For deload/back-off/failure: rounds DOWN for safety.
 */
function roundToGrid(
  value: number,
  equipmentIds: string[] | undefined,
  unit: WeightUnit | undefined,
  step: number,
  direction: 'up' | 'down',
): number {
  // No equipment info: use simple step rounding with minimum floor
  if (!equipmentIds || !unit) {
    const rounded = roundTo(value, step);
    return Math.max(step, rounded);
  }
  
  // Check if equipment is loadable; if not, fall back to 2.5 kg grid
  const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
  
  const effectiveEquipmentIds = hasLoadable ? equipmentIds : ['barbell']; // fallback to 2.5 kg grid
  
  // Kettlebell: always use kg bell list (state is stored in kg)
  if (effectiveEquipmentIds.includes('kettlebell')) {
    const bells = KETTLEBELL_WEIGHTS_KG;
    const minBell = bells[0];
    const maxBell = bells[bells.length - 1];
    
    // Bounds check: but allow progression from min bell when going up
    if (value <= minBell && direction === 'down') return minBell;
    if (value >= maxBell) return maxBell;
    
    // Find the nearest bell and check if we're already on it
    const epsilon = 0.01;
    let closestBell = minBell;
    let minDistance = Math.abs(value - minBell);
    
    for (const bell of bells) {
      const distance = Math.abs(value - bell);
      if (distance < minDistance) {
        minDistance = distance;
        closestBell = bell;
      }
    }
    
    // Check if we're already on a bell (within epsilon)
    const onBell = minDistance < epsilon;
    
    if (direction === 'up') {
      // If already on a bell, go to next bell; if between bells, go to next bell
      const currentIndex = bells.indexOf(closestBell);
      if (onBell && currentIndex < bells.length - 1) {
        return bells[currentIndex + 1];
      } else if (!onBell) {
        // Between bells: find the next higher bell
        for (const bell of bells) {
          if (bell > value) return bell;
        }
      }
      return closestBell;
    } else {
      // direction === 'down'
      // If already on a bell, stay there; if between bells, go to previous bell
      if (onBell) {
        return closestBell;
      } else {
        // Between bells: find the previous lower bell
        for (let i = bells.length - 1; i >= 0; i--) {
          if (bells[i] < value) return bells[i];
        }
      }
      return closestBell;
    }
  }
  
  // Standard equipment: always use kg grid (state is stored in kg)
  const gridStep = equipmentGridStep(effectiveEquipmentIds, 'kg');
  const minimum = effectiveEquipmentIds.includes('medicine_ball') ? 1 : gridStep;
  
  if (value < minimum) return minimum;
  
  const lowerMultiple = Math.floor(value / gridStep);
  const upperMultiple = Math.ceil(value / gridStep);
  
  if (direction === 'up') {
    // Round up to next grid point (or stay if already on grid)
    const result = upperMultiple * gridStep;
    return Math.max(minimum, result);
  } else {
    // Round down to previous grid point (or stay if already on grid)
    const result = lowerMultiple * gridStep;
    return Math.max(minimum, result);
  }
}


/** Epley. Only meaningful for a working set, so callers cap the rep count. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export type BestState = {
  bestWeightKg: number | null;
  bestReps: number | null;
  bestE1rm: number | null;
};

export type BestResult = {
  bestWeightKg: number | null;
  bestReps: number | null;
  bestE1rm: number | null;
  personalBest: PersonalBest | null;
};

/**
 * Update best tracking from a session's working sets.
 *
 * Pure: no I/O, exported for testing. Warm-up sets are
 * excluded by the caller. Bests are tracked regardless of deload or progression
 * outcome, per SPEC section 7 and Task M7.
 */
export function nextBest(
  sets: LoggedSet[],
  prior: BestState,
  meta: Pick<ExerciseMeta, "metric">,
): BestResult {
  const isTimed = meta.metric === "seconds";
  const valueOf = (set: LoggedSet) => (isTimed ? (set.durationSeconds ?? null) : set.reps);

  const working = sets.filter((set) => {
    const v = valueOf(set);
    return v !== null && v > 0;
  });

  if (working.length === 0) {
    return {
      bestWeightKg: prior.bestWeightKg,
      bestReps: prior.bestReps,
      bestE1rm: prior.bestE1rm,
      personalBest: null,
    };
  }

  const heaviest = Math.max(...working.map((s) => s.weightKg ?? 0));
  let bestWeightKg = prior.bestWeightKg;
  let bestReps = prior.bestReps;
  let bestE1rm = prior.bestE1rm;

  for (const set of working) {
    const w = set.weightKg ?? 0;
    const v = valueOf(set) ?? 0;
    if (bestWeightKg === null || w > bestWeightKg) bestWeightKg = w;
    // For a hold this is the longest hold, not a rep count. Same column, same
    // "best so far" meaning, read through `metric`.
    if (bestReps === null || v > bestReps) bestReps = v;
    // An estimated one-rep max from a hold length is nonsense -- Epley over
    // seconds would make a 60 s weighted plank look like a triple bodyweight
    // lift -- so timed work never contributes one. Bodyweight exercises (w=0)
    // also cannot produce an e1RM.
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
    if (beat(bestReps, prior.bestReps)) {
      personalBest = { kind: "hold", value: bestReps! };
    }
  } else if (heaviest === 0) {
    if (beat(bestReps, prior.bestReps)) {
      personalBest = { kind: "reps", value: bestReps! };
    }
  } else if (beat(bestWeightKg, prior.bestWeightKg)) {
    personalBest = { kind: "weight", value: bestWeightKg! };
  } else if (beat(bestE1rm, prior.bestE1rm)) {
    personalBest = { kind: "e1rm", value: bestE1rm! };
  }

  return { bestWeightKg, bestReps, bestE1rm, personalBest };
}

/**
 * Double progression.
 *
 * Stay at a weight until every set reaches the TOP of the rep range, then add
 * the smallest sensible increment. Miss the target twice in a row and the
 * weight comes down about 10% to build back.
 *
 * Pure: no I/O, so it can be exercised directly against real scenarios.
 * 
 * When equipmentIds and unit are provided, weights snap to the equipment's loadable grid:
 * success rounds up, deload/back-off/miss round down. Hard hold, first miss drops one grid step.
 * 
 * When omitted, uses simple rounding: success/deload/back-off round to the increment step,
 * first miss holds, no negatives/zeros.
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
  equipmentIds?: string[];
  unit?: WeightUnit;
}): Decision {
  const { sets, plannedSets, repsMax, feel, meta, state, isDeload, equipmentIds, unit } = input;

  const isTimed = meta.metric === "seconds";
  /** What this set is measured in: seconds held for a hold, reps otherwise. */
  const valueOf = (set: LoggedSet) => (isTimed ? (set.durationSeconds ?? null) : set.reps);
  const working = sets.filter((set) => {
    const v = valueOf(set);
    return v !== null && v > 0;
  });

  const bests = nextBest(sets, state, meta);

  const base = {
    nextWorkingWeightKg: state.currentWorkingWeightKg,
    nextTargetReps: state.currentTargetReps ?? repsMax,
    consecutiveFailures: state.consecutiveFailures,
    wantsHarderVariation: false,
    bestWeightKg: bests.bestWeightKg,
    bestReps: bests.bestReps,
    bestE1rm: bests.bestE1rm,
    personalBest: bests.personalBest,
  };

  // A deload week is deliberately not a test of progress.
  if (isDeload) {
    // Snap deload week weight to grid, but don't raise below-minimum weights
    let deloadWeight = state.currentWorkingWeightKg;
    if (deloadWeight !== null && deloadWeight > 0 && equipmentIds && unit) {
      const step = meta.isBodyweight && deloadWeight > 0 ? addedWeightStep(meta) : incrementFor(meta);
      const snapped = roundToGrid(deloadWeight, equipmentIds, unit, step, 'down');
      // Don't raise weight if it's already below minimum
      deloadWeight = snapped > deloadWeight ? deloadWeight : snapped;
    }
    return {
      ...base,
      nextWorkingWeightKg: deloadWeight,
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
    // Snap no-data weight to grid, but don't raise below-minimum weights
    let noDataWeight = state.currentWorkingWeightKg;
    if (noDataWeight !== null && noDataWeight > 0 && equipmentIds && unit) {
      const step = meta.isBodyweight && noDataWeight > 0 ? addedWeightStep(meta) : incrementFor(meta);
      const snapped = roundToGrid(noDataWeight, equipmentIds, unit, step, 'down');
      // Don't raise weight if it's already below minimum
      noDataWeight = snapped > noDataWeight ? noDataWeight : snapped;
    }
    return {
      ...base,
      nextWorkingWeightKg: noDataWeight,
      outcome: "no_data",
      message: isTimed
        ? "No hold recorded, so nothing changed."
        : "No reps recorded, so nothing changed.",
    };
  }

  const heaviest = Math.max(...working.map((s) => s.weightKg ?? 0));
  const carried = { ...base };

  // Success requires the full set count AND the top of the rep range on each.
  const completedAllSets = working.length >= plannedSets;
  const hitTopOfRange = working.every((set) => (valueOf(set) ?? 0) >= repsMax);
  const succeeded = completedAllSets && hitTopOfRange;

  if (succeeded) {
    // Hard feel: with equipment, hold at current weight; without equipment, progress normally
    const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);
    if (feel === "hard" && currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {
      // Snap held weight to grid
      const held = roundToGrid(currentWeight, equipmentIds, unit, incrementFor(meta), 'down');
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: held,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message: isTimed
          ? "Held to the top but it felt hard — holding at this length."
          : "All sets at the top but it felt hard — holding at this weight.",
      };
    }

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
    const from = state.currentWorkingWeightKg ?? heaviest;
    
    // For kettlebells, we let roundToGrid handle moving to the next bell
    // For other equipment, we add the increment then round to grid
    const isKettlebell = equipmentIds?.includes('kettlebell');
    
    let next: number;
    if (isKettlebell && equipmentIds && unit) {
      // Kettlebell: always move to next bell
      // Bell spacing is already optimized for progression, so Easy = Right (one bell)
      next = roundToGrid(from, equipmentIds, unit, incrementFor(meta), 'up');
    } else {
      // Standard equipment: add increment then round to grid
      const step = isBodyweightWithAddedWeight ? addedWeightStep(meta) : incrementFor(meta);
      const jump = isBodyweightWithAddedWeight || feel !== "easy" ? step : step * 2;
      const rawNext = from + jump;
      next = roundToGrid(rawNext, equipmentIds, unit, step, 'up');
    }

    return {
      ...carried,
      outcome: "progressed",
      nextWorkingWeightKg: next,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message:
        feel === "easy" && !isBodyweightWithAddedWeight
          ? `All sets at the top and it felt easy — up to ${next} ${unit || 'kg'}.`
          : `All sets at the top of the range — up to ${next} ${unit || 'kg'}.`,
    };
  }

  // Missed the target.
  const failures = state.consecutiveFailures + 1;
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);

  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {
    // Bodyweight with any stored or used added weight: drop to bodyweight entirely.
    // Loaded exercises: reduce by ~10%.
    if (meta.isBodyweight) {
      return {
        ...carried,
        outcome: "backed_off",
        nextWorkingWeightKg: 0,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message: "Missed twice in a row — back to bodyweight to build up again.",
      };
    }
    const step = incrementFor(meta);
    // Back-off: floor to avoid raising off-grid weights (e.g. 9.75 -> 10)
    const rawReduced = Math.floor((currentWeight * 0.9) / step) * step;
    // Apply grid rounding DOWN to the reduced weight, floored at minimum
    const reduced = roundToGrid(rawReduced, equipmentIds, unit, step, 'down');
    return {
      ...carried,
      outcome: "backed_off",
      nextWorkingWeightKg: reduced,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message: `Missed twice in a row — dropping to ${reduced} ${unit || 'kg'} to build back.`,
    };
  }

  // First miss: drop one equipment grid step with equipment, hold without
  let nextWeight = currentWeight;
  if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {
    const isKettlebell = equipmentIds.includes('kettlebell');
    if (isKettlebell) {
      // Kettlebell: drop exactly one bell
      const bells = unit === 'kg' ? KETTLEBELL_WEIGHTS_KG : KETTLEBELL_WEIGHTS_LB;
      const currentIndex = bells.indexOf(currentWeight);
      if (currentIndex > 0) {
        nextWeight = bells[currentIndex - 1];
      } else {
        // Not exactly on a bell, round down to previous bell
        nextWeight = roundToGrid(currentWeight - 0.1, equipmentIds, unit, incrementFor(meta), 'down');
      }
    } else {
      // Standard equipment: drop by one grid step
      const gridStep = equipmentGridStep(equipmentIds, unit);
      const rawDrop = currentWeight - gridStep;
      nextWeight = roundToGrid(rawDrop, equipmentIds, unit, gridStep, 'down');
    }
  }

  return {
    ...carried,
    outcome: "hold",
    nextWorkingWeightKg: nextWeight,
    nextTargetReps: state.currentTargetReps ?? repsMax,
    consecutiveFailures: failures,
    // "this weight" is meaningless for a hold, and for any unloaded bodyweight
    // movement -- both were being told to stay at a weight they never had.
    message: isTimed
      ? "Staying at this hold length until every set reaches the top of the range."
      : currentWeight === null
        ? "Staying here until every set reaches the top of the range."
        : nextWeight !== currentWeight
          ? `Missed the target — dropping to ${nextWeight} ${unit || 'kg'}.`
          : "Staying at this weight until every set reaches the top of the range.",
  };
}

/** 
 * What to put in the weight field when the exercise comes round again.
 * When equipmentIds and unit are provided, snaps to the equipment grid.
 * When omitted, uses simple step rounding (pre-grid behavior).
 */
export function suggestedWeight(
  state: Pick<ProgressState, "currentWorkingWeightKg">,
  isDeload: boolean,
  meta: ExerciseMeta,
  equipmentIds?: string[],
  unit?: WeightUnit,
): number | null {
  const w = state.currentWorkingWeightKg;
  if (w === null || w <= 0) return null;
  
  // Non-deload: snap current weight to grid if equipment info available
  if (!isDeload) {
    if (equipmentIds && unit) {
      const step = meta.isBodyweight && w > 0 ? addedWeightStep(meta) : incrementFor(meta);
      return roundToGrid(w, equipmentIds, unit, step, 'down');
    }
    return w;
  }
  
  // Deload: about 70% of working weight, on a loadable increment.
  // Bodyweight exercises with added weight use their own smaller steps.
  const step = meta.isBodyweight && w > 0 ? addedWeightStep(meta) : incrementFor(meta);
  
  // For kettlebells, skip rounding to step and go directly to bell grid
  const isKettlebell = equipmentIds?.includes('kettlebell');
  const rawDeload = isKettlebell ? w * 0.7 : roundTo(w * 0.7, step);
  
  // Apply grid rounding DOWN, floored at minimum
  return roundToGrid(rawDeload, equipmentIds, unit, step, 'down');
}
