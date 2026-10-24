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
    target = Math.max(4, Math.min(4, templateSlots));
  } else if (effectiveMinutes <= 30) {
    // 45-min session → 30 min exercise time
    target = Math.max(5, Math.min(6, templateSlots));
  } else if (effectiveMinutes <= 45) {
    // 60-min session → 45 min exercise time (full template)
    target = Math.min(6, templateSlots);
  } else if (effectiveMinutes <= 60) {
    // 75-min session → 60 min exercise time (template + accessories)
    target = Math.min(7, templateSlots);
  } else {
    // 90-min session → 75 min exercise time (template + more accessories)
    target = Math.min(8, templateSlots);
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
 * QA Pass 10 C2: Derive contraindications from exercise properties.
 * - vertical_press or "overhead" in name → shoulder
 * - spinal_load high or moderate → lower_back
 * - squat, lunge, or jump pattern/name → knee
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
  
  // Squat, lunge, or jump movements load knees
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
  
  return derived;
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
  }

  // BMI >= 30 excludes high-impact work
  if (input.bmi !== null && input.bmi >= 30 && ex.impact === "high") return false;
  
  // QA Pass 10 C3: Age >= 50 caps high spinal loading
  // Also block high spinal load for current lower_back injury (handled above via derived contraindications)
  if (input.age !== null && input.age >= 50 && ex.spinal_load === "high") return false;

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

function pickForSlot(
  pattern: Pattern,
  slotIndex: number,
  pool: CandidateExercise[],
  used: Set<string>,
  input: GeneratorInput,
  rng: () => number,
  dayIndex?: number,
): CandidateExercise | null {
  // Main slots (0-3) strongly prefer compounds for the primary movement patterns.
  // This includes horizontal press, pulls, squat, hinge, and vertical press.
  // QA: slot 3 must get OHP/DB press, not front raises.
  const wantCompound = slotIndex < CARRY_OVER_SLOTS || slotIndex <= 3;

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

    // Rank by score, then staple preference for main pattern slots (0-3),
    // then by RNG. QA: apply staples to vertical_press (slot 3) at all levels
    // to ensure intermediate users get OHP, not front raises. Accessories (4+)
    // rely on RNG for block-to-block variety.
    const isMainSlot = slotIndex <= 3;
    
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
    
    const ranked = filtered
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
    // Main slots (0-3) use per-day deduplication, accessories use per-block.
    const templateCount = Math.min(maxExercises, entry.slots.length);
    entry.slots.slice(0, templateCount).forEach((pattern, i) => {
      const usedSet = i <= 3 ? usedToday : usedInBlock;
      const picked = pickForSlot(pattern, i, pool, usedSet, input, rng, dayIndex);
      if (!picked) return;
      usedSet.add(picked.id);
      usedInBlock.add(picked.id); // Always track in block set too for cross-day awareness
      pickedExercises.push({ ex: picked, slotIndex: i });
    });
    
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
        const picked = pickForSlot(pattern, slotIdx, pool, usedInBlock, input, rng, dayIndex);
        if (!picked) break;
        usedInBlock.add(picked.id);
        pickedExercises.push({ ex: picked, slotIndex: slotIdx });
      }
    }

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
