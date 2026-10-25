import type { Database } from "@/lib/database.types";
import { KETTLEBELL_WEIGHTS_KG, LOADABLE_EQUIPMENT_IDS, gridStepFor as equipmentGridStep, type WeightUnit } from "@/lib/session/equipment-grid";
import { formatWeight } from "@/lib/units";

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

/**
 * First-miss hold threshold: when a single equipment grid step would cut more
 * than this fraction of the current load, hold at the current weight instead.
 */
export const FIRST_MISS_HOLD_THRESHOLD = 0.20;

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

/**
 * Format weight for display in progression messages.
 * For lb: uses app's formatWeight (kgToLb -> roundLbToHalf -> format, no .0 for whole numbers).
 * For kg: returns plain kg value (matches main's exact kg wording, no rounding).
 */
function displayWeight(kgValue: number, unit: WeightUnit | undefined): string {
  if (unit === 'lb') {
    // Use app's actual UI formatter for lb
    return formatWeight(kgValue, 'imperial', true);
  }
  // For kg: plain value (no formatWeight rounding)
  return `${kgValue} kg`;
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
    // Deload week: keep current weight (hold, don't lower)
    return {
      ...base,
      nextWorkingWeightKg: state.currentWorkingWeightKg,
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
    // No data: keep current weight (hold, don't lower)
    return {
      ...base,
      nextWorkingWeightKg: state.currentWorkingWeightKg,
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
      // Hold at current weight (don't snap down)
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
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

    // Never decrease weight on success (can happen at max bell or with off-grid stored weights)
    if (next <= from) {
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: from,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message: isTimed
          ? "Held to the top of the range — no heavier load available."
          : "All sets at the top of the range — no heavier load available.",
      };
    }

    const displayNext = displayWeight(next, unit);
    return {
      ...carried,
      outcome: "progressed",
      nextWorkingWeightKg: next,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message:
        feel === "easy" && !isBodyweightWithAddedWeight
          ? `All sets at the top and it felt easy — up to ${displayNext}.`
          : `All sets at the top of the range — up to ${displayNext}.`,
    };
  }

  // Missed the target.
  const failures = state.consecutiveFailures + 1;
  const currentWeight = state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null);

  /**
   * Shared helper: compute what the two-miss back-off would return.
   * Used by both the actual two-miss path and the first-miss invariant clamp.
   * 
   * Returns the SMALLEST loadable value >= 90% (rounded to grid, at most one increment below) and < current.
   * If no such value exists, returns current (hold).
   */
  function computeTwoMissResult(weight: number): number {
    const liftIncrement = incrementFor(meta);
    
    // Hold at light weight
    if (weight <= liftIncrement) {
      return weight;
    }
    
    const rawReduced = weight * 0.9;
    const roundingGrid = meta.mechanic === "isolation" ? 1.25 : 2.5;
    
    // Snap to 2.5 or 1.25 grid, at most one increment below 90%
    const snapped = Math.floor(rawReduced / roundingGrid) * roundingGrid;
    const cap = rawReduced - liftIncrement;
    const target = Math.max(snapped, cap);
    
    // Hold at light weight after reduction
    if (target <= liftIncrement) {
      return weight;
    }
    
    // With equipment: find SMALLEST loadable value >= target and < current
    if (equipmentIds && unit) {
      let candidate: number | null = null;
      
      if (equipmentIds.includes('kettlebell')) {
        // Kettlebell: find smallest bell >= target and < current
        const bells = KETTLEBELL_WEIGHTS_KG;
        for (const bell of bells) {
          if (bell >= target - 0.001 && bell < weight - 0.001) {
            candidate = bell;
            break;
          }
        }
      } else {
        // Standard equipment: snap up to loadable grid
        const gridStep = equipmentGridStep(equipmentIds, 'kg');
        const snappedUp = Math.ceil(target / gridStep) * gridStep;
        if (snappedUp < weight - 0.001) {
          candidate = snappedUp;
        }
      }
      
      // If no loadable value found < current, hold
      if (candidate === null) {
        return weight;
      }
      
      return candidate;
    }
    
    // No equipment: return target (already capped and snapped)
    // Never-raise check
    if (target > weight) {
      return weight;
    }
    
    return target;
  }

  if (failures >= 2 && currentWeight !== null && currentWeight > 0) {
    // Bodyweight with any stored or used added weight: drop to bodyweight entirely.
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
    
    // Two-miss back-off: RAW 90% cap with equipment, rounded with no equipment
    const liftIncrement = incrementFor(meta);
    
    if (currentWeight <= liftIncrement) {
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message: "Missed twice in a row but already at light weight — holding to build back up.",
      };
    }
    
    const rawReduced = currentWeight * 0.9;
    let target: number;
    
    if (equipmentIds && unit) {
      // RAW 90% cap with equipment
      target = rawReduced;
    } else {
      // No equipment: snap to grid, at most one increment below 90%
      const roundingGrid = meta.mechanic === "isolation" ? 1.25 : 2.5;
      const snapped = Math.floor(rawReduced / roundingGrid) * roundingGrid;
      const cap = rawReduced - liftIncrement;
      target = Math.max(snapped, cap);
    }
    
    if (target <= liftIncrement) {
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        message: "Missed twice in a row but already at light weight — holding to build back up.",
      };
    }
    
    // Find smallest loadable value >= target and < current
    let reduced = target;
    if (equipmentIds && unit) {
      let candidate: number | null = null;
      
      if (equipmentIds.includes('kettlebell')) {
        const bells = KETTLEBELL_WEIGHTS_KG;
        for (const bell of bells) {
          if (bell >= target - 0.001 && bell < currentWeight - 0.001) {
            candidate = bell;
            break;
          }
        }
      } else {
        const gridStep = equipmentGridStep(equipmentIds, 'kg');
        const snappedUp = Math.ceil(target / gridStep) * gridStep;
        if (snappedUp < currentWeight - 0.001) {
          candidate = snappedUp;
        }
      }
      
      if (candidate === null) {
        return {
          ...carried,
          outcome: "hold",
          nextWorkingWeightKg: currentWeight,
          nextTargetReps: repsMax,
          consecutiveFailures: 0,
          message: "Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up.",
        };
      }
      
      reduced = candidate;
    } else {
      // No equipment: never raise
      if (target > currentWeight) {
        reduced = currentWeight;
      }
    }
    
    return {
      ...carried,
      outcome: "backed_off",
      nextWorkingWeightKg: reduced,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      message: `Missed twice in a row — dropping to ${displayWeight(reduced, unit)} to build back.`,
    };
  }

  // First miss: drop one equipment grid step with equipment, hold without
  let nextWeight = currentWeight;
  let holdReason: 'smallest' | 'cut20' | 'twomiss' | null = null;
  
  if (currentWeight !== null && currentWeight > 0 && equipmentIds && unit) {
    const isKettlebell = equipmentIds.includes('kettlebell');
    let candidateWeight: number;
    
    if (isKettlebell) {
      // Kettlebell: find the largest bell STRICTLY below current
      const bells = KETTLEBELL_WEIGHTS_KG;
      const epsilon = 0.001;
      let found = currentWeight;  // Default to hold
      for (let i = bells.length - 1; i >= 0; i--) {
        if (bells[i] < currentWeight - epsilon) {
          found = bells[i];
          break;
        }
      }
      candidateWeight = found;
      if (candidateWeight === currentWeight) {
        holdReason = 'smallest';
      }
    } else {
      // Standard equipment: find the largest grid point STRICTLY below current
      const gridStep = equipmentGridStep(equipmentIds, 'kg');
      const epsilon = 0.001;
      const stepsBelow = Math.floor((currentWeight - epsilon) / gridStep);
      candidateWeight = stepsBelow * gridStep;
      if (candidateWeight === 0) {
        holdReason = 'smallest';
      }
    }
    
    // Rule 1: if cut > 20%, hold instead
    if (candidateWeight !== currentWeight) {
      const cutFraction = (currentWeight - candidateWeight) / currentWeight;
      if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {
        candidateWeight = currentWeight;
        holdReason = 'cut20';
      }
    }
    
    // Rule 2: if candidate < two-miss result, hold instead
    if (candidateWeight !== currentWeight) {
      const twoMissFloor = computeTwoMissResult(currentWeight);
      if (candidateWeight < twoMissFloor) {
        candidateWeight = currentWeight;
        holdReason = 'twomiss';
      }
    }
    
    nextWeight = candidateWeight;
  }

  const message = isTimed
    ? "Staying at this hold length until every set reaches the top of the range."
    : currentWeight === null
      ? "Staying here until every set reaches the top of the range."
      : nextWeight !== null && nextWeight !== currentWeight
        ? `Missed the target — dropping to ${displayWeight(nextWeight, unit)}.`
        : holdReason === 'smallest'
          ? "Missed the target but holding at this weight — it is the smallest available step."
          : holdReason === 'cut20'
            ? "Missed the target but holding at this weight — one step down would cut more than 20%."
            : holdReason === 'twomiss'
              ? "Missed the target but holding at this weight — one step down would exceed the two-miss limit."
              : "Staying at this weight until every set reaches the top of the range.";
  
  return {
    ...carried,
    outcome: "hold",
    nextWorkingWeightKg: nextWeight,
    nextTargetReps: state.currentTargetReps ?? repsMax,
    consecutiveFailures: failures,
    message,
  };
}

/** 
 * What to put in the weight field when the exercise comes round again.
 * When equipmentIds and unit are provided, snaps to the equipment grid.
 * When omitted, uses simple step rounding.
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
  
  // Non-deload: return current weight as-is
  // Progression logic already ensures loadable values for increases
  // Decreases may be off-grid due to rounding, but that's acceptable
  // Holds keep exact weight
  if (!isDeload) {
    return w;
  }
  
  // Deload: about 70% of working weight, on a loadable increment.
  // Bodyweight exercises with added weight use their own smaller steps.
  const step = meta.isBodyweight && w > 0 ? addedWeightStep(meta) : incrementFor(meta);
  
  // For kettlebells, skip rounding to step and go directly to bell grid
  const isKettlebell = equipmentIds?.includes('kettlebell');
  const rawDeload = isKettlebell ? w * 0.7 : roundTo(w * 0.7, step);
  
  // Apply grid rounding DOWN, but never raise above current weight
  const snapped = roundToGrid(rawDeload, equipmentIds, unit, step, 'down');
  return Math.min(w, snapped);
}
