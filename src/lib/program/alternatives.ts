import type { Database } from "@/lib/database.types";
import type { CandidateExercise } from "@/lib/program/generate";
import { EXCLUDED_EXERCISE_SLUGS } from "@/lib/program/exclusions";
import { pastKneeLungeTier, isPastKneeTier1LevelExempt } from "@/lib/program/past-knee-lunge-order";
import { isExcludedForPastKnee, isExcludedForCurrentKneeOnly, shouldExcludeOlympicLift } from "@/lib/program/past-knee";
import { PAST_KNEE_LUNGE_EXERCISES } from "@/lib/program/generate";
import { isKneeRiskForKneeUser } from "@/lib/program/knee-safety";


export type ExerciseRow = CandidateExercise;
type MovementPattern = Database["public"]["Enums"]["movement_pattern"];

export type AlternativesContext = {
  level: Database["public"]["Enums"]["fitness_level"];
  availableEquipment: Set<string> | null;
  injuryRegions: Database["public"]["Enums"]["body_region"][];
  anyKneeInjury?: boolean;
  limit?: number;
  scoreFn: (exercise: ExerciseRow) => number;
  tieBreakFn: (slug: string) => number;
};

const LEVEL_ORDER: Record<Database["public"]["Enums"]["fitness_level"], number> = {
  beginner: 0,
  intermediate: 1,
  expert: 2,
};

const FALLBACK_PATTERNS: Partial<Record<MovementPattern, MovementPattern>> = {
  lunge: "squat",
  squat: "lunge",
};

// Knee-safe lower-body patterns (hinge work, plus core holds like wall-sit)
const KNEE_SAFE_LOWER_PATTERNS: MovementPattern[] = ["hinge", "core"];

/**
 * Build the list of patterns to query for alternatives.
 * Returns [currentPattern, ...fallbackPatterns, ...kneeSafePatterns if applicable]
 */
export function buildPatternList(
  currentPattern: MovementPattern,
  hasKneeInjury: boolean,
  hasCurrentKnee?: boolean,
): MovementPattern[] {
  const patterns: MovementPattern[] = [currentPattern];
  
  // For CURRENT knee injuries on lunge pattern, DON'T add squat fallback
  // (current knee has NO lunges; would incorrectly widen swaps to barbell-squat, etc.)
  // For PAST knee on lunge pattern, DO add squat fallback
  // (past-knee lunge tier includes split squats and step-ups which are squat pattern)
  // When hasCurrentKnee is undefined, treat hasKneeInjury as current knee (backwards compat)
  const isCurrentKnee = (hasCurrentKnee === true) || (hasCurrentKnee === undefined && hasKneeInjury);
  const skipFallback = isCurrentKnee && currentPattern === "lunge";
  
  if (!skipFallback) {
    // Add direct fallback (lunge↔squat)
    const fallback = FALLBACK_PATTERNS[currentPattern];
    if (fallback && !patterns.includes(fallback)) {
      patterns.push(fallback);
    }
  }
  
  // For knee injuries on lower-body patterns, add knee-safe alternatives
  if (hasKneeInjury && (currentPattern === "lunge" || currentPattern === "squat")) {
    for (const pattern of KNEE_SAFE_LOWER_PATTERNS) {
      if (!patterns.includes(pattern)) {
        patterns.push(pattern);
      }
    }
  }
  
  return patterns;
}

/**
 * Normalize an exercise name to detect near-duplicates.
 * 
 * Rules:
 * - Lowercase
 * - Strip parentheticals
 * - Strip punctuation
 * - Normalize push-up variants to 'push up'
 * - Remove common filler words (hand position, grip, width, stance)
 */
