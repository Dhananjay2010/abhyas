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
  category: Enums["exercise_category"];
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
  /** True if user has any knee injury (current or past) - for jump/plyometric/lunge exclusions. */
  anyKneeInjury?: boolean;
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
 * M3: Estimate total session duration in minutes for a generated day.
 * Accounts for warm-up, exercise work time (sets × avg_reps × tempo + rest), and cool-down.
 * 
 * - Warm-up: ~10 min
 * - Per exercise: sets × (avg_reps × 4 sec + rest_seconds) / 60
 * - Cool-down: ~5 min
 * 
 * Used by generator to ensure actual session length stays within ±5 min of target.
 */
export function estimateSessionMinutes(
  day: { exercises: Array<{
    targetSets: number;
    targetRepsMin: number | null;
    targetRepsMax: number | null;
    restSeconds: number;
  }> }
): number {
  const WARMUP_MINUTES = 10;
  const COOLDOWN_MINUTES = 5;
  const SECONDS_PER_REP = 4; // Tempo: 2 sec concentric, 2 sec eccentric
  
  let exerciseMinutes = 0;
  for (const ex of day.exercises) {
    const avgReps = ex.targetRepsMax !== null && ex.targetRepsMin !== null
      ? (ex.targetRepsMin + ex.targetRepsMax) / 2
      : 8; // Default for holds or missing data
    
    const workSeconds = avgReps * SECONDS_PER_REP;
    const totalPerSet = workSeconds + ex.restSeconds;
    exerciseMinutes += (ex.targetSets * totalPerSet) / 60;
  }
  
  return WARMUP_MINUTES + exerciseMinutes + COOLDOWN_MINUTES;
}

/**
 * How many exercises to prescribe based on session length. Longer sessions have
 * more exercises; shorter sessions keep coverage but reduce volume per exercise.
 * 
 * QA Pass 10 M3: The duration model must account for warm-up (~8-11 min) and
 * cool-down (~5-6 min) overhead. A 30-min session has only ~15-17 min of actual
 * exercise time; a 75-min session has ~60-62 min of exercise time.
 * 
 * Updated strategy (accounting for ~15 min warm-up/cool-down overhead):
 * - 30 min: 4 exercises (~15 min exercise time)
 * - 45 min: 5-6 exercises (~30 min exercise time)
 * - 60 min: 6 exercises (~45 min exercise time - full template)
 * - 75 min: 7 exercises (~60 min exercise time - template + accessories)
 * - 90 min: 8 exercises (~75 min exercise time - template + more accessories)
 * 
 * Deterministic: same input always gives same output.
 */
