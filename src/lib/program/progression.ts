import type { Database } from "@/lib/database.types";
import { KETTLEBELL_WEIGHTS_KG, LOADABLE_EQUIPMENT_IDS, gridStepFor as equipmentGridStep, MEDICINE_BALL_MIN_KG, type WeightUnit } from "@/lib/session/equipment-grid";
import { formatWeight, type UnitsPreference } from "@/lib/units";
import { resolveTarget } from "../session/display-target";

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
  weightAtFailureStartKg: number | null;
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
export function describePersonalBest(pb: PersonalBest, units: UnitsPreference = "metric"): string {
  switch (pb.kind) {
    case "weight":
      return `Heaviest set yet — ${formatWeight(pb.value, units)}`;
    case "hold":
      return `Longest hold yet — ${pb.value}s`;
    case "reps":
      return `Most reps yet — ${pb.value}`;
    case "e1rm":
      return `Best estimated one-rep max yet — ${formatWeight(pb.value, units)}`;
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
  weightAtFailureStartKg: number | null;
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
 * 
 * When equipmentIds is provided AND contains loadable equipment, returns the larger 
 * of the mechanic-based increment and the equipment grid step to ensure barbell 
 * exercises never use sub-2.5 kg increments.
 */
export function incrementFor(meta: ExerciseMeta, equipmentIds?: string[]): number {
  const mechanicIncrement = meta.mechanic === "isolation" ? 1.25 : 
    LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;
  
  // If equipment is specified and contains loadable equipment, 
  // ensure we never go below the equipment grid
  if (equipmentIds && equipmentIds.length > 0) {
    // Medicine ball: always use the 1 kg grid step, not the mechanic increment
    if (equipmentIds.includes('medicine_ball')) {
      return equipmentGridStep(equipmentIds, 'kg');
    }
    
    const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
    if (hasLoadable) {
      const equipGrid = equipmentGridStep(equipmentIds, 'kg');
      return Math.max(mechanicIncrement, equipGrid);
    }
  }
  
  return mechanicIncrement;
}

/**
 * Step size for added weight on bodyweight exercises.
 * Upper-body and isolation: 1.25 kg. Lower-body: 2.5 kg.
 * Never 5 kg, and never doubled for 'easy' feel.
 * 
 * When equipmentIds is provided AND contains loadable equipment, returns the larger 
 * of the pattern-based step and the equipment grid to ensure proper snapping.
 */
export function addedWeightStep(meta: ExerciseMeta, equipmentIds?: string[]): number {
  const patternStep = meta.mechanic === "isolation" ? 1.25 :
    LOWER_BODY.has(meta.movementPattern) ? 2.5 : 1.25;
  
  // If equipment is specified and contains loadable equipment, 
  // ensure we never go below the equipment grid
  if (equipmentIds && equipmentIds.length > 0) {
    const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
    if (hasLoadable) {
      const equipGrid = equipmentGridStep(equipmentIds, 'kg');
      return Math.max(patternStep, equipGrid);
    }
  }
  
  return patternStep;
}

/**
 * Format weight for display in progression messages.
 * For lb: uses app's formatWeight (kgToLb -> roundLbToHalf -> format, no .0 for whole numbers).
 * For kg: returns plain kg value (matches main's exact kg wording, no rounding).
 */
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
  const minimum = effectiveEquipmentIds.includes('medicine_ball') ? MEDICINE_BALL_MIN_KG : gridStep;
  
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

/**
 * Estimated one-rep max (Epley formula, capped at 12 reps).
 * 
 * Returns: w if reps = 1, else w × (30 + min(reps, 12)) / 30, clamped to 9999.99
 * 
 * The 12-rep cap ensures reliability: high-rep sets (15+) are endurance work
 * and produce inflated strength estimates. The clamp prevents overflow of
 * numeric(6,2) storage (max 9999.99).
 * 
 * This is the single source of truth for e1RM across:
 * - Session PB tracking (nextBest)
 * - History (detectPersonalRecords, getExerciseHistory)
 * - Progress aggregates (SQL view exercise_strength_history)
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return Math.min(weightKg, 9999.99);
  const capped = Math.min(reps, 12);
  // Exact rational arithmetic using integer hundredths to match SQL ROUND(x,2)
  // Equivalent to SQL: ROUND(weight_kg * (30 + least(reps,12)) / 30, 2)
  const raw = Math.round(Math.round(weightKg * 100) * (30 + capped) / 30) / 100;
  return Math.min(raw, 9999.99);
}

/**
 * Round a best-tracking value to storage precision.
 * 
 * Storage uses numeric(6,2) for best_e1rm and best_weight_kg, so we round to
 * 2 decimal places. This helper must be used for both the write AND the
 * comparison, so a live 53.333 rounds to 53.33 and correctly equals the stored
 * 53.33 rather than incorrectly beating it.
 */
export function roundToStoragePrecision(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute e1RM with storage precision.
 * 
 * Combines estimateOneRepMax (capped, clamped formula) with roundToStoragePrecision.
 * Returns null for bodyweight (weight ≤ 0) or invalid inputs.
 * 
 * Use this whenever you need to compute an e1RM that will be compared to or stored
 * in the database (exercise_progress.best_e1rm, History PR detection, etc.).
 */
export function computeE1rm(weightKg: number | null, reps: number | null): number | null {
  if (reps === null || reps < 1) return null;
  if (weightKg === null || weightKg <= 0) return null;
  return roundToStoragePrecision(estimateOneRepMax(weightKg, reps));
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
    const roundedWeight = w > 0 ? roundToStoragePrecision(w) : w;
    if (bestWeightKg === null || roundedWeight > bestWeightKg) bestWeightKg = roundedWeight;
    // For a hold this is the longest hold, not a rep count. Same column, same
    // "best so far" meaning, read through `metric`.
    if (bestReps === null || v > bestReps) bestReps = v;
    // An estimated one-rep max from a hold length is nonsense -- Epley over
    // seconds would make a 60 s weighted plank look like a triple bodyweight
    // lift -- so timed work never contributes one. Bodyweight exercises (w=0)
    // also cannot produce an e1RM.
    if (w > 0 && !isTimed) {
      // Compute e1RM from the ROUNDED weight so both use the same weight
      const e1rm = roundToStoragePrecision(estimateOneRepMax(roundedWeight, v));
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
 * When equipmentIds is provided, weights snap to the equipment's loadable grid:
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
  const { sets, plannedSets, repsMin, repsMax, feel, meta, state, isDeload, equipmentIds, unit } = input;

  const isTimed = meta.metric === "seconds";
  /** What this set is measured in: seconds held for a hold, reps otherwise. */
  const valueOf = (set: LoggedSet) => (isTimed ? (set.durationSeconds ?? null) : set.reps);
  const working = sets.filter((set) => {
    const v = valueOf(set);
    return v !== null && v > 0;
  });

  const bests = nextBest(sets, state, meta);

  /**
   * Format weight for display in progression messages.
   * Uses the user's unit preference (metric or imperial).
   */
  const displayWeight = (kg: number, fallbackUnit: WeightUnit = "kg") => (unit ?? fallbackUnit) === "lb" 
    ? formatWeight(kg, "imperial", true, "0 lb")
    : `${kg} kg`;

  // Get resolved target (what the display shows) for write-back
  const resolvedTargetForBase = resolveTarget({
    metric: isTimed ? "seconds" : "reps",
    plannedMin: repsMin,
    plannedMax: repsMax,
    currentTargetReps: state.currentTargetReps,
    equipmentIds: equipmentIds ?? [],
    currentWorkingWeightKg: state.currentWorkingWeightKg,
  }).max;

  const base = {
    nextWorkingWeightKg: state.currentWorkingWeightKg,
    nextTargetReps: resolvedTargetForBase,
    consecutiveFailures: state.consecutiveFailures,
    wantsHarderVariation: false,
    bestWeightKg: bests.bestWeightKg,
    bestReps: bests.bestReps,
    bestE1rm: bests.bestE1rm,
    personalBest: bests.personalBest,
    weightAtFailureStartKg: state.weightAtFailureStartKg,
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
  
  /**
   * Find the most common working-set weight (mode).
   * Ties go to the lower weight.
   * Returns 0 if no weights logged.
   */
  function mostCommonWorkingWeight(sets: LoggedSet[]): number {
    const weights = sets.map(s => s.weightKg ?? 0).filter(w => w > 0);
    if (weights.length === 0) return 0;
    
    const counts = new Map<number, number>();
    for (const w of weights) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    
    let maxCount = 0;
    let modeWeight = weights[0];
    for (const [w, count] of counts) {
      if (count > maxCount || (count === maxCount && w < modeWeight)) {
        maxCount = count;
        modeWeight = w;
      }
    }
    return modeWeight;
  }
  
  // Calculate mode once for use in all paths (success, in-range, miss)
  const mode = mostCommonWorkingWeight(working);
  
  const carried = { ...base };

  // Success requires the full set count AND the top of the rep range on each.
  const completedAllSets = working.length >= plannedSets;
  
  // Use resolveTarget helper for success check (same target the display shows)
  // Pass stored working weight to match display's loaded/unloaded rule
  const successTarget = resolveTarget({
    metric: isTimed ? "seconds" : "reps",
    plannedMin: repsMin,
    plannedMax: repsMax,
    currentTargetReps: state.currentTargetReps,
    equipmentIds: equipmentIds ?? [],
    currentWorkingWeightKg: state.currentWorkingWeightKg,
  }).max;
  
  const hitTopOfRange = working.every((set) => (valueOf(set) ?? 0) >= successTarget);
  const hitMinOfRange = working.every((set) => (valueOf(set) ?? 0) >= repsMin);
  const succeeded = completedAllSets && hitTopOfRange;
  const inRange = completedAllSets && hitMinOfRange && !hitTopOfRange;

  if (succeeded) {
    // Hard feel: with equipment, hold at current weight; without equipment, progress normally
    // Use mode (most common working-set weight) when available; otherwise fall back to stored or heaviest
    const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));
    if (feel === "hard" && currentWeight !== null && currentWeight > 0 && equipmentIds) {
      // Hold at current weight (don't snap down)
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        weightAtFailureStartKg: null, // M1: clear on success
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
      
      // Get resolved target (what the display showed) for write-back
      const resolvedTarget = resolveTarget({
        metric: isTimed ? "seconds" : "reps",
        plannedMin: repsMin,
        plannedMax: repsMax,
        currentTargetReps: state.currentTargetReps,
        equipmentIds: equipmentIds ?? [],
        currentWorkingWeightKg: state.currentWorkingWeightKg,
      }).max;
      
      const nextTarget = resolvedTarget + step;
      
      // Reps run out of usefulness relative to the range they started in; a
      // hold runs out at an absolute length, whatever it was prescribed at.
      // Variation trigger: repsMax+4 (main's threshold)
      // Reps cap for non-variation exercises: 2×repsMax
      const variationCeiling = isTimed ? HOLD_CEILING_SECONDS : repsMax + 4;
      const repsCap = isTimed ? HOLD_CEILING_SECONDS : 2 * repsMax;

      if (canProgressVariation && nextTarget > variationCeiling) {
        return {
          ...carried,
          outcome: "variation_up",
          nextTargetReps: repsMax,
          consecutiveFailures: 0,
          weightAtFailureStartKg: null, // M1: clear on success
          wantsHarderVariation: true,
          message: "You have outgrown this variation — moving to a harder one.",
        };
      }

      // A hold with nowhere harder to go stops growing rather than marching on
      // to five-minute planks. Loading it is the honest next step.
      if (isTimed && nextTarget > HOLD_CEILING_SECONDS) {
        return {
          ...carried,
          outcome: "hold",
          nextTargetReps: HOLD_CEILING_SECONDS,
          consecutiveFailures: 0,
          weightAtFailureStartKg: null, // M1: clear on success
          message: `Holding at ${HOLD_CEILING_SECONDS}s — longer stops adding much, so add weight instead.`,
        };
      }

      // Reps ceiling: cap at 2×repsMax
      const cappedTarget = nextTarget > repsCap ? repsCap : nextTarget;
      const targetMoved = cappedTarget !== resolvedTarget;

      return {
        ...carried,
        outcome: "progressed",
        nextTargetReps: cappedTarget,
        consecutiveFailures: 0,
        weightAtFailureStartKg: null, // M1: clear on success
        message: isTimed
          ? targetMoved
            ? `Every set held to the top of the range — target goes up to ${cappedTarget}s.`
            : `Every set held to the top of the range — staying at ${cappedTarget}s.`
          : targetMoved
            ? `Every set at the top of the range — target goes up to ${cappedTarget} reps.`
            : `Every set at the top of the range — staying at ${cappedTarget} reps.`,
      };
    }

    // Bodyweight with added weight: smaller steps, never doubled.
    // Loaded exercises: with equipment, ONE grid step only (never doubled); without equipment, standard increment (doubled on easy).
    const isBodyweightWithAddedWeight = meta.isBodyweight && heaviest > 0;
    const from = mode > 0 ? mode : (state.currentWorkingWeightKg ?? heaviest);
    
    let next: number;
    if (equipmentIds && equipmentIds.length > 0) {
      const isKettlebell = equipmentIds.includes('kettlebell');
      
      if (isKettlebell) {
        // Kettlebell: move up by bell count (1 bell for 'right', 2 bells for 'easy')
        // Never skip bells or invent weights above the top bell
        const bells = KETTLEBELL_WEIGHTS_KG;
        const isCompound = meta.mechanic === "compound";
        const bellsToMove = feel === "easy" && isCompound && !isBodyweightWithAddedWeight ? 2 : 1;
        
        // Find current position in bell list
        const epsilon = 0.001;
        let currentIndex = -1;
        for (let i = 0; i < bells.length; i++) {
          if (Math.abs(bells[i] - from) < epsilon) {
            currentIndex = i;
            break;
          }
          if (bells[i] > from) {
            // Between bells, start from the one just below
            currentIndex = i - 1;
            break;
          }
        }
        
        // If at or past the end, we're at max bell
        if (currentIndex < 0) currentIndex = 0;
        if (currentIndex >= bells.length - 1) {
          // At or above max bell: hold
          next = from;
        } else {
          const targetIndex = Math.min(currentIndex + bellsToMove, bells.length - 1);
          next = bells[targetIndex];
        }
      } else {
        // Standard equipment: add increment then round to grid if equipment is loadable
        const step = isBodyweightWithAddedWeight ? addedWeightStep(meta, equipmentIds) : incrementFor(meta, equipmentIds);
        const isCompound = meta.mechanic === "compound";
        
        // #120 APP decision: easy doubles the BASE increment, then the doubled value is capped at grid
        // For pin-stack (5 kg grid): base 2.5 kg * 2 = 5 kg, max(5, 5) = 5 kg (not 5 * 2 = 10)
        let jump: number;
        if (feel === "easy" && isCompound && !isBodyweightWithAddedWeight) {
          const baseMechanicIncrement = meta.mechanic === "isolation" ? 1.25 : 
            LOWER_BODY.has(meta.movementPattern) ? 5 : 2.5;
          const doubled = baseMechanicIncrement * 2;
          // Cap the doubled increment at the equipment grid
          if (equipmentIds && equipmentIds.length > 0) {
            const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
            if (hasLoadable) {
              const equipGrid = equipmentGridStep(equipmentIds, 'kg');
              jump = Math.max(doubled, equipGrid);
            } else {
              jump = doubled;
            }
          } else {
            jump = doubled;
          }
        } else {
          jump = step;
        }
        
        // Add jump to current weight
        const rawNext = from + jump;
        
        // Check if equipment is loadable - only round to grid for loadable equipment
        const hasLoadable = equipmentIds.some(id => LOADABLE_EQUIPMENT_IDS.has(id));
        
        if (hasLoadable) {
          // Loadable equipment: round to equipment grid, ensuring we never suggest below lifted weight
          const gridStep = equipmentGridStep(equipmentIds, 'kg');
          const ceilToGrid = Math.ceil(rawNext / gridStep) * gridStep;
          const floorToGrid = Math.floor(rawNext / gridStep) * gridStep;
          
          // Use ceil if it's at or above from, otherwise use floor but ensure >= from
          next = ceilToGrid >= from ? ceilToGrid : Math.max(floorToGrid, from);
        } else {
          // Non-loadable equipment (e.g., dip_bars): use raw calculated value, but ensure >= from
          next = Math.max(rawNext, from);
        }
      }
    } else {
      // No equipment info: use standard increment, doubled when easy (preserve old behavior)
      // Pass equipmentIds to incrementFor/addedWeightStep to respect equipment grid even in fallback
      const step = isBodyweightWithAddedWeight ? addedWeightStep(meta, equipmentIds) : incrementFor(meta, equipmentIds);
      const jump = isBodyweightWithAddedWeight || feel !== "easy" ? step : step * 2;
      const rawNext = from + jump;
      next = roundToGrid(rawNext, equipmentIds, undefined, step, 'up');
    }

    // Never decrease weight on success (can happen at max bell or with off-grid stored weights)
    if (next <= from) {
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: from,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        weightAtFailureStartKg: null, // M1: clear on success
        message: isTimed
          ? "Held to the top of the range — no heavier load available."
          : "All sets at the top of the range — no heavier load available.",
      };
    }

    // Bodyweight without stored working weight: no kg target in message
    // MSG2: Pin message for bodyweight with added weight progressing from 0 or null
    if (meta.isBodyweight && (state.currentWorkingWeightKg === null || state.currentWorkingWeightKg === 0)) {
      const message = next > 0
        ? `All sets at the top of the range — ready to add ${displayWeight(next)}.`
        : "All sets at the top of the range — ready for the next step.";
      
      return {
        ...carried,
        outcome: "progressed",
        nextWorkingWeightKg: next,
        nextTargetReps: repsMax,
        consecutiveFailures: 0,
        weightAtFailureStartKg: null,
        message,
      };
    }

    return {
      ...carried,
      outcome: "progressed",
      nextWorkingWeightKg: next,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      weightAtFailureStartKg: null, // M1: clear on success
      message:
        feel === "easy" && !isBodyweightWithAddedWeight
          ? `All sets at the top and it felt easy — up to ${displayWeight(next)}.`
          : `All sets at the top of the range — up to ${displayWeight(next)}.`,
    };
  }

  // In range (all sets >= repsMin) but not all at top: HOLD and reset failures.
  // SPEC §Progression: "Stay at a weight until you hit the top of the rep range on every set"
  // and "Stall rule: miss the target twice in a row → automatically drop ~10% and build back."
  // A 'miss' is read as below repsMin or incomplete sets. In-range (all sets >= repsMin but not
  // all at top) sessions hold the weight and reset consecutiveFailures to 0.
  // "Hard" feel never causes a deload or counts as a miss on its own (SPEC: '"hard" holds it').
  if (inRange) {
    // HOLD: Use most common working-set weight (mode); otherwise fall back to stored weight or heaviest.
    // For true bodyweight (no weights logged), keep null.
    const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));
    return {
      ...carried,
      outcome: "hold",
      nextWorkingWeightKg: currentWeight,
      nextTargetReps: state.currentTargetReps ?? repsMax,
      consecutiveFailures: 0,
      weightAtFailureStartKg: null, // M1: clear on in-range hold
      message: isTimed
        ? "Staying at this hold length until every set reaches the top of the range."
        : currentWeight === null
          ? "Staying here until every set reaches the top of the range."
          : `Staying at ${displayWeight(currentWeight)} until every set reaches the top of the range.`,
    };
  }

  // MISS: sets incomplete, or any set's reps below repsMin. Increment consecutiveFailures.
  // Cap at 3 to prevent infinite growth at minimum weights
  const failures = Math.min(state.consecutiveFailures + 1, 3);
  const currentWeight = mode > 0 ? mode : (state.currentWorkingWeightKg ?? (heaviest > 0 ? heaviest : null));

  /**
   * Shared helper: compute what the two-miss back-off would return.
   * Used by both the actual two-miss path and the first-miss invariant clamp (Rule 2).
   * 
   * 42314b8d behavior: finds SMALLEST loadable >= target and < current.
   * If no such value exists, returns current (hold).
   * 
   * @param weight - Weight to compute from
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
    
    // With equipment: find SMALLEST loadable >= target and < current (42314b8d behavior)
    if (equipmentIds && equipmentIds.length > 0) {
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
        // Standard equipment: snap UP to loadable grid (42314b8d behavior)
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
        weightAtFailureStartKg: null, // M1: clear on two-miss back-off
        message: failures >= 3
          ? "Missed the target again — back to bodyweight to build up again."
          : "Missed twice in a row — back to bodyweight to build up again.",
      };
    }
    
    // M1: Use pre-miss weight if available, otherwise fall back to current weight
    const weightToBackOffFrom = state.weightAtFailureStartKg ?? currentWeight;
    const reduced = computeTwoMissResult(weightToBackOffFrom);
    
    // MED-3: Third+ consecutive miss - if 0.9x back-off doesn't change weight, drop one grid step
    if (failures >= 3 && reduced === currentWeight && equipmentIds) {
      const isKettlebell = equipmentIds.includes('kettlebell');
      let stepped: number;
      
      if (isKettlebell) {
        // Kettlebell: go to next lower bell
        const bells = KETTLEBELL_WEIGHTS_KG;
        const epsilon = 0.001;
        let nextBell = currentWeight; // Default to hold if at minimum
        for (let i = bells.length - 1; i >= 0; i--) {
          if (bells[i] < currentWeight - epsilon) {
            nextBell = bells[i];
            break;
          }
        }
        stepped = nextBell;
      } else {
        // Standard equipment: drop one grid step
        const gridStep = equipmentGridStep(equipmentIds, 'kg');
        const oneStepDown = currentWeight - gridStep;
        
        // Floor logic by equipment type:
        // - Medicine ball: floor at lightest ball (3 kg), hold if already there
        // - Bar/band: floor at 0
        // - Other: floor at gridStep
        const isMedicineBall = equipmentIds.includes('medicine_ball');
        const isBodyweightEquipment = equipmentIds.some(id => 
          ['pull_up_bar', 'resistance_band'].includes(id)
        );
        
        if (isMedicineBall) {
          if (currentWeight <= MEDICINE_BALL_MIN_KG) {
            // Already at lightest ball: hold with "aim for clean reps" message
            return {
              ...carried,
              outcome: "hold",
              nextWorkingWeightKg: currentWeight,
              nextTargetReps: repsMax,
              consecutiveFailures: failures,
              weightAtFailureStartKg: state.weightAtFailureStartKg,
              message: `Staying at ${displayWeight(currentWeight)} — aim for clean reps.`,
            };
          }
          stepped = Math.max(MEDICINE_BALL_MIN_KG, oneStepDown);
        } else {
          const floor = isBodyweightEquipment ? 0 : gridStep;
          stepped = Math.max(floor, oneStepDown);
        }
      }
      
      if (stepped < currentWeight) {
        // Determine message based on equipment and target weight
        let message: string;
        if (stepped === 0) {
          if (equipmentIds.includes('resistance_band')) {
            message = failures >= 3
              ? "Missed three times in a row — dropping to no band to build up again."
              : "Missed twice in a row — dropping to no band to build up again.";
          } else {
            // Pull-up bar or other bodyweight equipment
            message = failures >= 3
              ? "Missed three times in a row — dropping to bodyweight to build up again."
              : "Missed twice in a row — dropping to bodyweight to build up again.";
          }
        } else {
          message = failures >= 3
            ? `Missed three times in a row — dropping one step to ${displayWeight(stepped)} to break through.`
            : `Missed twice in a row — dropping to ${displayWeight(stepped)} to build back.`;
        }
        
        return {
          ...carried,
          outcome: "backed_off",
          nextWorkingWeightKg: stepped,
          nextTargetReps: repsMax,
          consecutiveFailures: 0,
          weightAtFailureStartKg: null, // MED-3: clear on third-miss step-down
          message,
        };
      }
    }
    
    // If helper returned same weight as current (no actual change), it's a hold
    if (reduced === currentWeight) {
      const holdMessage = failures >= 3
        ? equipmentIds
          ? "Missed the target again but no lighter loadable weight fits within 10% — holding to build back up."
          : "Missed the target again but already at light weight — holding to build back up."
        : equipmentIds
          ? "Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up."
          : "Missed twice in a row but already at light weight — holding to build back up.";
      
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: failures, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss
        message: holdMessage,
      };
    }
    
    // Never raise: if back-off would increase weight, hold instead
    if (reduced > currentWeight) {
      return {
        ...carried,
        outcome: "hold",
        nextWorkingWeightKg: currentWeight,
        nextTargetReps: repsMax,
        consecutiveFailures: failures, // Keep counter so third miss triggers step-down
        weightAtFailureStartKg: state.weightAtFailureStartKg, // M1: preserve for third miss
        message: failures >= 3
          ? "Missed the target again but no lighter loadable weight fits within 10% — holding to build back up."
          : "Missed twice in a row but no lighter loadable weight fits within 10% — holding to build back up.",
      };
    }
    
    return {
      ...carried,
      outcome: "backed_off",
      nextWorkingWeightKg: reduced,
      nextTargetReps: repsMax,
      consecutiveFailures: 0,
      weightAtFailureStartKg: null, // M1: clear on successful two-miss back-off
      message: failures >= 3
        ? `Missed the target again — dropping to ${displayWeight(reduced)} to build back.`
        : `Missed twice in a row — dropping to ${displayWeight(reduced)} to build back.`,
    };
  }

  // First miss: drop one equipment grid step with equipment, hold without
  let nextWeight = currentWeight;
  if (currentWeight !== null && currentWeight > 0 && equipmentIds) {
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
    } else {
      // Standard equipment: find the largest grid point STRICTLY below current
      const gridStep = equipmentGridStep(equipmentIds, 'kg');
      const epsilon = 0.001;
      const stepsBelow = Math.floor((currentWeight - epsilon) / gridStep);
      candidateWeight = stepsBelow * gridStep;
      // At or below the smallest loadable step: hold
      if (candidateWeight <= gridStep) {
        candidateWeight = currentWeight;
      }
    }
    
    // Rule 1: if cut > 20%, hold instead
    if (candidateWeight !== currentWeight) {
      const cutFraction = (currentWeight - candidateWeight) / currentWeight;
      if (cutFraction > FIRST_MISS_HOLD_THRESHOLD) {
        candidateWeight = currentWeight;
      }
    }
    
    // Rule 2: if candidate < two-miss result, hold instead
    if (candidateWeight !== currentWeight) {
      const twoMissFloor = computeTwoMissResult(currentWeight);
      if (candidateWeight < twoMissFloor) {
        candidateWeight = currentWeight;
      }
    }
    
    nextWeight = candidateWeight;
  }

  // M1: Store pre-miss weight when failures goes from 0 to 1
  const newWeightAtFailureStart = state.consecutiveFailures === 0 && currentWeight !== null
    ? currentWeight
    : state.weightAtFailureStartKg;

  const message = isTimed
    ? "Staying at this hold length until every set reaches the top of the range."
    : currentWeight === null
      ? "Staying here until every set reaches the top of the range."
      : nextWeight !== null && nextWeight !== currentWeight
        ? `Missed the target — dropping to ${displayWeight(nextWeight)}.`
        : equipmentIds && currentWeight !== null && currentWeight > 0
          ? `Missed the target but holding at ${displayWeight(currentWeight)} — it is the smallest available step.`
          : `Staying at ${displayWeight(currentWeight)} until every set reaches the top of the range.`;
  
  return {
    ...carried,
    outcome: "hold",
    nextWorkingWeightKg: nextWeight,
    consecutiveFailures: failures,
    weightAtFailureStartKg: newWeightAtFailureStart, // M1: store pre-miss weight
    message,
  };
}

/** 
 * What to put in the weight field when the exercise comes round again.
 * When equipmentIds is provided, snaps to the equipment grid (kg).
 * When omitted, uses simple step rounding.
 * 
 * M2: unit parameter removed - grid always kg.
 */
export function suggestedWeight(
  state: Pick<ProgressState, "currentWorkingWeightKg">,
  isDeload: boolean,
  meta: ExerciseMeta,
  equipmentIds?: string[],
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
  const step = meta.isBodyweight && w > 0 ? addedWeightStep(meta, equipmentIds) : incrementFor(meta, equipmentIds);
  
  // For kettlebells, skip rounding to step and go directly to bell grid
  const isKettlebell = equipmentIds?.includes('kettlebell');
  const rawDeload = isKettlebell ? w * 0.7 : roundTo(w * 0.7, step);
  
  // Apply grid rounding DOWN, but never raise above current weight
  const snapped = roundToGrid(rawDeload, equipmentIds, 'kg', step, 'down'); // M2: always kg
  return Math.min(w, snapped);
}