function normalizeName(name: string): string {
  let normalized = name.toLowerCase();
  
  // Strip parentheticals
  normalized = normalized.replace(/\([^)]*\)/g, " ");
  
  // Strip punctuation
  normalized = normalized.replace(/[^\w\s]/g, " ");
  
  // Normalize push-up variants
  normalized = normalized.replace(/pushups?|push-ups?/g, "push up");
  
  // Remove filler words for hand position, grip, width, stance
  const fillers = [
    "wide", "close", "narrow", "grip", "grips",
    "variation", "version", "position", "positions",
    "with", "on", "a", "the", "and", "or",
    "floor", "knees", "hand", "hands",
    "stance", "foot", "feet",
  ];
  
  for (const word of fillers) {
    // Use word boundaries to avoid removing parts of words
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

/**
 * Check if an exercise is isometric (holds, static positions)
 */
function isIsometric(exercise: ExerciseRow): boolean {
  return (
    exercise.metric === "seconds" ||
    exercise.name.toLowerCase().includes("isometric") ||
    exercise.slug.includes("isometric")
  );
}

/**
 * Score equipment/load fit: prefer similar equipment to current
 */
function scoreEquipmentFit(current: ExerciseRow, candidate: ExerciseRow): number {
  const currentEquipment = new Set(current.equipment_ids);
  const candidateEquipment = new Set(candidate.equipment_ids);
  
  // Both bodyweight
  if (currentEquipment.size === 0 && candidateEquipment.size === 0) return 100;
  
  // Current is loaded, candidate is bodyweight - lower score
  if (currentEquipment.size > 0 && candidateEquipment.size === 0) return 10;
  
  // Current is bodyweight, candidate is loaded - slightly lower
  if (currentEquipment.size === 0 && candidateEquipment.size > 0) return 20;
  
  // Both loaded - score by overlap
  let overlap = 0;
  for (const eq of candidateEquipment) {
    if (currentEquipment.has(eq)) overlap++;
  }
  
  // High overlap = better fit
  return 50 + overlap * 20;
}

/**
 * Rank and filter exercise alternatives.
 * 
 * @param current - The exercise being replaced
 * @param candidates - Pool of potential alternatives (from all relevant patterns)
 * @param ctx - Context: user level, equipment, injuries, result limit
 * @returns Ranked alternatives, deduplicated and capped at limit (default 5)
 */
export function rankAlternatives<T extends ExerciseRow>(
  current: T,
  candidates: T[],
  ctx: AlternativesContext,
): T[] {
  const limit = ctx.limit ?? 5;
  const userLevelRank = LEVEL_ORDER[ctx.level];
  const hasKneeInjury = ctx.injuryRegions.includes("knee");
  const hasPastKnee = (ctx.anyKneeInjury ?? false) && !hasKneeInjury;
  
  // Build priority order: same pattern, then fallback, then knee-safe
  // For past-knee lunge swaps, we need squat pattern (the 4-list are squat pattern)
  // PLUS hinge fallbacks for when squat-pattern options are exhausted
  // NO core pattern (QA LOW: no ab moves in lower-body fallbacks)
  let patternPriority: MovementPattern[];
  if (hasPastKnee && current.movement_pattern === "lunge") {
    patternPriority = ["lunge", "squat", "hinge"]; // Squat for 4-list, hinge for bridge/thrust fallback
  } else {
    patternPriority = buildPatternList(current.movement_pattern, ctx.anyKneeInjury ?? false);
  }
  
  // Is current a dynamic press (reps-based, not iso/plyo)?
  const isDynamicPress = 
    (current.movement_pattern === "horizontal_press" || current.movement_pattern === "vertical_press") &&
    current.metric === "reps" &&
    !isIsometric(current) &&
    current.impact !== "high";
  
  // Is current a compound pull (for pullover exclusion)?
  // Exception: if current is itself a pullover, allow pullover swaps
  const isCompoundPull =
    (current.movement_pattern === "horizontal_pull" || current.movement_pattern === "vertical_pull") &&
    current.mechanic === "compound";
  const isPulloverOriginal =
    current.name.toLowerCase().includes("pullover") || current.slug.includes("pullover");
  
  const filtered: Array<{ 
    exercise: T; 
    /** Ranked as on main but never returned (see "Subset rule" below). */
    hidden: boolean;
    patternRank: number;
    pastKneeTier: number;
    squatPriority: number;
    equipmentScore: number;
    primaryScore: number; 
    impactPenalty: number;
    genScore: number; 
    tieBreak: number 
  }> = [];
  
  for (const candidate of candidates) {
    // 1. Exclude current exercise
    if (candidate.id === current.id) continue;
    
    // 2. Exclude dangerous/problematic exercises (hard-coded exclusion set)
    if (EXCLUDED_EXERCISE_SLUGS.has(candidate.slug)) continue;
    
    // 2a. Item 14: Current knee exclusions include BOTH current-knee-only AND past-knee exclusions
    // 2b. Past-knee exclusions (pistol squats, jumps, band/chain squats, thrusters, squat-jerk)
    // 2c. Item 16: Olympic lifts excluded for beginners and injured members (same rule as generator)
    const prExcluded =
      (hasKneeInjury && (isExcludedForCurrentKneeOnly(candidate) || isExcludedForPastKnee(candidate))) ||
      (hasPastKnee && isExcludedForPastKnee(candidate)) ||
      shouldExcludeOlympicLift(candidate, { currentInjuryRegions: ctx.injuryRegions, anyKneeInjury: ctx.anyKneeInjury, level: ctx.level });
    // Subset rule: past-knee members get the new past-knee ranking, so their
    // exclusions apply before ranking. Everyone else must see main's list minus
    // the newly excluded exercises -- a strict subset, never a backfill -- so
    // for them an excluded exercise keeps its ranked slot and is dropped after
    // the limit is applied.
    if (prExcluded) continue;
    const hidden = prExcluded;
    
    // 3. Exclude pullovers when original is a compound pull
    // Pullovers are shoulder-extension moves and not appropriate substitutes
    if (isCompoundPull && !isPulloverOriginal) {
      const nameLower = candidate.name.toLowerCase();
      if (nameLower.includes("pullover") || candidate.slug.includes("pullover")) {
        continue;
      }
    }
    
    // 4. Pattern priority (lower rank = better)
    const patternRank = patternPriority.indexOf(candidate.movement_pattern);
    if (patternRank === -1) continue; // Not in our pattern list
    
    // 4b. Past-knee lunge swaps: use tier ordering for lunge-pattern candidates (allow tier > 0)
    // Item 10/Steer 2: Squat-pattern candidates allowed ONLY if in quad-isolation list (leg-extensions, wall-sit, etc.)
    if (hasPastKnee && current.movement_pattern === "lunge") {
      if (candidate.movement_pattern === "lunge") {
        if (pastKneeLungeTier(candidate) === 0) {
          continue;
        }
      } else if (candidate.movement_pattern === "squat") {
        // Only allow squat-pattern if it's in the quad-isolation list
        if (!PAST_KNEE_LUNGE_EXERCISES.has(candidate.slug)) {
          continue;
        }
      }
    }
    
    // 5. Level check: candidate level must be <= user level
    // UNLESS: past-knee tier-1 (dumbbell-rear-lunge) for beginners
    if (!isPastKneeTier1LevelExempt(candidate, ctx.anyKneeInjury ?? false, hasKneeInjury)) {
      const candidateLevelRank = LEVEL_ORDER[candidate.level_min];
      if (candidateLevelRank > userLevelRank) continue;
    }
    
    // 6. Beginners never get high-impact (plyometric) moves
    if (ctx.level === "beginner" && candidate.impact === "high") continue;
    
    // 6b. PR #73: Knee injuries exclude high-impact lower-body moves
    if ((ctx.anyKneeInjury ?? false) && candidate.impact === "high") {
      const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
      const isLowerBody = candidate.primary_muscles.some(m => lowerBodyMuscles.includes(m));
      if (isLowerBody) continue;
    }
    
    // 6c. PR #73: ANY knee injury excludes sissy squats (defense-in-depth with isEligible)
    if ((ctx.anyKneeInjury ?? false) && candidate.slug.includes("sissy")) {
      continue;
    }
    
    // 6d. QA Bot 1: For past-knee users, remove Turkish Get-Up from squat-pattern swaps
    // Turkish Get-Up involves complex movement transitions that aren't appropriate squat swaps
    if (hasPastKnee && current.movement_pattern === "squat" && 
        (candidate.slug === "kettlebell-turkish-get-up-lunge-style" || 
         candidate.slug === "kettlebell-turkish-get-up-squat-style")) {
      continue;
    }
    
    // 6e. QA Bot 1: Past-knee users filter knee-risk exercises from swaps
    // Apply the same knee predicate as generation (isKneeRiskForKneeUser)
    if (hasPastKnee) {
      // For squat→squat swaps: filter out knee-risk squats, allow only PAST_KNEE_LUNGE_EXERCISES
      if (current.movement_pattern === "squat" && candidate.movement_pattern === "squat") {
        if (isKneeRiskForKneeUser(candidate, true)) {
          if (!PAST_KNEE_LUNGE_EXERCISES.has(candidate.slug)) {
            continue;
          }
        }
      }
      // For lunge swaps: squat fallbacks must be from the allowed quad-isolation list
      // MED-3: lunge swaps must not offer normal squats
      if (current.movement_pattern === "lunge" && candidate.movement_pattern === "squat") {
        if (!PAST_KNEE_LUNGE_EXERCISES.has(candidate.slug)) {
          continue;
        }
      }
      // For hinge/bridge fallbacks in squat/lunge swaps: filter knee-risk exercises
      if ((current.movement_pattern === "squat" || current.movement_pattern === "lunge") &&
          (candidate.movement_pattern === "hinge" || candidate.movement_pattern === "core")) {
        if (isKneeRiskForKneeUser(candidate, true)) {
          continue;
        }
      }
    }
    
    // 7. For dynamic press, exclude isometric and plyometric
    if (isDynamicPress) {
      if (isIsometric(candidate)) continue;
      if (candidate.impact === "high") continue;
    }
    
    // 8. Injury filtering: exclude if any contraindicated region intersects
    if (
      candidate.contraindicated_regions.some((region) =>
        ctx.injuryRegions.includes(region)
      )
    ) {
      continue;
    }
    
    // 9. Equipment check: all-of semantics
    if (ctx.availableEquipment !== null && candidate.equipment_ids.length > 0) {
      const equipment = ctx.availableEquipment;
      const allAvailable = candidate.equipment_ids.every((id) =>
        equipment.has(id)
      );
      if (!allAvailable) continue;
    }
    
    // Scoring
    const equipmentScore = scoreEquipmentFit(current, candidate);
    
    let primaryScore = 0;
    const currentPrimaries = new Set(current.primary_muscles);
    const candidatePrimaries = new Set(candidate.primary_muscles);
    for (const muscle of candidatePrimaries) {
      if (currentPrimaries.has(muscle)) {
        primaryScore += 1;
      }
    }
    
    // Penalty for high-impact moves (e.g., Lunge Sprint)
    const impactPenalty = candidate.impact === "high" ? 1 : 0;
    
    // Past-knee lunge tier (lower = higher priority)
    const pastKneeTier = (hasPastKnee && current.movement_pattern === "lunge") 
      ? pastKneeLungeTier(candidate)
      : 999;
    
    // Item 15: Past-knee squat ordering (barbell-squat after goblet, box, bodyweight, leg-press)
    let squatPriority = 0;
    if (hasPastKnee && current.movement_pattern === "squat" && candidate.movement_pattern === "squat") {
      const preferredSquats = ["goblet-squat", "box-squat", "bodyweight-squat", "leg-press"];
      if (preferredSquats.includes(candidate.slug)) {
        squatPriority = -10; // High priority
      } else if (candidate.slug === "barbell-squat") {
        squatPriority = 10; // Lower priority (comes after preferred)
      }
    }
    
    filtered.push({ 
      exercise: candidate, 
      hidden,
      patternRank,
      pastKneeTier,
      squatPriority,
      equipmentScore,
      primaryScore,
      impactPenalty,
      genScore: ctx.scoreFn(candidate),
      tieBreak: ctx.tieBreakFn(candidate.slug),
    });
  }
  
  // Sort: pattern priority, past-knee tier, squat priority, equipment fit, primary muscle, low impact penalty, generator score, hash
  filtered.sort((a, b) => {
    // 1. Same pattern first
    if (a.patternRank !== b.patternRank) return a.patternRank - b.patternRank;
    // 2. Past-knee lunge tier (lower tier = higher priority)
    if (a.pastKneeTier !== b.pastKneeTier) return a.pastKneeTier - b.pastKneeTier;
    // 3. Item 15: Past-knee squat priority (lower = better)
    if (a.squatPriority !== b.squatPriority) return a.squatPriority - b.squatPriority;
    // 4. Equipment fit (higher = better)
    if (b.equipmentScore !== a.equipmentScore) return b.equipmentScore - a.equipmentScore;
    // 5. Primary muscle match
    if (b.primaryScore !== a.primaryScore) return b.primaryScore - a.primaryScore;
    // 6. Avoid high-impact
    if (a.impactPenalty !== b.impactPenalty) return a.impactPenalty - b.impactPenalty;
    // 7. Generator score
    if (b.genScore !== a.genScore) return b.genScore - a.genScore;
    // 8. Hash tiebreak
    return a.tieBreak - b.tieBreak;
  });
  
  // Deduplicate AFTER sorting so the best-ranked variant wins
  const seen = new Map<string, boolean>();
  const deduplicated: T[] = [];
  let slotsTaken = 0;
  
  // For past-knee squat swaps, run the class filter (quad isolation + hinge fallbacks)
  // over the FULL deduplicated candidate set, then slice to limit after reordering.
  // This ensures we get both quad isolation AND hinge fallbacks when available.
  const isPastKneeSquatSwap = hasPastKnee && current.movement_pattern === "squat";
  const effectiveLimit = isPastKneeSquatSwap ? Number.POSITIVE_INFINITY : limit;
  
  for (const item of filtered) {
    const normalizedName = normalizeName(item.exercise.name);
    const dedupeKey = `${item.exercise.movement_pattern}:${normalizedName}`;
    
    if (seen.has(dedupeKey)) continue;
    seen.set(dedupeKey, true);
    
    // A hidden (newly excluded) exercise still takes its slot: no backfill.
    slotsTaken++;
    if (!item.hidden) deduplicated.push(item.exercise);
    
    // Stop once we have enough
    if (slotsTaken >= effectiveLimit) break;
  }
  
  // Past-knee squat swaps: specific ordering per PR #152 chunk 3
  // 1. PAST_KNEE_LUNGE_EXERCISES in this exact order: leg-extensions, single-leg-leg-extension, wall-sit, spanish-squat
  //    filtered by equipment and excluding current
  //    wall-sit is never first
  // 2. Then knee-safe hinge fallbacks (glute/hamstring primary muscles only, hinge pattern)
  // Note: Other squat-pattern exercises (goblet-squat, bodyweight-squat, etc.) are excluded
  // to minimize knee load and prioritize quad isolation + hip-dominant work
  if (hasPastKnee && current.movement_pattern === "squat" && deduplicated.length > 0) {
    const quadIsolationOrder = ["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"];
    const quadIsolation: T[] = [];
    const hingeFallbacks: T[] = [];
    
    for (const ex of deduplicated) {
      if (PAST_KNEE_LUNGE_EXERCISES.has(ex.slug)) {
        quadIsolation.push(ex);
      } else if (ex.movement_pattern === "hinge") {
        // Only include genuine hip-dominant hinges/bridges (glutes or hamstrings primary)
        const hasHipDominantMuscle = ex.primary_muscles.some(m => m === "glutes" || m === "hamstrings");
        if (hasHipDominantMuscle) {
          hingeFallbacks.push(ex);
        }
      }
    }
    
    // Sort quad isolation by the specified order
    quadIsolation.sort((a, b) => {
      const aIndex = quadIsolationOrder.indexOf(a.slug);
      const bIndex = quadIsolationOrder.indexOf(b.slug);
      return aIndex - bIndex;
    });
    
    // Wall-sit is never first. If it would be first, move it after other quads or after first hinge.
    if (quadIsolation.length > 0 && quadIsolation[0].slug === "wall-sit") {
      const [wallSit, ...restQuads] = quadIsolation;
      if (restQuads.length > 0) {
        // Move wall-sit after other quad exercises
        return [...restQuads, wallSit, ...hingeFallbacks].slice(0, limit);
      } else {
        // Only wall-sit in quad list: place it after first hinge (or at end if no hinges)
        if (hingeFallbacks.length > 0) {
          return [hingeFallbacks[0], wallSit, ...hingeFallbacks.slice(1)].slice(0, limit);
        } else {
          return [wallSit];
        }
      }
    }
    
    return [...quadIsolation, ...hingeFallbacks].slice(0, limit);
  }
  
  return deduplicated;
}