function exerciseCountForDuration(
  sessionMinutes: number,
  templateSlots: number,
): number {
  // QA M3: Account for warm-up (~10 min) and cool-down (~5 min) overhead
  const WARMUP_COOLDOWN_OVERHEAD = 15;
  const effectiveMinutes = Math.max(10, sessionMinutes - WARMUP_COOLDOWN_OVERHEAD);
  
  let target: number;
  
  if (effectiveMinutes <= 15) {
    // 30-min session → 15 min exercise time
    target = 4;
  } else if (effectiveMinutes <= 30) {
    // 45-min session → 30 min exercise time
    target = Math.min(6, templateSlots);
  } else if (effectiveMinutes <= 45) {
    // 60-min session → 45 min exercise time (full template)
    target = templateSlots;
  } else if (effectiveMinutes <= 60) {
    // 75-min session → 60 min exercise time (template + accessories)
    target = Math.min(templateSlots + 1, 8);
  } else {
    // 90-min session → 75 min exercise time (template + more accessories)
    target = Math.min(templateSlots + 2, 9);
  }
  
  return target;
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
 * Staple movements: exercises that users should reliably get for key patterns,
 * regardless of level. These use REAL catalogue slugs verified against production
 * and are deterministically preferred within their pattern. Listed in priority
 * order per pattern and equipment level.
 * 
 * QA-verified production slugs. Every slug here must exist in the catalogue
 * (tested in test-generator.ts).
 * 
 * Exported for testing.
 */
export const STAPLE_MOVEMENTS: Partial<Record<Pattern, string[]>> = {
  horizontal_press: [
    "barbell-bench-press-medium-grip",      // primary gym staple
    "dumbbell-bench-press",                 // dumbbell option
    "barbell-incline-bench-press-medium-grip", // incline variant
    "pushups",                              // bodyweight staple
    "push-up-wide",                         // bodyweight variation
  ],
  squat: [
    "barbell-squat",                        // primary gym staple
    "goblet-squat",                         // beginner gym alternative
    "bodyweight-squat",                     // bodyweight staple
    "leg-press",                            // machine option
  ],
  hinge: [
    "barbell-deadlift",                     // primary gym staple
    "romanian-deadlift",                    // RDL for hamstrings
    "glute-bridge",                         // bodyweight staple
  ],
  horizontal_pull: [
    "bent-over-barbell-row",                // primary gym staple
    "one-arm-dumbbell-row",                 // unilateral option
    "inverted-row",                         // bodyweight
    "doorway-row",                          // no-equipment bodyweight
  ],
  vertical_pull: [
    "wide-grip-lat-pulldown",               // primary gym staple
    "chin-up",                              // bodyweight staple
    "pullups",                              // bodyweight staple
  ],
  vertical_press: [
    "standing-military-press",              // primary gym staple (OHP)
    "dumbbell-shoulder-press",              // dumbbell option
    "pike-push-up",                         // bodyweight
  ],
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

/**
 * Exercises to exclude from automated programming due to safety concerns.
 * 
 * QA Pass 10 C1: Apply to main slots for ALL goals, and to all slots for
 * beginners, injured members, and age 50+. Based on catalogue properties
 * (NOT name substrings) plus curated data columns.
 * 
 * Categories to exclude:
 * - Plyometric (high-impact jumps, bounds, box jumps)
 * - Olympic lifts (clean, snatch, jerk variations)
 * - Behind-the-neck movements (dangerous shoulder positions)
 * - Overhead throws (bradford presses, medicine ball throws)
 * - To-neck movements (upright rows to neck)
 */
function shouldExcludeForSafety(
  ex: CandidateExercise,
  input: GeneratorInput,
  slotIndex: number,
): boolean {
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  // QA C1: For beginners, injured members, and age 50+, exclude from ALL slots
  const excludeFromAllSlots = 
    input.level === "beginner" ||
    input.currentInjuryRegions.length > 0 ||
    (input.age !== null && input.age >= 50);
  
  // For others, exclude from main slots only (0-3)
  const isMainSlot = slotIndex <= 3;
  if (!excludeFromAllSlots && !isMainSlot) {
    return false; // Advanced/intermediate, uninjured, <50, non-main slot: allow
  }
  
  // Behind-the-neck variants (dangerous shoulder position)
  if (nameLower.includes("behind-the-neck") || 
      nameLower.includes("behind neck") ||
      nameLower.includes("behind the neck") ||
      slugLower.includes("behind-the-neck") ||
      slugLower.includes("behind-neck")) {
    return true;
  }
  
  // Olympic lifts: clean, snatch, jerk (check slug and name)
  const olympicPatterns = [
    "clean", "snatch", "jerk"
  ];
  if (olympicPatterns.some(pattern => 
    slugLower.includes(pattern) || nameLower.includes(pattern))) {
    return true;
  }
  
  // Plyometric: high-impact jumps, bounds, box jumps
  if (ex.impact === "high" && 
      (nameLower.includes("jump") || 
       nameLower.includes("bound") || 
       nameLower.includes("box") ||
       slugLower.includes("jump") ||
       slugLower.includes("plyo"))) {
    return true;
  }
  
  // Overhead throws and bradford presses (QA H4)
  const throwBradfordPatterns = [
    "throw", "bradford", "to-neck", "to neck"
  ];
  if (throwBradfordPatterns.some(pattern => 
    slugLower.includes(pattern) || nameLower.includes(pattern))) {
    return true;
  }
  
  // QA H9: Age 60+ also exclude all high-impact moves
  if (input.age !== null && input.age >= 60 && ex.impact === "high") {
    return true;
  }
  
  return false;
}

/**
 * QA Pass 10 H6 (restored from PR #53): Exercises safe for knee injuries despite being quad-focused.
 * These use limited ROM, isometric holds, or controlled movements that don't aggravate the knee.
 * Must be REAL prod slugs only. Exported for testing.
 */
export const KNEE_SAFE_QUAD_EXERCISES: ReadonlySet<string> = new Set([
  'leg-extensions',           // Partial ROM, pain-free range (machine)
  'single-leg-leg-extension', // Partial ROM, pain-free range (machine)
  'wall-sit',                 // Isometric hold, no dynamic stress (bodyweight, seconds metric)
  'spanish-squat',            // Band-resisted, controlled (resistance_band)
]);

/**
 * KNEE-SAFE LUNGE EXERCISES for current OR past knee injuries (PR #73 coordinator requirement).
 * 
 * Step-up variants and controlled split squats only. Excludes deficit/elevated lunges,
 * pistol squats, and side split squat.
 * Must be REAL prod slugs only. Exported for testing.
 */
export const KNEE_SAFE_LUNGE_EXERCISES: ReadonlySet<string> = new Set([
  'step-up-with-knee-raise',      // Controlled step-up, knee-safe
  'barbell-step-ups',             // Step-up variant
  'dumbbell-step-ups',            // Step-up variant
  'split-squat-with-dumbbells',   // Controlled split squat
  'smith-single-leg-split-squat', // Controlled split squat
]);

/**
 * UNSAFE LUNGE EXERCISES for ANY knee injury (current or past).
 * 
 * Deficit lunges, pistols, and side split squat are excluded for any knee.
 */
export const UNSAFE_KNEE_LUNGES: ReadonlySet<string> = new Set([
  'elevated-back-lunge',          // Deficit lunge (coordinator: drop for any knee)
  'barbell-side-split-squat',     // Side split squat (coordinator: drop for any knee)
  'kettlebell-pistol-squat',      // Pistol (baseline: exclude for gym past-knee)
  'smith-machine-pistol-squat',   // Pistol (baseline: exclude for gym past-knee)
]);

/**
 * Floor-pull deadlifts with deep knee flexion, contraindicated for current knee injury.
 * These variants load the knee significantly during the initial pull from the floor.
 * For knee-injured users, prefer hip-dominant hinges (glute bridge, hip thrust).
 * Exported for testing.
 * 
 * Note: kettlebell-one-legged-deadlift is included because the single-leg stance
 * requires significant knee stability and flexion control during the floor pull.
 * 
 * Romanian deadlift is included because even though it's hip-dominant, it requires
 * knee stability and load transmission that can aggravate knee injuries.
 * 
 * Stiff-legged deadlifts (barbell, dumbbell, smith machine) are included as they
 * require significant hamstring flexibility and knee stability under load.
 */
export const FLOOR_PULL_DEADLIFTS: ReadonlySet<string> = new Set([
  'barbell-deadlift',              // Conventional deadlift
  'sumo-deadlift',                 // Sumo stance deadlift
  'deficit-deadlift',              // Deadlift from deficit
  'deadlift-with-bands',           // Conventional with band resistance
  'deadlift-with-chains',          // Conventional with chain resistance
  'reverse-band-deadlift',         // Reverse band setup
  'reverse-band-sumo-deadlift',    // Reverse band sumo
  'sumo-deadlift-with-bands',      // Sumo with bands
  'sumo-deadlift-with-chains',     // Sumo with chains
  'cable-deadlifts',               // Cable variation
  'leverage-deadlift',             // Machine leverage deadlift
  'one-arm-side-deadlift',         // Single-arm floor pull
  'kettlebell-one-legged-deadlift', // Single-leg floor pull (knee stability demand)
  'romanian-deadlift',             // RDL for hamstrings (only variant in catalogue)
  'stiff-legged-barbell-deadlift', // Stiff-leg barbell variant
  'stiff-legged-dumbbell-deadlift', // Stiff-leg dumbbell variant
  'smith-machine-stiff-legged-deadlift', // Smith machine stiff-leg variant
]);

/**
 * QA Pass 10 C2: Derive contraindications from exercise properties.
 * - vertical_press or "overhead" in name → shoulder
 * - spinal_load high or moderate → lower_back
 * - squat, lunge, or jump pattern/name → knee (UNLESS in knee-safe list)
 * 
 * Derived contraindications ADD to explicit tags, don't replace them.
 */
function getDerivedContraindications(ex: CandidateExercise): BodyRegion[] {
  const derived: BodyRegion[] = [];
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  // Vertical press or overhead movements load shoulders
  if (ex.movement_pattern === "vertical_press" ||
      nameLower.includes("overhead") ||
      slugLower.includes("overhead") ||
      nameLower.includes("shoulder press") ||
      nameLower.includes("military press")) {
    derived.push("shoulder");
  }
  
  // High spinal load affects lower back (moderate is manageable for most)
  if (ex.spinal_load === "high") {
    derived.push("lower_back");
  }
  
  // H6: Squat, lunge, or jump movements load knees UNLESS they're in the knee-safe list
  if (!KNEE_SAFE_QUAD_EXERCISES.has(ex.slug)) {
    if (ex.movement_pattern === "squat" ||
        ex.movement_pattern === "lunge" ||
        nameLower.includes("squat") ||
        nameLower.includes("lunge") ||
        nameLower.includes("jump") ||
        slugLower.includes("squat") ||
        slugLower.includes("lunge") ||
        slugLower.includes("jump")) {
      derived.push("knee");
    }
  }
  
  return derived;
}

// M1 equipment alternatives: Exercises where ANY of the listed equipment works
// Each inner array is one valid alternative set
const EQUIPMENT_ALTERNATIVES: Record<string, string[][]> = {
  "goblet-squat": [["dumbbell"], ["kettlebell"]],
};

export function isEligible(ex: CandidateExercise, input: GeneratorInput): boolean {
  // Track: a bodyweight-at-home user must never be shown gym-only work.
  if (input.primaryTrack === "bodyweight" && !ex.tracks.includes("bodyweight")) {
    return false;
  }

  // Level: never prescribe something above the user's stated experience.
  if (LEVEL_RANK[ex.level_min] > LEVEL_RANK[input.level]) return false;

  // Equipment is a hard filter -- SPEC section 4.
  // M1 fix: Default is ALL-of logic (barbell AND bench both needed).
  // Use curated alternatives list for exercises that accept OR options.
  if (!input.hasAllEquipment) {
    const available = new Set(input.equipmentIds);
    
    // Check if this exercise has curated alternatives
    const alternatives = EQUIPMENT_ALTERNATIVES[ex.slug];
    if (alternatives) {
      // At least one alternative set must be fully satisfied
      const hasValidAlternative = alternatives.some(altSet =>
        altSet.every(eq => available.has(eq))
      );
      if (!hasValidAlternative) return false;
    } else {
      // Default: ALL equipment required (AND logic)
      if (ex.equipment_ids.length > 0 && !ex.equipment_ids.every((e) => available.has(e))) {
        return false;
      }
    }
  }

  // QA Pass 10 C2, C3: Current injuries exclude anything that loads the affected joint.
  // Use both explicit tags AND derived contraindications.
  if (input.currentInjuryRegions.length > 0) {
    const allContraindications = [
      ...ex.contraindicated_regions,
      ...getDerivedContraindications(ex),
    ];
    if (allContraindications.some((r) => input.currentInjuryRegions.includes(r))) {
      return false;
    }
    
    // Floor-pull deadlifts with deep knee flexion are completely excluded for knee injuries
    if (input.currentInjuryRegions.includes("knee") && FLOOR_PULL_DEADLIFTS.has(ex.slug)) {
      return false;
    }
  }

  // BMI >= 30 excludes high-impact work
  if (input.bmi !== null && input.bmi >= 30 && ex.impact === "high") return false;
  
  // QA Pass 10 C3: Age >= 50 caps high spinal loading
  // Also block high spinal load for current lower_back injury (handled above via derived contraindications)
  if (input.age !== null && input.age >= 50 && ex.spinal_load === "high") return false;

  // PR #73 coordinator: ANY knee injury (current or past) excludes jump/plyometric moves on ALL slots
  // Detect by catalogue data: high-impact + lower-body primary muscles
  // Applies to both generation and swaps via isEligible
  if (input.anyKneeInjury && ex.impact === "high") {
    const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
    const isLowerBody = ex.primary_muscles.some(m => lowerBodyMuscles.includes(m));
    if (isLowerBody) {
      return false;
    }
  }

  // PR #73 coordinator: ANY knee injury excludes sissy squats (including weighted-sissy-squat)
  if (input.anyKneeInjury && ex.slug.includes("sissy")) {
    return false;
  }

  // PR #73 coordinator: ANY knee injury (current or past) excludes unsafe lunges
  // (deficit lunges, pistol squats, side split squat)
  if (input.anyKneeInjury && UNSAFE_KNEE_LUNGES.has(ex.slug)) {
    return false;
  }

  // PR #73 QA scoped policy: ANY knee (current OR past) uses strict knee-safe lunge list
  // Both current and past knee use KNEE_SAFE_LUNGE_EXERCISES for lunge/split-squat slots
  if (input.anyKneeInjury && ex.movement_pattern === "lunge") {
    if (!KNEE_SAFE_LUNGE_EXERCISES.has(ex.slug)) {
      return false;
    }
  }

  return true;
}

/**
 * How well an exercise suits a slot. Exported so the swap list can rank by the
 * same rule the plan was built with, rather than offering an arbitrary handful.
 * 
 * Returns a numeric score for mechanic/level fit. Staple preference is handled
 * separately via lexicographic ordering to guarantee deterministic selection.
 */
export function score(
  ex: CandidateExercise,
  wantCompound: boolean,
  level: Level,
  primaryTrack: Track = "weights",
): number {
  let s = 0;
  if (wantCompound && ex.mechanic === "compound") s += 4;
  if (!wantCompound && ex.mechanic === "isolation") s += 3;
  
  // QA Pass 10 H1: NO level matching bonus for intermediate/advanced users.
  // The beginner bonus was causing bodyweight moves (tagged beginner) to score
  // higher than loaded staples (tagged intermediate), preventing intermediate
  // users from getting barbell deadlifts, RDLs, barbell OHP, etc.
  // 
  // Beginners still get a small bonus for beginner-tagged work (safer progressions).
  if (ex.level_min === "beginner" && level === "beginner") {
    s += 0.5;
  }
  
  // For bodyweight-track users, also slight preference for beginner-tagged movements
  // since these are the foundational bodyweight staples (push-ups, squats, etc.).
  if (ex.level_min === "beginner" && primaryTrack === "bodyweight") {
    s += 0.3;
  }

  // Equipment penalty only for bodyweight users. For gym users, having a barbell
  // is what bench press needs, not a reason to avoid it.
  if (primaryTrack === "bodyweight") {
    s -= Math.max(0, ex.equipment_ids.length - 1);
  }

  return s;
}

/**
 * Helper to detect if an exercise requires equipment (loaded) vs bodyweight-only.
 * For gym users with equipment, loaded exercises should be preferred in main slots
 * over bodyweight novelty variants (clock push-up, archer push-up, etc.).
 */
function isLoadedExercise(ex: CandidateExercise): boolean {
  return ex.equipment_ids.length > 0;
}

/**
 * Lexicographic sort key for deterministic staple preference.
 * 
 * For gym users with equipment, loaded staples (barbell bench, dumbbell press)
 * are preferred over bodyweight staples (push-ups) in main slots. Bodyweight
 * variants remain available for bodyweight-track users and as fallbacks.
 * 
 * Sorting tiers:
 * - 0: Loaded staple (for equipped users)
 * - 1: Bodyweight staple (for bodyweight-track or as fallback)
 * - 2: Loaded non-staple
 * - 3: Bodyweight non-staple (novelty variants like clock push-up go here)
 */
function stapleSortKey(
  ex: CandidateExercise,
  pattern: Pattern,
  hasEquipment: boolean,
  primaryTrack: Track,
): string {
  const staples = STAPLE_MOVEMENTS[pattern] ?? [];
  const index = staples.indexOf(ex.slug);
  const isStaple = index >= 0;
  const isLoaded = isLoadedExercise(ex);
  
  // For bodyweight-track users, don't penalize bodyweight exercises
  const preferLoaded = hasEquipment && primaryTrack !== "bodyweight";
  
  let tier: number;
  if (isStaple && isLoaded && preferLoaded) {
    tier = 0; // Loaded staple for equipped gym users
  } else if (isStaple) {
    tier = 1; // Bodyweight staple or any staple for bodyweight users
  } else if (isLoaded && preferLoaded) {
    tier = 2; // Loaded non-staple
  } else {
    tier = 3; // Bodyweight non-staple (novelty variants go here)
  }
  
  // Within tier, sort staples by priority, non-staples alphabetically
  const priority = isStaple ? String(index).padStart(3, "0") : ex.slug;
  return `${tier}:${priority}`;
}

/**
 * Safe alternative exercises when a slot pattern is fully filtered out.
 * These are low-risk movements that can substitute for common patterns.
 * 
 * QA Pass 10 H6: For knee injuries, squat alternatives should prioritize lunge
 * pattern first (includes step-ups, split squats, and other single-leg work that
 * may be knee-friendly). If catalogue has knee-safe quad exercises tagged correctly,
 * they'll pass through. Hinge is the final fallback to preserve lower body training.
 */
const SAFE_ALTERNATIVES: Partial<Record<Pattern, Pattern[]>> = {
  squat: ["lunge", "hinge", "core"], // Try lunge first (step-ups, split squats), then hinge
  lunge: ["squat", "hinge", "core"],
  hinge: ["core", "squat"],
  horizontal_press: ["vertical_press", "triceps"],
  vertical_press: ["horizontal_press", "lateral_delt"],
  horizontal_pull: ["vertical_pull", "biceps"],
  vertical_pull: ["horizontal_pull", "rear_delt"],
};

/**
 * Check if adding a candidate exercise would violate constraints in the FINAL sorted order.
 * This is the single source of truth for knee-safe constraints.
 * Exported for testing.
 */
export function wouldViolateConstraints(
  candidate: CandidateExercise,
  slotIndex: number,
  pickedSoFar: Array<{ ex: CandidateExercise; slotIndex: number }>,
  input: GeneratorInput,
): boolean {
  const hasKneeInjury = input.currentInjuryRegions.includes("knee");
  
  // For knee-injured users only: timed holds should not end up in main slots after sorting
  if (hasKneeInjury && candidate.metric === "seconds") {
    // Simulate sorting with this candidate
    const withCandidate = [...pickedSoFar, { ex: candidate, slotIndex }];
    const sorted = withCandidate.sort((a, b) => {
      const aCore = a.ex.movement_pattern === "core";
      const bCore = b.ex.movement_pattern === "core";
      if (aCore && !bCore) return 1;
      if (!aCore && bCore) return -1;
      
      const aCompound = a.ex.mechanic === "compound";
      const bCompound = b.ex.mechanic === "compound";
      if (aCompound && !bCompound) return -1;
      if (!aCompound && bCompound) return 1;
      
      if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
      return a.ex.slug.localeCompare(b.ex.slug);
    });
    
    const candidateIdx = sorted.findIndex(item => item.ex.slug === candidate.slug && item.slotIndex === slotIndex);
    // If candidate ends up in a main slot (orderIndex < 4), reject it
    if (candidateIdx < 4) {
      return true;
    }
  }
  
  // For knee-injured users, check adjacent hinges in FINAL sorted order
  // Only apply constraint to LOADED hinges (spinal_load !== "none")
  // This allows stacking unloaded bridges (glute-bridge, butt-lift-bridge, etc.)
  // and allows a second hinge when a non-hinge exercise separates them
  if (hasKneeInjury && candidate.movement_pattern === "hinge" && candidate.spinal_load !== "none") {
    // Simulate the sorted order with this candidate added
    const withCandidate = [...pickedSoFar, { ex: candidate, slotIndex }];
    const sorted = withCandidate.sort((a, b) => {
      const aCore = a.ex.movement_pattern === "core";
      const bCore = b.ex.movement_pattern === "core";
      if (aCore && !bCore) return 1;
      if (!aCore && bCore) return -1;
      
      const aCompound = a.ex.mechanic === "compound";
      const bCompound = b.ex.mechanic === "compound";
      if (aCompound && !bCompound) return -1;
      if (!aCompound && bCompound) return 1;
      
      if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
      return a.ex.slug.localeCompare(b.ex.slug);
    });
    
    // Find candidate's position in sorted order
    const candidateIdx = sorted.findIndex(item => item.ex.slug === candidate.slug && item.slotIndex === slotIndex);
    
    // Check if IMMEDIATELY adjacent exercises are also hinges (loaded or unloaded)
    if (candidateIdx > 0 && sorted[candidateIdx - 1].ex.movement_pattern === "hinge") {
      return true;
    }
    if (candidateIdx < sorted.length - 1 && sorted[candidateIdx + 1].ex.movement_pattern === "hinge") {
      return true;
    }
  }
  
  return false;
}

function pickForSlot(
  pattern: Pattern,
  slotIndex: number,
  pool: CandidateExercise[],
  used: Set<string>,
  input: GeneratorInput,
  rng: () => number,
  dayIndex?: number,
  pickedSoFar: Array<{ ex: CandidateExercise; slotIndex: number }> = [],
): CandidateExercise | null {
  // Main slots (0-3) strongly prefer compounds for the primary movement patterns.
  // This includes horizontal press, pulls, squat, hinge, and vertical press.
  // QA: slot 3 must get OHP/DB press, not front raises.
  const wantCompound = slotIndex < CARRY_OVER_SLOTS || slotIndex <= 3;
  const isMainSlot = slotIndex <= 3;

  // Keep the main lifts from the previous block so progression is not reset.
  if (slotIndex < CARRY_OVER_SLOTS && dayIndex !== undefined && input.carryOver) {
    const kept = input.carryOver[`${dayIndex}:${pattern}`];
    if (kept && !used.has(kept)) {
      const match = pool.find((e) => e.id === kept);
      if (match) return match;
    }
  }
  
  for (const p of [pattern, PATTERN_FALLBACK[pattern]]) {
    if (!p) continue;
    let candidates = pool.filter((e) => e.movement_pattern === p && !used.has(e.id));
    if (candidates.length === 0) continue;

    // QA Pass 10 C1: Exclude unsafe exercises (plyometric, Olympic, behind-neck, throws)
    // for main slots (all goals) and all slots (beginners, injured, age 50+)
    candidates = candidates.filter((e) => !shouldExcludeForSafety(e, input, slotIndex));
    if (candidates.length === 0) continue; // Try fallback pattern if filtered out
    
    // Apply shared constraint checker (timed holds in mains, adjacent hinges for knee injury)
    candidates = candidates.filter((e) => !wouldViolateConstraints(e, slotIndex, pickedSoFar, input));
    if (candidates.length === 0) continue;

    // Rank by score, then staple preference for main pattern slots (0-3),
    // then by RNG. QA: apply staples to vertical_press (slot 3) at all levels
    // to ensure intermediate users get OHP, not front raises. Accessories (4+)
    // rely on RNG for block-to-block variety.
    
    const ranked = candidates
      .map((e) => ({
        e,
        score: score(e, wantCompound, input.level, input.primaryTrack),
        stapleKey: isMainSlot
          ? stapleSortKey(e, p, input.hasAllEquipment, input.primaryTrack)
          : `1:${e.slug}`, // Non-main slots: no staple bonus
        rng: rng(),
      }))
      .sort((a, b) => {
        // 1. Highest score wins
        if (a.score !== b.score) return b.score - a.score;
        // 2. For main slots: staples win among tied scores (deterministic)
        //    For accessories: skip to RNG for variety
        if (isMainSlot && a.stapleKey !== b.stapleKey) {
          return a.stapleKey < b.stapleKey ? -1 : a.stapleKey > b.stapleKey ? 1 : 0;
        }
        // 3. RNG breaks ties (provides variety for accessories across blocks)
        return b.rng - a.rng;
      });

    return ranked[0].e;
  }
  
  // If no exercise found for this pattern or its fallback, try safe alternatives
  // before giving up. This prevents dropping slots entirely when injuries filter
  // out all primary options (e.g., knee injury rules out squats/lunges).
  const alternatives = SAFE_ALTERNATIVES[pattern] ?? [];
  for (const altPattern of alternatives) {
    const altCandidates = pool.filter(
      (e) => e.movement_pattern === altPattern && !used.has(e.id)
    );
    if (altCandidates.length === 0) continue;
    
    // Apply safety filter to alternative candidates too
    const filtered = altCandidates.filter((e) => !shouldExcludeForSafety(e, input, slotIndex));
    
    if (filtered.length === 0) continue;
    
    // Apply shared constraint checker
    const finalCandidates = filtered.filter((e) => !wouldViolateConstraints(e, slotIndex, pickedSoFar, input));
    if (finalCandidates.length === 0) continue;
    
    const ranked = finalCandidates
      .map((e) => ({
        e,
        score: score(e, slotIndex < 4, input.level, input.primaryTrack),
        stapleKey: stapleSortKey(e, altPattern, input.hasAllEquipment, input.primaryTrack),
        rng: rng(),
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        if (a.stapleKey !== b.stapleKey) {
          return a.stapleKey < b.stapleKey ? -1 : a.stapleKey > b.stapleKey ? 1 : 0;
        }
        return b.rng - a.rng;
      });
    
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

  // QA Pass 10 H2: Per-day `used` for main slots (0-3), per-block for accessories (4+).
  // This prevents second Upper/Lower day from degrading to push-ups/bodyweight squats
  // when loaded staples exist. Main slots can repeat across days (e.g. Day 1 and Day 2
  // both get barbell bench or different staples like flat bench vs incline bench), but
  // accessories need block-wide variety.
  const usedInBlock = new Set<string>();
  const days: GeneratedDay[] = [];

  for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
    const slotPos = activeIdx.indexOf(dayIndex);
    const usedToday = new Set<string>(); // Reset per day for main slot deduplication

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

    // Pick exercises for each slot. For longer sessions (>60 min), we may need
    // more exercises than the template provides, so we'll fill from the template
    // first, then add extra accessories if needed.
    const pickedExercises: Array<{ ex: CandidateExercise; slotIndex: number }> = [];
    
    // QA H2: Fill template slots up to maxExercises.
    // Main slots (0-3) use per-day deduplication to prevent within-day repeats.
    // Accessories (4+) use per-block for variety across days.
    const templateCount = Math.min(maxExercises, entry.slots.length);
    
    // H6: Positive selection for knee injuries on Lower/Full days.
    // Reserve first quad/squat slot for knee-safe exercises if user has knee injury.
    const hasKneeInjury = input.currentInjuryRegions.includes("knee");
    const isLowerOrFullDay = entry.focus === "lower" || entry.focus === "full_body" || entry.focus === "legs";
    let firstQuadSlotHandled = false;
    let kneeSafeFirstPickSlot: number | null = null; // Track which slot got the knee-safe pick
    let kneeSafeFirstPickExerciseId: string | null = null; // Track the exercise ID for M3 protection
    
    entry.slots.slice(0, templateCount).forEach((pattern, i) => {
      const usedSet = i <= 3 ? usedToday : usedInBlock;
      
      // H6: For knee injuries on Lower/Full days, reserve first lower-body slot for knee-safe moves
      const isLowerBodyPattern = pattern === "squat" || pattern === "lunge" || pattern === "hinge";
      if (hasKneeInjury && isLowerOrFullDay && isLowerBodyPattern && !firstQuadSlotHandled) {
        firstQuadSlotHandled = true;
        
        // Priority 1: Find knee-safe quad exercises (compound OR isolation, non-timed holds only)
        const kneeSafeCandidates = pool
          .filter(e => {
            if (!KNEE_SAFE_QUAD_EXERCISES.has(e.slug)) return false;
            if (!e.primary_muscles.includes("quads")) return false;
            if (usedSet.has(e.id)) return false;
            
            // Apply shared constraint checker (will exclude timed holds from main slots, check adjacent hinges)
            if (wouldViolateConstraints(e, i, pickedExercises, input)) {
              return false;
            }
            
            // Use shared eligibility check (level, track, equipment)
            return isEligible(e, input);
          })
          .map(e => ({
            e,
            score: score(e, i < 4, input.level, input.primaryTrack),
            // Prefer compounds over isolations, then by slug
            isCompound: e.mechanic === "compound" ? 0 : 1,
            rng: rng(),
          }))
          .sort((a, b) => {
            // Compounds before isolations
            if (a.isCompound !== b.isCompound) return a.isCompound - b.isCompound;
            // Then by score
            if (a.score !== b.score) return b.score - a.score;
            // Deterministic tiebreaker
            return a.e.slug.localeCompare(b.e.slug);
          });
        
        
        if (kneeSafeCandidates.length > 0) {
          const picked = kneeSafeCandidates[0].e;
          kneeSafeFirstPickSlot = i; // Mark this slot as the knee-safe pick
          kneeSafeFirstPickExerciseId = picked.id; // Save the exercise ID for M3 protection
          usedSet.add(picked.id);
          if (i <= 3) {
            usedInBlock.add(picked.id);
          }
          pickedExercises.push({ ex: picked, slotIndex: i });
          return;
        }
        
        
        // Priority 2 (Fallback): If no knee-safe quad exists, use knee-safe hip-dominant move
        const kneeSafeHipDominant = pool
          .filter(e => {
            // Glute bridge, hip thrust, single-leg bridge, bodyweight RDL
            const isHipDominant = e.movement_pattern === "hinge" || 
                                 e.slug.includes("bridge") || 
                                 e.slug.includes("hip-thrust");
            if (!isHipDominant) return false;
            if (e.mechanic !== "compound") return false;
            if (usedSet.has(e.id)) return false;
            
            // Apply safety filter
            if (shouldExcludeForSafety(e, input, i)) return false;
            
            // Apply shared constraint checker (timed holds, adjacent hinges)
            if (wouldViolateConstraints(e, i, pickedExercises, input)) return false;
            
            // Use isEligible for level, track, equipment checks
            return isEligible(e, input);
          })
          .map(e => ({
            e,
            score: score(e, i < 4, input.level, input.primaryTrack),
            rng: rng(),
          }))
          .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return a.e.slug.localeCompare(b.e.slug); // Deterministic secondary sort
          });
        
        if (kneeSafeHipDominant.length > 0) {
          const picked = kneeSafeHipDominant[0].e;
          usedSet.add(picked.id);
          if (i <= 3) {
            usedInBlock.add(picked.id);
          }
          pickedExercises.push({ ex: picked, slotIndex: i });
          return;
        }
        // Fall through to normal pickForSlot if no knee-safe options at all
      }
      
      const picked = pickForSlot(pattern, i, pool, usedSet, input, rng, dayIndex, pickedExercises);
      if (!picked) {
        // Special handling for knee-injured users on Lower/Legs days:
        // If the pattern was lower-body and failed (likely due to adjacent hinges),
        // try to fill with a non-hinge knee-safe lower-body exercise before giving up
        const isLowerBodyPattern = pattern === "squat" || pattern === "lunge" || pattern === "hinge";
        if (hasKneeInjury && isLowerOrFullDay && isLowerBodyPattern) {
          const kneeSafeNonHinge = pool
            .filter(e => {
              if (usedSet.has(e.id)) return false;
              
              // Must be a lower-body exercise (quads, glutes, hamstrings, calves, adductors, abductors)
              const isLowerBody = e.primary_muscles.some(m => 
                ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"].includes(m)
              );
              if (!isLowerBody) return false;
              
              // Must NOT be a hinge or core (we want alternatives to blocked hinges)
              if (e.movement_pattern === "hinge" || e.movement_pattern === "core") return false;
              
              // Check constraints
              if (wouldViolateConstraints(e, i, pickedExercises, input)) return false;
              
              // Must be eligible
              return isEligible(e, input);
            })
            .sort((a, b) => 
              score(b, i < 4, input.level, input.primaryTrack) - score(a, i < 4, input.level, input.primaryTrack) ||
              a.slug.localeCompare(b.slug)
            );
          
          if (kneeSafeNonHinge.length > 0) {
            const fallback = kneeSafeNonHinge[0];
            usedSet.add(fallback.id);
            if (i <= 3) {
              usedInBlock.add(fallback.id);
            }
            pickedExercises.push({ ex: fallback, slotIndex: i });
            return; // Successfully filled
          }
        }
        return; // Give up on this slot
      }
      usedSet.add(picked.id);
      if (i <= 3) {
        usedInBlock.add(picked.id); // Main slots also tracked block-wide for cross-day variety
      }
      pickedExercises.push({ ex: picked, slotIndex: i });
    });
    
    // H6: After slot assignment, ensure Lower/Full days for knee-injured users have at least 1 quad exercise
    if (hasKneeInjury && isLowerOrFullDay) {
      const hasQuadWork = pickedExercises.some(p => p.ex.primary_muscles.includes("quads"));
      if (!hasQuadWork) {
        // Force-add a knee-safe quad exercise (including wall-sit as accessory)
        const kneeSafeOptions = pool
          .filter(e => {
            if (!KNEE_SAFE_QUAD_EXERCISES.has(e.slug)) return false;
            if (!e.primary_muscles.includes("quads")) return false;
            if (usedInBlock.has(e.id)) return false;
            
            // Use shared eligibility check
            return isEligible(e, input);
          })
          .sort((a, b) => 
            score(b, false, input.level, input.primaryTrack) - score(a, false, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug)
          );
        
        if (kneeSafeOptions.length > 0) {
          const added = kneeSafeOptions[0];
          usedInBlock.add(added.id);
          pickedExercises.push({ ex: added, slotIndex: pickedExercises.length });
        }
      }
      
      // Ensure Lower/Legs days have at least 2 non-core lower-body exercises
      // Count current non-core lower-body picks
      const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
      const nonCoreLowerCount = pickedExercises.filter(p => {
        if (p.ex.movement_pattern === "core") return false;
        return p.ex.primary_muscles.some(m => lowerBodyMuscles.includes(m));
      }).length;
      
      if (nonCoreLowerCount < 2) {
        // Try to add more lower-body exercises (including unloaded hinges and wall-sit)
        const needed = 2 - nonCoreLowerCount;
        
        for (let attempt = 0; attempt < needed; attempt++) {
          const additionalLower = pool
            .filter(e => {
              if (usedInBlock.has(e.id)) return false;
              if (e.movement_pattern === "core") return false;
              
              const isLowerBody = e.primary_muscles.some(m => lowerBodyMuscles.includes(m));
              if (!isLowerBody) return false;
              
              // Must be eligible and knee-safe
              if (!isEligible(e, input)) return false;
              if (e.contraindicated_regions.includes("knee")) return false;
              if (e.movement_pattern === "squat" || e.movement_pattern === "lunge") {
                if (!KNEE_SAFE_QUAD_EXERCISES.has(e.slug)) return false;
              }
              
              // For hinges, only allow unloaded ones to avoid adjacency issues
              if (e.movement_pattern === "hinge" && e.spinal_load !== "none") return false;
              
              // Check constraints (including adjacency) with current picked exercises
              const testSlotIndex = pickedExercises.length;
              if (wouldViolateConstraints(e, testSlotIndex, pickedExercises, input)) return false;
              
              return true;
            })
            .sort((a, b) => 
              score(b, false, input.level, input.primaryTrack) - score(a, false, input.level, input.primaryTrack) ||
              a.slug.localeCompare(b.slug)
            );
          
          if (additionalLower.length > 0) {
            const added = additionalLower[0];
            usedInBlock.add(added.id);
            pickedExercises.push({ ex: added, slotIndex: pickedExercises.length });
          } else {
            break; // No more valid exercises available
          }
        }
      }
    }
    
    // H8: After slot assignment, ensure bodyweight upper/full days have at least 1 pull for balance
    const isBWPlan = input.primaryTrack === "bodyweight";
    const isUpperOrFullDay = entry.focus === "upper" || entry.focus === "pull" || entry.focus === "push";
    if (isBWPlan && isUpperOrFullDay) {
      const hasPull = pickedExercises.some(p => 
        p.ex.movement_pattern === "horizontal_pull" || p.ex.movement_pattern === "vertical_pull"
      );
      if (!hasPull) {
        // Force-add a bodyweight pull exercise
        const pullOptions = pool
          .filter(e => {
            if (e.movement_pattern !== "horizontal_pull" && e.movement_pattern !== "vertical_pull") return false;
            if (usedInBlock.has(e.id)) return false;
            return isEligible(e, input);
          })
          .sort((a, b) => 
            score(b, false, input.level, input.primaryTrack) - score(a, false, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug)
          );
        
        if (pullOptions.length > 0) {
          const added = pullOptions[0];
          usedInBlock.add(added.id);
          pickedExercises.push({ ex: added, slotIndex: pickedExercises.length });
        }
      }
    }

    // QA: 50+ users (or anyone avoiding high spinal load) get safer loaded hinges on lower days
    const avoidHighSpinalLoad = input.age !== null && input.age >= 50;
    if (avoidHighSpinalLoad && isLowerOrFullDay && (input.hasAllEquipment || input.equipmentIds.length > 0)) {
      const hinges = pickedExercises.filter(p => p.ex.movement_pattern === "hinge");
      const hasHighSpinalHinge = hinges.some(p => p.ex.spinal_load === "high");
      const hasSafeLoadedHinge = hinges.some(p => 
        p.ex.spinal_load !== "high" &&
        p.ex.equipment_ids.some(id => id === "barbell" || id === "dumbbell" || id === "kettlebell" || id === "cable_machine")
      );
      
      // If we have a high-spinal hinge, try to replace it
      if (hasHighSpinalHinge) {
        const saferHinges = pool
          .filter(e => {
            if (e.movement_pattern !== "hinge") return false;
            if (e.spinal_load === "high") return false;
            if (usedInBlock.has(e.id)) return false;
            if (!isEligible(e, input)) return false;
            // Must be loaded (barbell, dumbbell, kettlebell, or cable)
            const hasLoadedEquipment = e.equipment_ids.some(id => 
              id === "barbell" || id === "dumbbell" || id === "kettlebell" || id === "cable_machine"
            );
            return hasLoadedEquipment;
          })
          .sort((a, b) => 
            score(b, false, input.level, input.primaryTrack) - score(a, false, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug)
          );
        
        if (saferHinges.length > 0) {
          // Replace the first high-spinal hinge with a safer one
          const highHingeIndex = pickedExercises.findIndex(p => 
            p.ex.movement_pattern === "hinge" && p.ex.spinal_load === "high"
          );
          if (highHingeIndex !== -1) {
            const replaced = pickedExercises[highHingeIndex];
            usedInBlock.delete(replaced.ex.id);
            const safer = saferHinges[0];
            usedInBlock.add(safer.id);
            pickedExercises[highHingeIndex] = { ex: safer, slotIndex: replaced.slotIndex };
          }
        }
      }
      
      // After replacement, ensure we have at least one safe loaded hinge
      const hasSafeLoadedHingeNow = pickedExercises.some(p => 
        p.ex.movement_pattern === "hinge" &&
        p.ex.spinal_load !== "high" &&
        p.ex.equipment_ids.some(id => id === "barbell" || id === "dumbbell" || id === "kettlebell" || id === "cable_machine")
      );
      
      if (!hasSafeLoadedHingeNow) {
        // Force-add a safe loaded hinge
        const safeHinges = pool
          .filter(e => {
            if (e.movement_pattern !== "hinge") return false;
            if (e.spinal_load === "high") return false;
            if (usedInBlock.has(e.id)) return false;
            if (!isEligible(e, input)) return false;
            const hasLoadedEquipment = e.equipment_ids.some(id => 
              id === "barbell" || id === "dumbbell" || id === "kettlebell" || id === "cable_machine"
            );
            return hasLoadedEquipment;
          })
          .sort((a, b) => 
            score(b, false, input.level, input.primaryTrack) - score(a, false, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug)
          );
        
        if (safeHinges.length > 0) {
          const added = safeHinges[0];
          usedInBlock.add(added.id);
          pickedExercises.push({ ex: added, slotIndex: pickedExercises.length });
        }
      }
    }

    // For longer sessions, add extra accessories beyond the template.
    // These are always accessories (slot 4+), so use block-wide deduplication.
    if (maxExercises > entry.slots.length && pickedExercises.length >= entry.slots.length) {
      const extraNeeded = maxExercises - pickedExercises.length;
      const accessoryPatterns = entry.slots
        .filter(p => p !== "core") // Don't duplicate core
        .slice(-2); // Use the last 2 accessory patterns from the template
      
      for (let i = 0; i < extraNeeded; i++) {
        const pattern = accessoryPatterns[i % accessoryPatterns.length];
        const slotIdx = entry.slots.length + i;
        const picked = pickForSlot(pattern, slotIdx, pool, usedInBlock, input, rng, dayIndex, pickedExercises);
        if (!picked) break;
        usedInBlock.add(picked.id);
        pickedExercises.push({ ex: picked, slotIndex: slotIdx });
      }
    }

    // Sort exercises within the day: main compounds first, then secondary compounds,
    // then accessories/isolation, with core exercises last. This keeps sessions
    // trainer-quality (squat before bicep curls, abs at the end).
    // Must stay deterministic (slug as tiebreaker).
    // EXCEPTION: For knee-injured users on Lower/Full days, the knee-safe first pick
    // must stay first even if it's an isolation (to satisfy Rule 1).
    const ordered = pickedExercises.sort((a, b) => {
      // Knee-safe first pick always stays first
      if (kneeSafeFirstPickSlot !== null) {
        if (a.slotIndex === kneeSafeFirstPickSlot && b.slotIndex !== kneeSafeFirstPickSlot) {
          return -1;
        }
        if (b.slotIndex === kneeSafeFirstPickSlot && a.slotIndex !== kneeSafeFirstPickSlot) {
          return 1;
        }
      }
      
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

    // Convert sorted picks to GeneratedExercise with correct orderIndex.
    // Apply volume floor: ensure each pattern gets minimum working sets (at least 2)
    // even when session length cuts exercises or sets.
    const patternSets = new Map<Pattern, number>();
    for (const item of ordered) {
      patternSets.set(
        item.ex.movement_pattern,
        (patternSets.get(item.ex.movement_pattern) || 0) + 1
      );
    }

    ordered.forEach((item, orderIndex) => {
      const isolation = item.ex.mechanic === "isolation";
      let p: Prescription = prescribe(
        input.goal,
        input.level,
        isolation,
        item.ex.metric ?? "reps",
        sessionMinutes, // Pass session length to adjust sets
        item.ex.equipment_ids, // QA H5: Pass equipment to avoid strength prescription on bodyweight/band
      );

      // Volume floor: if this is the only exercise for its pattern and sets < 2,
      // boost to minimum of 2 sets so the pattern gets working volume.
      const patternCount = patternSets.get(item.ex.movement_pattern) || 1;
      if (patternCount === 1 && p.sets < 2) {
        p = { ...p, sets: 2 };
      }

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

    // QA Pass 10 H8: A day with no exercises is a dead end. For bodyweight upper/full-body
    // days, prioritize at least one pulling movement to maintain push:pull balance.
    // The day is relabelled when backfilled (it's not "Pull" if there are no pulls).
    const backfilled = exercises.length === 0;
    if (exercises.length === 0) {
      const isBWPlan = input.primaryTrack === "bodyweight";
      const isUpperOrFullDay = entry.focus === "pull" || entry.focus === "push" || entry.focus === "upper";
      
      const candidates = pool
        .filter((e) => !usedInBlock.has(e.id))
        .sort(
          (a, b) =>
            score(b, true, input.level, input.primaryTrack) -
              score(a, true, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug),
        );
      
      let backfill: CandidateExercise[];
      
      // QA H8: For bodyweight upper/full-body days, ensure at least one pull
      if (isBWPlan && isUpperOrFullDay) {
        const pulls = candidates.filter((e) => 
          e.movement_pattern === "horizontal_pull" || 
          e.movement_pattern === "vertical_pull"
        );
        const nonPulls = candidates.filter((e) => 
          e.movement_pattern !== "horizontal_pull" && 
          e.movement_pattern !== "vertical_pull"
        );
        
        // If we have at least one pull available, take 1 pull + 3 others
        if (pulls.length > 0) {
          backfill = [pulls[0], ...nonPulls.slice(0, 3)];
        } else {
          backfill = candidates.slice(0, 4);
        }
      } else {
        backfill = candidates.slice(0, 4);
      }

      backfill.forEach((picked) => {
        usedInBlock.add(picked.id);
        const p = prescribe(
          input.goal,
          input.level,
          picked.mechanic === "isolation",
          picked.metric ?? "reps",
          input.preferredSessionMinutes,
          picked.equipment_ids, // QA H5: Pass equipment to avoid strength prescription on bodyweight/band
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

    // M3: Adjust volume to hit target session length (±5 min)
    if (input.preferredSessionMinutes && exercises.length > 0) {
      const targetMin = input.preferredSessionMinutes;
      const lowerBound = targetMin - 5;
      const upperBound = targetMin + 5;
      const minExercises = Math.max(4, Math.floor(entry.slots.length * 0.8)); // Allow dropping to 80% of template, minimum 4
      
      // Iteratively adjust volume to hit target ±5 min
      let estimate = estimateSessionMinutes({ exercises });
      let iterations = 0;
      const MAX_ITERATIONS = 30; // Safety limit
      
      // First pass: if over target, drop accessories or reduce sets (but never below minimum)
      while (estimate > upperBound && iterations < MAX_ITERATIONS) {
        iterations++;
        
        // Strategy 1: Drop an accessory if we have more than minimum, preferring duplicates
        if (exercises.length > minExercises) {
          const patternsSeen = new Set<string>();
          const patternCounts = new Map<string, number>();
          let dropIndex = -1;
          
          // Count patterns
          for (const ex of exercises) {
            const candidate = pool.find(e => e.id === ex.exerciseId);
            if (candidate) {
              patternCounts.set(candidate.movement_pattern, (patternCounts.get(candidate.movement_pattern) || 0) + 1);
            }
          }
          
          // Find the first duplicate from the end (prefer dropping duplicates)
          for (let i = exercises.length - 1; i >= 0; i--) {
            const ex = pool.find(e => e.id === exercises[i].exerciseId);
            if (ex) {
              const count = patternCounts.get(ex.movement_pattern) || 0;
              if (count > 1) {
                // Only drop if this pattern has duplicates
                dropIndex = i;
                break;
              }
            }
          }
          
          // If no duplicates, drop the last exercise UNLESS it's core (keep variety)
          if (dropIndex === -1) {
            for (let i = exercises.length - 1; i >= 0; i--) {
              const ex = pool.find(e => e.id === exercises[i].exerciseId);
              if (ex && ex.movement_pattern !== "core") {
                dropIndex = i;
                break;
              }
            }
            // If only core is droppable, drop it as last resort
            if (dropIndex === -1) {
              dropIndex = exercises.length - 1;
            }
          }
          
          exercises.splice(dropIndex, 1);
          // Reindex remaining exercises
          exercises.forEach((e, idx) => { e.orderIndex = idx; });
          estimate = estimateSessionMinutes({ exercises });
          continue;
        }
        
        // Strategy 2: Reduce sets on accessories (down to 2 minimum)
        const accessories = exercises
          .map((ex, idx) => ({ ex, idx }))
          .filter(({ idx, ex }) => idx >= 4 && ex.targetSets > 2);
        
        if (accessories.length > 0) {
          accessories[0].ex.targetSets--;
          estimate = estimateSessionMinutes({ exercises });
          continue;
        }
        
        // Strategy 3: Reduce sets on main exercises (down to 2 minimum)
        const mains = exercises
          .map((ex, idx) => ({ ex, idx }))
          .filter(({ ex }) => ex.targetSets > 2);
        
        if (mains.length > 0) {
          mains[mains.length - 1].ex.targetSets--; // Reduce last exercise first
          estimate = estimateSessionMinutes({ exercises });
          continue;
        }
        
        break; // Can't reduce further
      }
      
      // Second pass: if under target, add sets or exercises
      while (estimate < lowerBound && iterations < MAX_ITERATIONS) {
        iterations++;
        
        // Strategy 1: Add a set to accessories (slots 4+, up to 4 sets max)
        const accessories = exercises
          .map((ex, idx) => ({ ex, idx }))
          .filter(({ idx }) => idx >= 4 && exercises[idx].targetSets < 4);
        
        if (accessories.length > 0) {
          // Deterministic: pick first accessory that can take another set
          accessories[0].ex.targetSets++;
          estimate = estimateSessionMinutes({ exercises });
          continue;
        }
        
        // Strategy 2: Add a set to main exercises (up to 5 sets max for main lifts)
        const mainExercises = exercises
          .map((ex, idx) => ({ ex, idx }))
          .filter(({ idx }) => idx < 4 && exercises[idx].targetSets < 5);
        
        if (mainExercises.length > 0) {
          mainExercises[0].ex.targetSets++;
          estimate = estimateSessionMinutes({ exercises });
          continue;
        }
        
        // Strategy 3: Add another accessory exercise
        const accessoryPatterns = entry.slots.slice(-2); // Last 2 patterns
        if (accessoryPatterns.length > 0) {
          const pattern = accessoryPatterns[exercises.length % accessoryPatterns.length];
          const candidates = pool
            .filter((e) => 
              e.movement_pattern === pattern &&
              !usedInBlock.has(e.id) &&
              isEligible(e, input)
            )
            .sort((a, b) => 
              score(b, true, input.level, input.primaryTrack) -
              score(a, true, input.level, input.primaryTrack) ||
              a.slug.localeCompare(b.slug)
            );
          
          if (candidates.length > 0) {
            const picked = candidates[0];
            usedInBlock.add(picked.id);
            const p = prescribe(
              input.goal,
              input.level,
              picked.mechanic === "isolation",
              picked.metric ?? "reps",
              sessionMinutes,
              picked.equipment_ids,
            );
            
            // Find the insertion position:
            // 1. Must be before core exercises (core stays last)
            // 2. Must NOT be before knee-safe first pick (to preserve Rule 1)
            const lastCoreIndex = exercises.map((ex, idx) => {
              const e = pool.find(p => p.id === ex.exerciseId);
              return e?.movement_pattern === "core" ? idx : -1;
            }).reduce((max, idx) => Math.max(max, idx), -1);
            
            // Find the knee-safe first pick's position (if it exists)
            const kneeSafeIndex = kneeSafeFirstPickExerciseId !== null
              ? exercises.findIndex(ex => ex.exerciseId === kneeSafeFirstPickExerciseId)
              : -1;
            
            // Default: insert before core (or at end if no core)
            let insertIndex = lastCoreIndex >= 0 ? lastCoreIndex : exercises.length;
            
            // But if knee-safe pick is at position 0, insert after it (position 1 minimum)
            if (kneeSafeIndex === 0) {
              insertIndex = Math.max(1, insertIndex);
            }
            
            // Insert at the correct position and update orderIndex for all exercises after it
            exercises.splice(insertIndex, 0, {
              exerciseId: picked.id,
              name: picked.name,
              orderIndex: insertIndex,
              targetSets: p.sets,
              targetRepsMin: p.repsMin,
              targetRepsMax: p.repsMax,
              restSeconds: p.restSeconds,
            });
            
            // Update orderIndex for exercises after the insertion point
            for (let j = insertIndex + 1; j < exercises.length; j++) {
              exercises[j].orderIndex = j;
            }
            
            estimate = estimateSessionMinutes({ exercises });
          } else {
            break; // No more accessories available
          }
        } else {
          break; // No accessory patterns to work with
        }
      }
    }

    // QA Pass 10 H8: For bodyweight upper/full-body days, ensure at least one pull for balance
    // This check happens AFTER M3 pacing to ensure the pull isn't dropped
    const isBWCheck = input.primaryTrack === "bodyweight";
    const isUpperOrFullCheck = entry.focus === "upper" || entry.focus === "pull" || entry.focus === "push";
    
    if (isBWCheck && isUpperOrFullCheck && exercises.length > 0) {
      const hasPull = exercises.some(ex => {
        const candidate = pool.find(e => e.id === ex.exerciseId);
        return candidate && (candidate.movement_pattern === "horizontal_pull" || candidate.movement_pattern === "vertical_pull");
      });
      
      // If no pull exists after pacing, add one
      if (!hasPull) {
        const pullCandidates = pool
          .filter(e => 
            (e.movement_pattern === "horizontal_pull" || e.movement_pattern === "vertical_pull") &&
            !usedInBlock.has(e.id) &&
            isEligible(e, input)
          )
          .sort((a, b) => 
              score(b, true, input.level, input.primaryTrack) -
              score(a, true, input.level, input.primaryTrack) ||
            a.slug.localeCompare(b.slug)
          );
        
        if (pullCandidates.length > 0) {
          const picked = pullCandidates[0];
          usedInBlock.add(picked.id);
          const p = prescribe(
            input.goal,
            input.level,
            picked.mechanic === "isolation",
            picked.metric ?? "reps",
            sessionMinutes,
            picked.equipment_ids,
          );
          
          // Find the last core exercise to insert before it (core must stay last)
          const lastCoreIndex = exercises.map((ex, idx) => {
            const e = pool.find(p => p.id === ex.exerciseId);
            return e?.movement_pattern === "core" ? idx : -1;
          }).reduce((max, idx) => Math.max(max, idx), -1);
          
          const insertIndex = lastCoreIndex >= 0 ? lastCoreIndex : exercises.length;
          
          // Insert at the correct position and update orderIndex for all exercises after it
          exercises.splice(insertIndex, 0, {
            exerciseId: picked.id,
            name: picked.name,
            orderIndex: insertIndex,
            targetSets: p.sets,
            targetRepsMin: p.repsMin,
            targetRepsMax: p.repsMax,
            restSeconds: p.restSeconds,
          });
          
          // Update orderIndex for exercises after the insertion point
          for (let j = insertIndex + 1; j < exercises.length; j++) {
            exercises[j].orderIndex = j;
          }
        }
      }
    }
    
    // Final sort to ensure compound-before-isolation order after M3/H8 splices
    // Only apply when there were backfills or knee-specific manipulations that might have disrupted order
    // For no-injury users with no backfills, preserve the original sort from line 1336
    if (backfilled || kneeSafeFirstPickExerciseId !== null || hasKneeInjury) {
      // Preserve: knee-safe first pick at position 0, core at end
      const kneeSafeIndex = kneeSafeFirstPickExerciseId !== null
        ? exercises.findIndex(ex => ex.exerciseId === kneeSafeFirstPickExerciseId)
        : -1;
      
      // Build lookup map for O(1) access instead of pool.find() in comparator
      const byId = new Map(pool.map(e => [e.id, e]));
      
      exercises.sort((a, b) => {
        const aEx = byId.get(a.exerciseId);
        const bEx = byId.get(b.exerciseId);
        if (!aEx || !bEx) return 0;
        
        // Knee-safe first pick always stays first
        if (kneeSafeIndex === a.orderIndex && kneeSafeIndex === 0) return -1;
        if (kneeSafeIndex === b.orderIndex && kneeSafeIndex === 0) return 1;
        
        const aCore = aEx.movement_pattern === "core";
        const bCore = bEx.movement_pattern === "core";
        if (aCore && !bCore) return 1;  // Core goes last
        if (!aCore && bCore) return -1;
        
        const aCompound = aEx.mechanic === "compound";
        const bCompound = bEx.mechanic === "compound";
        if (aCompound && !bCompound) return -1;  // Compounds before isolations
        if (!aCompound && bCompound) return 1;
        
        // Preserve current order within same category
        return a.orderIndex - b.orderIndex;
      });
      
      // Rebuild orderIndex after sort
      exercises.forEach((ex, idx) => {
        ex.orderIndex = idx;
      });
      
      // Ensure no timed holds (metric="seconds") landed in main slots (0-3) after sort
      // This can happen when force-adding wall-sit or similar accessories
      // Reuse the byId map from final sort above
      const timedHoldInMain = exercises.findIndex((ex, idx) => {
        if (idx >= 4) return false; // Only check main slots
        const e = byId.get(ex.exerciseId);
        return e?.metric === "seconds";
      });
      
      if (timedHoldInMain !== -1) {
        // Find first accessory slot (position 4+) that is NOT a timed hold
        const firstNonTimedAccessory = exercises.findIndex((ex, idx) => {
          if (idx < 4) return false; // Only check accessory slots
          const e = byId.get(ex.exerciseId);
          return e?.metric !== "seconds";
        });
        
        if (firstNonTimedAccessory !== -1) {
          // Swap timed hold with non-timed accessory
          const temp = exercises[timedHoldInMain];
          exercises[timedHoldInMain] = exercises[firstNonTimedAccessory];
          exercises[firstNonTimedAccessory] = temp;
          
          // Rebuild orderIndex after swap
          exercises.forEach((ex, idx) => {
            ex.orderIndex = idx;
          });
        } else {
          // No non-timed accessory to swap with - remove the timed hold from main slot
          // and append to end
          const [removed] = exercises.splice(timedHoldInMain, 1);
          exercises.push(removed);
          
          // Rebuild orderIndex
          exercises.forEach((ex, idx) => {
            ex.orderIndex = idx;
          });
        }
      }
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
